# RDS PostgreSQL 16, single-AZ, private subnets, no public access.
#
# Deviation from docs/AWS_MIGRATION.md §2: the doc calls for two DB roles
# (app_rw for runtime, app_owner for migrations). Creating a second Postgres
# role requires a SQL connection to RDS, but RDS sits in a private subnet
# with no path from wherever `terraform apply` runs (your laptop or CI) —
# only the EC2 instance itself can reach it (see security_groups.tf). Rather
# than adding a bastion/NAT just to run `CREATE ROLE`, this uses a single
# master credential for both migrations and runtime queries; both already
# only ever run from the EC2 instance. Revisit if you later want tighter
# blast-radius control — e.g. have deploy.sh create app_rw once, post-migrate.
#
# Password: NOT RDS-managed. `manage_master_user_password = true` looked
# appealing (no password in Terraform state) but RDS-managed secrets can be
# rotated — by you, by a rotation schedule, or by AWS — and DATABASE_URL in
# SSM would then silently go stale until someone re-copies it. A
# `random_password` resource is fully Terraform-owned: it only changes when
# `terraform apply` changes it, so SSM (ssm.tf) never drifts out of sync
# with what RDS actually accepts. The tradeoff is the password living in
# Terraform state — see versions.tf / backend config for why state must be
# remote and encrypted (S3 + DynamoDB lock, both provisioned below).

resource "random_password" "rds_master" {
  length  = 32
  special = false # avoid characters that need extra escaping in a URL/shell
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"

  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "cheer4bharat"
  username = "app_owner"
  password = random_password.rds_master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = var.rds_backup_retention_days
  backup_window           = "17:00-17:30" # UTC ~ 22:30-23:00 IST, low-traffic
  maintenance_window      = "sun:18:00-sun:19:00"

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-db-final"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = { Name = "${var.project}-db" }
}

locals {
  # sslmode=require: RDS PostgreSQL defaults to rds.force_ssl = 1 and
  # rejects plaintext connections — this needs to be in the URL itself (not
  # just the app's own `ssl:` client option, see src/lib/pg.server.ts) so
  # drizzle-kit and psql/pg_dump (infra/scripts/migrate-data.md) also
  # connect over TLS without extra flags.
  database_url = "postgres://${aws_db_instance.main.username}:${urlencode(random_password.rds_master.result)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
}
