# App configuration/secrets, read by infra/scripts/render-env.sh on the EC2
# instance (via its instance role) into /etc/cheer4bharat/env, which systemd
# loads for both the web and worker services. Replaces the old app_secrets
# table.

resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.project}/prod/DATABASE_URL"
  type  = "SecureString"
  value = local.database_url
}

resource "random_password" "ingest_key" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "ingest_key" {
  name  = "/${var.project}/prod/INGEST_KEY"
  type  = "SecureString"
  value = random_password.ingest_key.result
}

resource "random_password" "agent_key" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "agent_key" {
  name  = "/${var.project}/prod/AGENT_KEY"
  type  = "SecureString"
  value = random_password.agent_key.result
}

resource "random_password" "status_key" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "status_key" {
  name  = "/${var.project}/prod/STATUS_KEY"
  type  = "SecureString"
  value = random_password.status_key.result
}

resource "aws_ssm_parameter" "voice_enabled" {
  name  = "/${var.project}/prod/VOICE_ENABLED"
  type  = "String"
  value = "false"

  lifecycle {
    # Flip this in the console/CLI when you're ready to launch voice — don't
    # let a routine `terraform apply` silently turn it back off.
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "sarvam_embed_key" {
  name  = "/${var.project}/prod/SARVAM_EMBED_KEY"
  type  = "SecureString"
  value = var.sarvam_embed_key != "" ? var.sarvam_embed_key : "unset"

  lifecycle {
    ignore_changes = [value]
  }
}
