data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  # Minimal user-data: install the AWS CLI (present by default on AL2023,
  # kept here as a safety net), pull the bootstrap bundle from S3, run it.
  # Deliberately has no bash ${...} of its own so it can't clash with
  # Terraform's string interpolation.
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    mkdir -p /opt/bootstrap
    aws s3 cp "s3://${aws_s3_bucket.artifacts.bucket}/bootstrap/" /opt/bootstrap/ --recursive
    chmod +x /opt/bootstrap/*.sh
    /opt/bootstrap/bootstrap-ec2.sh
  EOT
}

resource "aws_instance" "web" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.ec2_instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  key_name               = var.ssh_key_name

  # user-data only runs the FIRST bootstrap; it does not re-run on every
  # boot, and it does not deploy a release (CI does that afterwards via SSM).
  user_data                   = local.user_data
  user_data_replace_on_change = false

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  depends_on = [aws_s3_object.bootstrap]

  tags = { Name = "${var.project}-web" }
}

resource "aws_eip" "web" {
  instance = aws_instance.web.id
  domain   = "vpc"
  tags     = { Name = "${var.project}-web-eip" }
}
