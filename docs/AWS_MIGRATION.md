# AWS Migration Plan — Cheer4Bharat

**Status:** Proposed · **Scope:** Hosting, database, scheduling, secrets, delivery · **Team size:** 2–4

This document defines how Cheer4Bharat moves from Lovable Cloud (Supabase + Cloudflare) to AWS. The target is a single EC2 instance and a single RDS PostgreSQL database, with managed AWS services used only where they remove operational work.

---

## 1. Target architecture

```
Users ──► Route 53 ──► CloudFront (ACM TLS, caching) ──► EC2 (Node 22)
                                                          ├─ web    (TanStack Start / Nitro node-server)
                                                          └─ worker (ingest scheduler)
                                                                │
                                   Elastic IP ◄─────────────────┤──► Asian Games results feed
                                                                ▼
                                                     RDS PostgreSQL 16 (private subnet)

Secrets: SSM Parameter Store + Secrets Manager (via EC2 instance role)
Ops:     CloudWatch Logs/Alarms ──► SNS email · SSM Session Manager · GitHub Actions ──► S3 ──► SSM Run Command
```

**Region:** `ap-south-1` (Mumbai).

---

## 2. Component replacement map

| Area | Current | AWS replacement | Notes |
|---|---|---|---|
| Compute | Lovable Cloud; Nitro build targets Cloudflare Workers | **EC2** `t4g.small`, Amazon Linux 2023, Node 22; Nitro `node-server` preset | `web` and `worker` run as separate systemd services |
| Build config | `@lovable.dev/vite-tanstack-config` | Project-owned `vite.config.ts` (tanstackStart, React, Tailwind, tsconfig paths, Nitro node preset) | Drop Lovable sandbox, devtools and error-logger plugins |
| Database | Supabase Postgres | **RDS for PostgreSQL 16**, `db.t4g.micro`, single-AZ, private subnet, 7-day automated backups | Master password managed by Secrets Manager |
| Data access | `supabase-js` query builder (~80 calls across `ingest.ts`, `app/$.ts`, `agent/$.ts`, `status-data.ts`, `voice-config.ts`, `status-auth.server.ts`) | **Drizzle ORM** + `postgres` driver (already in devDependencies) | Populate `drizzle/schema.ts` with real table definitions |
| Stored procedure | `.rpc("refresh_india_entered")` | Keep as SQL function, or inline the `UPDATE` | |
| Access control | RLS policies; `anon` / `authenticated` / `service_role` grants | Remove. Two DB roles: `app_rw` (runtime), `app_owner` (migrations) | Database not reachable from the internet |
| Scheduling | `pg_cron` + `pg_net` (7 recurring jobs, 16 per-day sweeps, log cleanup) | **Worker process** on EC2 (systemd timers or `node-cron`) calling ingest functions directly | RDS has no `pg_net`. Internal runs no longer need the ingest key. Alternative: EventBridge Scheduler |
| Live-job guard | SQL `WHERE EXISTS` in cron command | Same check in the worker before running `mode=live` | |
| App secrets | `app_secrets` table (`ingest_key`, `agent_key`, `status_key`, `voice_enabled`) | **SSM Parameter Store** (SecureString; `voice_enabled` as String) | Read via EC2 instance role; cache in memory |
| Environment secrets | Supabase keys in `.env`; `SARVAM_EMBED_KEY` | **Secrets Manager** (`DATABASE_URL`), **SSM** (`SARVAM_EMBED_KEY`) | Remove Supabase variables |
| Auth integration | `src/integrations/supabase/*`; `attachSupabaseAuth` in `src/start.ts` | Delete | The app has no user login |
| Error reporting | `src/lib/lovable-error-reporting.ts` | **CloudWatch Logs** (CloudWatch agent / journald) | |
| CDN | Cloudflare (honours `s-maxage`) | **CloudFront** in front of EC2 | Restrict origin security group to the CloudFront managed prefix list |
| TLS | Platform-managed | **ACM** certificate in `us-east-1` (required by CloudFront) | |
| DNS | Current provider for `ag.ccki.in` | **Route 53** hosted zone, or CNAME at current registrar | |
| Monitoring | `/status` page only | **CloudWatch alarms → SNS email** | See §5 |
| Delivery | Lovable ↔ GitHub sync | **GitHub Actions** (OIDC role) → build → **S3** artifact → **SSM Run Command** deploy | Lovable editor retired |
| Server access | — | **SSM Session Manager** | No inbound port 22 |
| Migrations | `drizzle-kit` with `LOVABLE_DB_MIGRATION_URL` | `drizzle-kit` with `DATABASE_URL`, run during deploy | New clean baseline without Supabase-specific SQL |
| Outbound feed access | Platform egress | **Elastic IP** on EC2 | Verify the results feed accepts AWS IPs before cutover |
| Voice agent | Sarvam (external) | Unchanged | Update endpoint URLs registered with Sarvam if the domain changes |
| Package manager | `bun.lock` + npm scripts | npm only | Remove `bun.lock` / `bunfig.toml` |

