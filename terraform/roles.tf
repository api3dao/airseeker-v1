data "aws_iam_policy_document" "ecs_task_exec_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "cloudwatch_log_policy" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group.arn}:*"]
  }
}

resource "aws_iam_role" "ecs_task_exec_role" {
  name               = "${local.resource_prefix}-ecs-taskrole"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_exec_role_policy.json

  tags = {
    Name        = "${var.app_name}-ecs-taskrole"
    Environment = var.app_environment
  }
}

resource "aws_iam_role_policy" "ecs_task_exec_role_log_policy" {
  name   = "${local.resource_prefix}-log-policy"
  role   = aws_iam_role.ecs_task_exec_role.id
  policy = data.aws_iam_policy_document.cloudwatch_log_policy.json
}