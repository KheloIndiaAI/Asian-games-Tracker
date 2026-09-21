# Infra

Terraform + deploy tooling for the AWS stack described in
[`docs/AWS_MIGRATION.md`](../docs/AWS_MIGRATION.md). One EC2 instance (web +
worker as separate systemd services), one RDS Postgres instance, CloudFront
in front, secrets in SSM/Secrets Manager, deploys via GitHub Actions + SSM
Run Command.

## Layout

- `terraform/` — VPC, RDS, EC2, IAM, SSM parameters, S3 artifacts bucket,
  CloudFront/ACM, CloudWatch alarms + SNS, AWS Budgets.
- `systemd/` — unit files for the `cheer4bharat-web` and `cheer4bharat-worker`
  services.
- `scripts/` — `bootstrap-ec2.sh` (first-boot setup), `deploy.sh` (what CI
  runs on every deploy via SSM), `render-env.sh` (SSM → `/etc/cheer4bharat/env`).

## First-time provisioning

1. `cd infra/terraform && terraform init`
2. `cp terraform.tfvars.example terraform.tfvars` and fill in `alert_email`
   and `github_repository`.
3. `terraform plan` then `terraform apply`. This creates everything except
   (usually) the CloudFront distribution — see the DNS step below.

   Terraform was validated here with `terraform fmt`, `terraform validate`,
   and a `terraform plan` (up to the point of needing real AWS credentials,
   which this sandbox doesn't have) — but it has **not** been applied against
   a real AWS account. Review the plan carefully before the first `apply`,
   especially the IAM policies and the RDS/EC2 sizing in `variables.tf`.

4. **DNS / ACM validation.** With the default `create_route53_zone = false`,
   `terraform apply` creates the ACM certificate but can't validate it
   automatically (nothing here controls your existing DNS). It will fail at
   the CloudFront resource until the cert is issued:
   - Run `terraform apply -target=aws_acm_certificate.site` first, or just
     let the full apply fail past that point.
   - `terraform output acm_certificate_validation_records` for the CNAME to
     create at your current DNS provider.
   - Once ACM shows the cert as "Issued" (can take a few minutes after the
     record propagates), run `terraform apply` again to create CloudFront.
   - Point `domain_name` (A/CNAME/ALIAS, per your provider) at
     `terraform output cloudfront_domain_name`.

   Set `create_route53_zone = true` instead if you want Terraform to create
   and manage a Route 53 hosted zone and do this automatically — you'll
   still need to delegate the domain to the name servers in
   `terraform output route53_name_servers` at your registrar.

5. If the account doesn't already have GitHub's OIDC provider registered
   (`iam.tf`'s `data "aws_iam_openid_connect_provider" "github"`), swap it
   for the commented-out `resource` block right below it — most AWS accounts
   only register this once, so check first (`aws iam list-open-id-connect-providers`).

6. Wire up GitHub Actions: in the repo's Settings → Secrets and variables →
   Actions, set these **repository variables** (not secrets — none of them
   are sensitive) from `terraform output`:
   - `AWS_REGION` = whatever you set `aws_region` to (default `ap-south-1`)
   - `AWS_DEPLOY_ROLE_ARN` = `github_actions_deploy_role_arn`
   - `S3_ARTIFACT_BUCKET` = `artifacts_bucket`
   - `EC2_INSTANCE_ID` = `web_instance_id`

7. Push to `main` (or run the `Deploy to AWS` workflow manually). The first
   run builds, uploads to S3, and runs `infra/scripts/deploy.sh` on the
   instance over SSM — which installs deps, renders `/etc/cheer4bharat/env`
   from SSM, runs `drizzle-kit migrate` against the fresh RDS instance, and
   starts both systemd services.

## Day 2

- Logs: `journalctl -u cheer4bharat-web -f` / `-u cheer4bharat-worker -f`
  over SSM Session Manager (`aws ssm start-session --target <instance-id>`).
- Rotate a secret: `aws ssm put-parameter --name /cheer4bharat/prod/AGENT_KEY
  --type SecureString --value <new> --overwrite`, then re-run
  `infra/scripts/render-env.sh` and restart the services (or just redeploy).
- Turn on voice: `aws ssm put-parameter --name /cheer4bharat/prod/VOICE_ENABLED
  --value true --overwrite --type String` and set `SARVAM_EMBED_KEY`
  similarly, then redeploy (both are `lifecycle { ignore_changes }` in
  Terraform so a routine `apply` won't stomp on them).
- Rollback: re-run the SSM command with an older `s3-key`
  (`releases/<previous-sha>.tar.gz`), or `ln -sfn` an older directory under
  `/opt/cheer4bharat/releases/` to `/opt/cheer4bharat/current` and restart
  the services manually.

## Deliberately not automated here

- Remote Terraform state (S3 + DynamoDB lock table). This config uses local
  state by default; if more than one person will run `terraform apply`,
  set up a remote backend before the state file grows real infrastructure.
- The "Optional" services from `docs/AWS_MIGRATION.md` §3 (EventBridge
  Scheduler, WAF, AWS Backup, ECR) — add if/when you actually need them.
- The ingest-freshness CloudWatch alarm from the doc's §5 table — it needs
  the worker to publish a custom metric, which isn't wired up yet.
