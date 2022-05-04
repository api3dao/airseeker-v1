data "aws_vpc" "default_vpc" {
  default = true
}

data "aws_nat_gateway" "default_ngw" {
  vpc_id = data.aws_vpc.default_vpc.id
}

resource "aws_subnet" "airseeker_private_sn" {
  count  = length(var.availability_zones)
  vpc_id = data.aws_vpc.default_vpc.id
  # The current default VPC has the IP CIDR of 172.31.0.0/16.
  # To avoid collision with other subnets we currently have we want to start at
  # 172.31.100.0/28, subnet containing 14 IP addresses, and potentially jumping
  # in increments of that size.
  cidr_block        = cidrsubnet(data.aws_vpc.default_vpc.cidr_block, 12, 1600 + count.index)
  availability_zone = element(var.availability_zones, count.index)

  tags = {
    Name        = "${var.app_name}-private-subnet-${count.index + 1}"
    Environment = var.app_environment
  }
}

resource "aws_route_table" "airseeker_private_rt" {
  vpc_id = data.aws_vpc.default_vpc.id
}

resource "aws_route" "airseeker_private_r" {
  route_table_id         = aws_route_table.airseeker_private_rt.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = data.aws_nat_gateway.default_ngw.id
}

resource "aws_route_table_association" "airseeker_private_rta" {
  count          = length(var.availability_zones)
  subnet_id      = element(aws_subnet.airseeker_private_sn.*.id, count.index)
  route_table_id = aws_route_table.airseeker_private_rt.id
}

resource "aws_security_group" "airseeker_aws_security_group" {
  name        = "${local.resource_prefix}-ecs-sg"
  description = "Allow only outgoing traffic"
  vpc_id      = data.aws_vpc.default_vpc.id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name        = "${var.app_name}-ecs-sg"
    Environment = var.app_environment
  }
}
