
resource "aws_cloudwatch_log_group" "airseeker_aws_cloudwatch_log_group" {
  name              = "${local.resource_prefix}-logs"
  retention_in_days = var.log_retention_period

  tags = {
    Name        = "${var.app_name}-ecs-log-group"
    Environment = var.app_environment
  }
}

resource "aws_cloudwatch_log_stream" "airseeker_aws_cloudwatch_log_stream" {
  name           = "${local.resource_prefix}-log-stream"
  log_group_name = aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group.name
}