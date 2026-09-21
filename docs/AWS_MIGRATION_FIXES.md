# AWS Migration — Fix List

**Applies to:** branch `dev` at `3c54666` · **Owner:** _assign_ · **Related:** [`AWS_MIGRATION.md`](AWS_MIGRATION.md), [`../infra/README.md`](../infra/README.md)

The AWS migration commits (`d9a7acf`, `3c54666`) remove Supabase and add Terraform, systemd and CI. Six defects will stop the stack working in production. They must be fixed before the first `terraform apply` or deploy. The remaining items are hardening.

> **Workflow:** `dev` auto-deploys on push (`.github/workflows/deploy.yml`). Work on a feature branch (`fix/aws-blockers`), open a PR into `dev`, and merge only after the checks in §4 pass.

---

## 1. Blockers (P0)

### B1 — Postgres dates and timestamps are returned as JS `Date`
**Files:** `src/lib/pg.server.ts`
**Problem:** `postgres.js` parses `date` (OID 1082) and `timestamptz` (1184/1114) into `Date` objects, and `bigint` (20) into strings. The API code was written for Supabase, which returned strings. Effects:
- `i.start_time > nowIso` is always `false` → upcoming / next / athlete "Next" lists are empty (`app/$.ts` ~L222, L584, L595).
- `i.date_ist === today` never matches (`handleSports`).
- `/days` counts are keyed by `Date.toString()`.
- JSON returns `date_ist` as `2026-09-21T00:00:00.000Z` instead of `2026-09-21` → frontend date grouping breaks.
- `runIndiaNow` builds the feed URL `…/schedule/daily/${date_jst}` with a Date string.
- `short_id` is serialised as a string.

**Fix:** override the parsers when creating the client:
```ts
return postgres(DATABASE_URL, {
  max: 10,
  ssl: "require", // see B2
  types: {
    date:        { to: 1082, from: [1082],       serialize: (x: unknown) => String(x), parse: (x: string) => x },
    timestamptz: { to: 1184, from: [1114, 1184], serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
                   parse: (x: string) => new Date(x).toISOString() },
    int8:        { to: 20,   from: [20],         serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  },
});
```
**Done when:** a query for `date_ist, start_time, short_id` returns `"2026-09-21"`, an ISO string ending in `Z`, and a `number`. `/api/public/app/today` returns non-empty `next` while future India items exist.

### B2 — No TLS to RDS
**Files:** `src/lib/pg.server.ts`, `src/lib/db.server.ts`, `drizzle.config.ts`
**Problem:** RDS PostgreSQL 16 defaults to `rds.force_ssl = 1`. Neither the client nor `DATABASE_URL` requests SSL → every connection is rejected.
**Fix:** `ssl: "require"` in the client (above). Append `?sslmode=require` to the URL built in `infra/terraform/rds.tf` so `drizzle-kit migrate` also uses TLS. Follow-up: verify-full against the RDS CA bundle.
**Done when:** the app and `drizzle-kit migrate` connect to RDS.

### B3 — Worker cannot resolve `@/` imports in production
**Files:** `src/server/ingest-engine.ts`, `.github/workflows/deploy.yml`
**Problem:** `ingest-engine.ts` imports `@/server/feed` and `@/lib/pg.server`. The release tarball does not include `tsconfig.json`, so `tsx` cannot map `@/` → the worker crash-loops.
**Fix:** switch to relative imports (`./feed`, `../lib/pg.server`) **and** add `tsconfig.json` to the `tar` list in `deploy.yml`.
**Done when:** extract the CI artifact into an empty folder, `npm ci`, `npm run worker` starts and logs `[worker] started`.

### B4 — RDS password rotation breaks `DATABASE_URL`
**Files:** `infra/terraform/rds.tf`, `infra/terraform/ssm.tf`
**Problem:** `manage_master_user_password = true` rotates the password every 7 days by default. Terraform copies it into SSM once, so after the first rotation new connections fail. The data source also writes the password into Terraform state.
**Fix (recommended for this team size):**
- Set `manage_master_user_password = false`; generate the password with `random_password` and pass it as `password`.
- Build `DATABASE_URL` (with `sslmode=require`) from that value into SSM.
- Remove the `aws_secretsmanager_secret_version` data source and the `ReadRdsSecret` IAM statement.
- Move Terraform state to an encrypted S3 backend with DynamoDB locking (state now holds secrets).

**Done when:** `terraform plan` shows no managed master secret, and `DATABASE_URL` in SSM connects.

### B5 — Status dashboard renders blank
**Files:** `src/routes/api/public/status-data.ts`, `src/lib/db.server.ts`
**Problem:** `status-data.ts` uses Drizzle, which returns camelCase keys (`feedCalls`, `eventName`). `src/routes/status.tsx` reads snake_case (`feed_calls`, `event_name`). It also opens a second connection pool.
**Fix:** rewrite `status-data.ts` with `getSql()` raw SQL (same queries as the pre-migration version, snake_case output). Delete `src/lib/db.server.ts` once nothing imports it.
**Done when:** `/status?key=…` shows counts, the watchdog list, recent fetches and today/tomorrow rows.