---

## 3. AWS services

### Core
| Service | Purpose |
|---|---|
| EC2 | Application and ingest worker |
| Elastic IP | Stable outbound IP for the results feed |
| RDS for PostgreSQL | Primary database |
| VPC | Public subnet (EC2), private subnets (RDS), security groups |
| CloudFront | CDN, TLS termination, API response caching |
| ACM | TLS certificate |
| Route 53 | DNS |
| IAM | Instance role, GitHub OIDC deploy role |
| SSM | Parameter Store, Session Manager, Run Command |
| Secrets Manager | Database credentials |
| CloudWatch | Logs, metrics, alarms |
| SNS | Alert notifications |
| S3 | Build artifacts |
| AWS Budgets | Cost alerts |

### Optional
| Service | When to add |
|---|---|
| EventBridge Scheduler | If scheduling should live outside the instance |
| AWS WAF | Rate limiting on public APIs under abuse |
| AWS Backup | Centralised backup policy / longer retention |
| ECR | If the app is packaged as a Docker image |

### Deliberately excluded
ALB, NAT Gateway, ECS/EKS, RDS Proxy, Multi-AZ. They add cost and moving parts without benefit at this scale. The design keeps EC2 in a public subnet with a locked-down security group, which avoids NAT Gateway charges entirely.

---

## 4. Scheduler job mapping

| Current cron job | Schedule | Worker equivalent |
|---|---|---|
| `ag-cycle-today` | `*/5 * * * *` | `runDay(todayJst)` |
| `ag-cycle-tomorrow` | `1-56/5 * * * *` | `runDay(todayJst + 1)` |
| `ag-results` | `2-57/5 * * * *` | `runResults(limit 25)` |
| `ag-live` | `* * * * *` (guarded) | `runResults(liveOnly)` when an India item is live or starting within 2 min / started within 20 min |
| `ag-medals` | `*/10 * * * *` | `runMedals()` |
| `ag-entries` | `0 */6 * * *` | `runEntries()` |
| `ag-sweep-MM-DD` ×16 | `30+i 0,6,12,18 * * *` | Loop over Games dates, staggered |
| `ag-fetchlog-cleanup` | `15 3 * * *` | `DELETE FROM fetch_log WHERE started_at < now() - interval '3 days'` |

The worker must prevent overlapping runs of the same mode (in-process lock or `pg_try_advisory_lock`).

---

## 5. Monitoring and alerts

| Alarm | Threshold |
|---|---|
| EC2 status check failed | Any failure, 2 consecutive minutes |
| RDS CPU | > 80% for 10 min |
| RDS free storage | < 2 GB |
| RDS connections | > 80% of max |
| Ingest freshness (custom metric) | No successful `cycle` run in 15 min, or no `live` run in 5 min while India is live |
| Worker/web process down | systemd restart loop detected in logs |
| Monthly spend | AWS Budgets threshold |

---

## 6. Migration sequence

1. **Validate feed access** from an EC2 instance on an Elastic IP.
2. **Provision** VPC, RDS, EC2, IAM roles, SSM parameters, Secrets Manager secret.
3. **Code changes:** own Vite config and Node preset; replace `supabase-js` with Drizzle; remove Supabase integration files and Lovable error reporting; add worker and scheduler; read secrets from SSM.
4. **Schema:** create a clean baseline migration (tables, indexes, `short_id` sequence, `refresh_india_entered`), no RLS/roles/cron.
5. **Data:** `pg_dump` from Supabase → `pg_restore` into RDS; reset `schedule_items_short_id_seq` to `max(short_id) + 1`.
6. **Front door:** ACM certificate, CloudFront distribution, origin security group.
7. **Delivery:** GitHub Actions workflow with OIDC, S3 artifact, SSM deploy script.
8. **Parallel run:** AWS stack ingests independently; compare `/api/public/app/today` and `/medals` against production for at least 24 h.
9. **Cutover:** lower DNS TTL, switch `ag.ccki.in`, update Sarvam endpoint URLs, disable Supabase cron jobs.
10. **Decommission** Lovable Cloud resources after a stable week.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Single EC2 / single-AZ RDS outage | CloudWatch alarms, automated RDS snapshots, documented restore runbook, AMI of configured instance |
| Results feed blocks AWS IPs | Validate in step 1 before any other work |
| Cutover during live competition | Migrate after 4 Oct 2026, or cut over only after a clean parallel run |
| Behaviour drift from query rewrite | Diff API responses between old and new stacks during parallel run |
| PostgREST 1,000-row cap masked existing bugs | Direct SQL removes the cap; verify athlete/search counts rise as expected |
