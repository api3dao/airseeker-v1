data "aws_iam_policy_document" "ecs_task_exec_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com", "ecs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_exec_role" {
  name               = "${local.app_name}-${var.app_environment}-ecs-taskrole"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_exec_role.json

  tags = {
    Name        = "${local.app_name}-ecs-taskrole"
    Environment = var.app_environment
    Terraform   = "true"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_exec_role" {
  role       = aws_iam_role.ecs_task_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}