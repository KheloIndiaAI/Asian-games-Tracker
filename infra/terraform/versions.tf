terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State holds the RDS master password (rds.tf) — must be remote and
  # encrypted, never local. Bucket/table come from infra/terraform-state/
  # (apply that first). Left as a partial ("-backend-config") block so no
  # account-specific bucket name is hardcoded here; see infra/README.md.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = "cheer4bharat"
      ManagedBy = "terraform"
    }
  }
}

# ACM certificates for CloudFront must live in us-east-1 regardless of where
# everything else runs.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project   = "cheer4bharat"
      ManagedBy = "terraform"
    }
  }
}
