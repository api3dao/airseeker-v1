locals {
  resource_prefix = "${var.app_name}-${var.app_environment}"
  launch_type     = "FARGATE"
  aws_ecr_url     = "https://${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "The name of the application"
  type        = string
  default     = "airseeker"
}

variable "app_environment" {
  description = "The environment of the application"
  type        = string
  default     = "dev"
}

variable "app_docker_image" {
  description = "The docker image to use"
  type        = string
  default     = "api3/airseeker:latest"
}

variable "app_config_file_path" {
  description = "The path to the configuration file"
  type        = string
  default     = "config/airseeker.json"
}

variable "app_secrets_file_path" {
  description = "The path to the secrets file"
  type        = string
  default     = "config/secrets.env"
}

variable "ecs_application_count" {
  description = "The number of services to each for each application"
  type        = string
  default     = "1"
}

variable "ecs_cpu_allocation" {
  description = "The number of CPU credits to allocate to each instance"
  type        = string
  default     = "256"
}

variable "ecs_memory_allocation" {
  description = "The amount of memory to allocate to each instance (in mb)"
  type        = string
  default     = "512"
}

variable "log_retention_period" {
  description = "The number of days to retain logs"
  type        = string
  default     = "180"
}

variable "availability_zones" {
  description = "A comma-separated list of availability zones, must match the AWS region, there will be as many subnets created as availability zones defined"
  type        = list(string)
  default     = ["us-east-1a"]
}
