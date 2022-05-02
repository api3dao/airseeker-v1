terraform {
  required_version = ">= 0.14.9"

  backend "s3" {
    key      = "terraform.tfstate"
    profile  = ""
    role_arn = ""
    encrypt  = "true"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.71"
    }

    docker = {
      source  = "kreuzwerker/docker"
      version = "2.16.0"
    }
  }
}