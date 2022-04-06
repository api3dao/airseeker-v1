
resource "aws_cloudwatch_log_group" "airseeker_aws_cloudwatch_log_group" {
  name              = "${local.app_name}-${var.app_environment}-logs"
  retention_in_days = 180

  tags = {
    Name = "${local.app_name}-ecs-log-group"
  }
}

resource "aws_cloudwatch_log_stream" "airseeker_aws_cloudwatch_log_stream" {
  name           = "${local.app_name}-${var.app_environment}-log-stream"
  log_group_name = aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group.name
}