# AWS-managed prefix list for CloudFront's origin-facing IP ranges — lets us
# allow "traffic from CloudFront" without hardcoding CIDR blocks.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "ec2" {
  name        = "${var.project}-ec2"
  description = "Cheer4Bharat web/worker EC2 instance"
  vpc_id      = aws_vpc.main.id

  # Origin traffic from CloudFront only — no direct public HTTP(S).
  ingress {
    description     = "HTTP from CloudFront"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  dynamic "ingress" {
    for_each = var.ssh_key_name == null ? [] : [1]
    content {
      description = "Break-glass SSH (only if ssh_key_name is set)"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  egress {
    description = "All outbound (feed API, SSM, Secrets Manager, S3, apt/dnf, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-ec2-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds"
  description = "Cheer4Bharat RDS Postgres — reachable only from the EC2 app instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the app instance"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-rds-sg" }
}
