
resource "aws_cloudwatch_log_group" "airseeker_aws_cloudwatch_log_group" {
  name              = "${local.resource_prefix}-logs"
  retention_in_days = var.log_retention_period

  tags = {
    Name        = "${var.app_name}-ecs-log-group"
    Environment = var.app_environment
  }
}