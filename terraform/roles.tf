data "aws_iam_policy_document" "ecs_task_exec_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
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

resource "aws_iam_role_policy_attachment" "ecs_task_exec_role_attachment" {
  role       = aws_iam_role.ecs_task_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
