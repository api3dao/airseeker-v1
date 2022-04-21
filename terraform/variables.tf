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
}

variable "app_docker_image_version" {
  description = "The version of the docker image to use"
  type        = string
  default     = "latest"
}

variable "app_config_file_path" {
  description = "The path to the configuration file"
  type        = string
  default     = "config/airseeker.json"
}

variable "app_secrets_file_path" {
  description = "The path to the secrets file"
  type        = string
  default     = "../config/secrets.env"
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

variable "vpc_cidr_block" {
  description = "The VPC's CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "A comma-separated list of availability zones, defaults to all AZ of the region, if set to something other than the defaults, both private_subnets and public_subnets have to be defined as well"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnets" {
  description = "A list of CIDRs for private subnets in your VPC, must be set if the cidr variable is defined, needs to have as many elements as there are availability zones"
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "A list of CIDRs for public subnets in your VPC, must be set if the cidr variable is defined, needs to have as many elements as there are availability zones"
  type        = list(string)
  default     = ["10.0.100.0/24", "10.0.101.0/24", "10.0.102.0/24"]
}