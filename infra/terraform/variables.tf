variable "aws_region" {
  description = "Primary AWS region (Mumbai, per docs/AWS_MIGRATION.md)."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Short name used to prefix resource names."
  type        = string
  default     = "cheer4bharat"
}

variable "domain_name" {
  description = "Public domain CloudFront will serve (e.g. ag.ccki.in). Leave blank to skip ACM/CloudFront custom-domain wiring."
  type        = string
  default     = "ag.ccki.in"
}

variable "create_route53_zone" {
  description = "If true, creates a Route 53 hosted zone for domain_name and auto-validates the ACM cert through it. If false (default), DNS stays with the current registrar and Terraform only outputs the records you need to create there."
  type        = bool
  default     = false
}

variable "ec2_instance_type" {
  type    = string
  default = "t4g.small"
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "rds_backup_retention_days" {
  type    = number
  default = 7
}

variable "ssh_key_name" {
  description = "Existing EC2 key pair name, if you want a break-glass SSH fallback alongside SSM Session Manager. Leave null to disable SSH entirely (SSM only, matches the design in docs/AWS_MIGRATION.md)."
  type        = string
  default     = null
}

variable "alert_email" {
  description = "Email address subscribed to the CloudWatch alarm SNS topic."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 50
}

variable "sarvam_embed_key" {
  description = "Sarvam voice-agent API key (external, third-party). Stored as an SSM SecureString; leave blank until you have one — voice-config route degrades gracefully without it."
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the deploy role via OIDC, as \"owner/repo\"."
  type        = string
}

variable "deploy_branch" {
  description = "Branch that triggers a deploy (must match .github/workflows/deploy.yml's push trigger)."
  type        = string
  default     = "dev"
}
