locals {
  app_name    = "Airseeker"
  launch_type = "FARGATE"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "app_environment" {
  type        = string
  description = "Application Environment"
  default     = "production"
}
