# RDS PostgreSQL 16, single-AZ, private subnets, no public access. Credentials
# are RDS-managed (auto-generated, rotatable) via Secrets Manager rather than
# a Terraform variable, so the password never appears in state as plaintext
# or in a .tfvars file.
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

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"

  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name                     = "cheer4bharat"
  username                    = "app_owner"
  manage_master_user_password = true

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

data "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = aws_db_instance.main.master_user_secret[0].secret_arn
}

locals {
  rds_credentials = jsondecode(data.aws_secretsmanager_secret_version.rds_master.secret_string)
  database_url    = "postgres://${local.rds_credentials.username}:${urlencode(local.rds_credentials.password)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
}
