output "web_instance_id" {
  value       = aws_instance.web.id
  description = "Set as EC2_INSTANCE_ID in GitHub Actions repo variables."
}

output "web_elastic_ip" {
  value = aws_eip.web.public_ip
}

output "artifacts_bucket" {
  value       = aws_s3_bucket.artifacts.bucket
  description = "Set as S3_ARTIFACT_BUCKET in GitHub Actions repo variables."
}

output "github_actions_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Set as AWS_DEPLOY_ROLE_ARN in GitHub Actions repo variables."
}

output "cloudfront_domain_name" {
  value       = var.domain_name != "" ? aws_cloudfront_distribution.site[0].domain_name : null
  description = "CNAME your domain to this if create_route53_zone = false."
}

output "acm_certificate_validation_records" {
  value = var.domain_name == "" ? [] : [
    for dvo in aws_acm_certificate.site[0].domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
  description = "If create_route53_zone = false, create these records at your current DNS provider to validate the ACM certificate, then re-run `terraform apply` to create the CloudFront distribution."
}

output "route53_name_servers" {
  value       = var.create_route53_zone && var.domain_name != "" ? aws_route53_zone.main[0].name_servers : null
  description = "If create_route53_zone = true, delegate domain_name to these name servers at your registrar."
}

output "rds_endpoint" {
  value     = aws_db_instance.main.address
  sensitive = false
}

output "database_url_ssm_parameter" {
  value       = aws_ssm_parameter.database_url.name
  description = "SSM parameter name holding DATABASE_URL (read by infra/scripts/render-env.sh on the instance)."
}
