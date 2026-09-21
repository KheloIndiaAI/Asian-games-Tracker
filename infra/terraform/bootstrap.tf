# Uploads the systemd units + deploy scripts to S3 so the EC2 instance's
# user-data (a tiny stub, see ec2.tf) can fetch and run them on first boot —
# before any application release has ever been deployed. deploy.sh itself
# still comes from each release's own tarball afterwards (see
# infra/scripts/deploy.sh), this copy only exists to get the box from "bare
# AL2023" to "ready for a first deploy".

locals {
  bootstrap_files = {
    "bootstrap-ec2.sh"            = "${path.module}/../scripts/bootstrap-ec2.sh"
    "deploy.sh"                   = "${path.module}/../scripts/deploy.sh"
    "render-env.sh"               = "${path.module}/../scripts/render-env.sh"
    "cheer4bharat-web.service"    = "${path.module}/../systemd/cheer4bharat-web.service"
    "cheer4bharat-worker.service" = "${path.module}/../systemd/cheer4bharat-worker.service"
    "config.json"                 = "${path.module}/../cloudwatch-agent/config.json"
    "rsyslog-cheer4bharat.conf"   = "${path.module}/../cloudwatch-agent/rsyslog-cheer4bharat.conf"
  }
}

resource "aws_s3_object" "bootstrap" {
  for_each = local.bootstrap_files

  bucket = aws_s3_bucket.artifacts.id
  key    = "bootstrap/${each.key}"
  source = each.value
  etag   = filemd5(each.value)
}
