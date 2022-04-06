resource "aws_ecs_cluster" "airseeker-ecs-cluster" {
  name = "${local.app_name}-${var.app_environment}-ecs-cluster"
  tags = {
    Name        = "${local.app_name}-ecs-cluster"
    Environment = var.app_environment
  }

  depends_on = [aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group]
}
resource "aws_ecs_task_definition" "airseeker-ecs-task" {
  family = "${local.app_name}-ecs-task"

  container_definitions = <<DEFINITION
  [
    {
      "name": "${local.app_name}-${var.app_environment}-container",
      "image": "docker.io/api3/airkeeper-dev:a11632d57c2c22972e8863e32cc49a004e0a622a",
      "essential": true,
      "cpu": 256,
      "memory": 512,
      "networkMode": "awsvpc",
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
            "awslogs-group": "${local.app_name}-${var.app_environment}-logs",
            "awslogs-region": "${var.aws_region}",
            "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
  DEFINITION

  requires_compatibilities = [local.launch_type]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"

  execution_role_arn = aws_iam_role.ecs_task_exec_role.arn

  tags = {
    Name        = "${local.app_name}-ecs-task"
    Environment = var.app_environment
  }
}

resource "aws_ecs_service" "airkeeper-ecs-service" {
  name                               = "${local.app_name}-${var.app_environment}-ecs-service"
  cluster                            = aws_ecs_cluster.airseeker-ecs-cluster.arn
  task_definition                    = "${aws_ecs_task_definition.airseeker-ecs-task.family}:${aws_ecs_task_definition.airseeker-ecs-task.revision}"
  launch_type                        = local.launch_type
  desired_count                      = 1
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 0

  network_configuration {
    assign_public_ip = true
    subnets          = [aws_default_subnet.default_subnet_a.id, aws_default_subnet.default_subnet_b.id, aws_default_subnet.default_subnet_c.id]
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_task_exec_role]
}