### B6 — No data migration procedure
**Files:** new `infra/scripts/migrate-data.md` (runbook)
**Problem:** baseline migration `0000` runs `CREATE TABLE`. Restoring a Supabase dump first makes `drizzle-kit migrate` fail. Migrating first needs a data-only restore and sequence resets, or new match URLs collide with existing `short_id`s.
**Fix — runbook:**
1. `terraform apply` + first deploy → `drizzle-kit migrate` creates the empty schema.
2. `sudo systemctl stop cheer4bharat-worker`.
3. From the EC2 instance (SSM session), dump data only from Supabase (session-pooler connection string from Lovable Cloud):
   `pg_dump "$SUPABASE_URL" --data-only --no-owner --no-privileges --schema=public --exclude-table=app_secrets -f /tmp/data.sql`
4. Load: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/data.sql`
5. Reset sequences:
   ```sql
   SELECT setval(pg_get_serial_sequence('schedule_items','short_id'), (SELECT max(short_id) FROM schedule_items));
   SELECT setval(pg_get_serial_sequence('fetch_log','id'), (SELECT coalesce(max(id),1) FROM fetch_log));
   ```
6. Compare row counts per table between Supabase and RDS, then `systemctl start cheer4bharat-worker`.

**Done when:** row counts match and an existing match URL (`/match/…-<short_id>`) resolves on the new stack.

---

## 2. High priority (P1)

| # | Item | Files | Fix |
|---|---|---|---|
| H1 | SSR self-fetch uses the request Host; behind CloudFront that is the EC2 hostname, possibly without `:3000` | `src/lib/app-data.ts` (`requestOrigin`) | Server branch returns `` `http://127.0.0.1:${process.env.PORT ?? 3000}` `` |
| H2 | Logs never leave the instance | `infra/scripts/bootstrap-ec2.sh` | Add a CloudWatch agent config shipping journald for both units; 14-day retention |
| H3 | No ingest-freshness alarm | `src/worker/index.ts`, `infra/terraform/cloudwatch.tf` | Worker publishes `MinutesSinceLastOk` per mode (PutMetricData); alarm when `cycle` > 15 min. Add CloudFront 5xx-rate alarm (us-east-1) |
| H4 | Medals wipe on empty feed; revoked medal not removed if competitor holds another | `src/server/ingest-engine.ts` `runMedals` | Skip delete when feed is empty; delete by full key `(sport_code, event_code, competitor_key)` |
| H5 | Agent key accepted in `?key=` | `src/routes/api/public/agent/$.ts` | Header / Bearer only; confirm Sarvam tool config first |
| H6 | Ingest and agent keys compared with `!==` | `ingest.ts`, `agent/$.ts` | Use `timingSafeEqual` (as `status-auth.server.ts` does). Wrap `getIngestKey()` so a missing env var returns 401, not 500 |
| H7 | `/api/public/feed-test` is unauthenticated and interpolates `date` into the upstream path | `feed-test.ts` | Delete, or require the ingest key and validate `^\d{4}-\d{2}-\d{2}$` |
| H8 | `voice-config` returns the Sarvam key to any visitor | `voice-config.ts` | Confirm it is a restricted, origin-locked embed key; otherwise mint short-lived tokens server-side |

## 3. Medium / low (P2)

- **Worker startup burst:** every job fires at t=0 on each deploy (including the full entries fetch). Stagger initial delays; run `entries` and `sweep` on wall-clock schedule, not on start.
- **Concurrency:** add `pg_try_advisory_lock(hashtext(mode))` in `runIngestMode` so the worker and HTTP ingest route never run the same mode together.
- **Graceful shutdown:** on SIGTERM, stop scheduling, wait for in-flight jobs (≤ 60 s), then `sql.end()`.
- **Stale deploy entrypoint:** `/opt/cheer4bharat/bin/deploy.sh` is installed only at bootstrap. Make it a thin wrapper that executes the release's own `infra/scripts/deploy.sh`.
- **CloudFront:** replace legacy `forwarded_values` with a cache policy honouring origin headers + an origin-request policy.
- **OIDC:** remove the `repo:…:workflow_dispatch` sub pattern (never matches; dispatch uses the `ref` form).
- **Dead code:** delete `src/components/JeetTalk.tsx` and unused `src/components/ui/*` plus their Radix dependencies.
- **Worker runtime:** bundle the worker at build time (esbuild/tsup) instead of running `tsx` in production.

## 4. Verification before merging into `dev`

1. `npx tsc --noEmit` and `npm run lint` pass.
2. Local Postgres 16 with SSL disabled for dev (`ssl` driven by env, e.g. `PGSSLMODE`), `npm run db:migrate` on an empty DB succeeds.
3. `npm run worker` runs `cycle`, `results`, `medals`, `entries` once without errors; `fetch_log` rows have `ok = true`.
4. `npm run build && node .output/server/index.mjs`, then check:
   - `/api/public/app/today` — `date` is `YYYY-MM-DD`; `next` non-empty during the Games.
   - `/api/public/app/days` — keys are `YYYY-MM-DD`.
   - `/api/public/app/sports` — athlete counts match `SELECT sport_code, count(DISTINCT reg) FROM india_entries GROUP BY 1`.
   - `/api/public/agent/next` with header key — sensible answer.
   - `/status?key=…` — all sections populated.
5. Extract the CI tarball into a clean folder and start both services from it (catches packaging gaps like B3).
6. `terraform validate` and `terraform plan` reviewed by a second person.
