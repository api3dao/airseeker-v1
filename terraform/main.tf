resource "aws_ecs_cluster" "airseeker_ecs_cluster" {
  name = "${local.resource_prefix}-ecs-cluster"
  tags = {
    Name        = "${var.app_name}-ecs-cluster"
    Environment = var.app_environment
  }

  depends_on = [aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group]
}
resource "aws_ecs_task_definition" "airseeker_ecs_task" {
  family = "${var.app_name}-ecs-task"

  container_definitions = <<DEFINITION
  [
    {
      "name": "${local.resource_prefix}-container",
      "image": "${var.app_docker_image}",
      "essential": true,
      "cpu": ${var.ecs_cpu_allocation},
      "memory": ${var.ecs_memory_allocation},
      "networkMode": "awsvpc",
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${aws_cloudwatch_log_group.airseeker_aws_cloudwatch_log_group.id}",
          "awslogs-region": "${var.aws_region}",
          "awslogs-stream-prefix": "${local.resource_prefix}"
        }
      }
    }
  ]
  DEFINITION

  requires_compatibilities = [local.launch_type]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu_allocation
  memory                   = var.ecs_memory_allocation

  execution_role_arn = aws_iam_role.ecs_task_exec_role.arn

  tags = {
    Name        = "${var.app_name}-ecs-task"
    Environment = var.app_environment
  }
}

resource "aws_ecs_service" "airkeeper_ecs_service" {
  name            = "${local.resource_prefix}-ecs-service"
  cluster         = aws_ecs_cluster.airseeker_ecs_cluster.arn
  task_definition = "${aws_ecs_task_definition.airseeker_ecs_task.family}:${aws_ecs_task_definition.airseeker_ecs_task.revision}"
  launch_type     = local.launch_type
  desired_count   = var.ecs_application_count

  network_configuration {
    subnets          = aws_subnet.private.*.id
    assign_public_ip = false
  }

  depends_on = [aws_iam_role_policy.ecs_task_exec_role_log_policy]
}