# ACM cert (must be us-east-1 for CloudFront) + CloudFront distribution in
# front of the EC2 origin, terminating TLS at the edge. Origin traffic is
# plain HTTP to the EC2 Elastic IP on port 3000 — fine since it never leaves
# AWS's network, and it's what security_groups.tf's CloudFront-prefix-list
# rule expects.

resource "aws_acm_certificate" "site" {
  count             = var.domain_name == "" ? 0 : 1
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_zone" "main" {
  count = var.create_route53_zone && var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

resource "aws_route53_record" "acm_validation" {
  for_each = var.create_route53_zone && var.domain_name != "" ? {
    for dvo in aws_acm_certificate.site[0].domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  } : {}

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "site" {
  count                   = var.create_route53_zone && var.domain_name != "" ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

resource "aws_cloudfront_distribution" "site" {
  count   = var.domain_name == "" ? 0 : 1
  enabled = true
  aliases = [var.domain_name]

  origin {
    domain_name = aws_eip.web.public_dns
    origin_id   = "ec2-origin"
    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # API responses set their own Cache-Control (see src/routes/api/public/*);
    # honour it instead of a CloudFront-managed policy overriding s-maxage.
    forwarded_values {
      query_string = true
      headers      = ["Accept", "Accept-Language", "Origin"]
      cookies {
        forward = "none"
      }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.site[0].arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.project}-cdn" }
}

resource "aws_route53_record" "site" {
  count   = var.create_route53_zone && var.domain_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}
