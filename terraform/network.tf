resource "aws_vpc" "airseeker_aws_vpc" {
  cidr_block           = var.vpc_cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name        = "${var.app_name}-vpc"
    Environment = var.app_environment
  }
}

resource "aws_internet_gateway" "airseeker_aws_igw" {
  vpc_id = aws_vpc.airseeker_aws_vpc.id
  tags = {
    Name        = "${var.app_name}-igw"
    Environment = var.app_environment
  }

}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.airseeker_aws_vpc.id
  count             = length(var.private_subnets)
  cidr_block        = element(var.private_subnets, count.index)
  availability_zone = element(var.availability_zones, count.index)

  tags = {
    Name        = "${var.app_name}-private-subnet-${count.index + 1}"
    Environment = var.app_environment
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.airseeker_aws_vpc.id
  count                   = length(var.public_subnets)
  cidr_block              = element(var.public_subnets, count.index)
  availability_zone       = element(var.availability_zones, count.index)
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.app_name}-public-subnet-${count.index + 1}"
    Environment = var.app_environment
  }
}

resource "aws_eip" "airseeker_aws_eip" {
  count = length(var.private_subnets)
  vpc   = true
}

resource "aws_nat_gateway" "airseeker_aws_ngw" {
  count         = length(var.private_subnets)
  allocation_id = element(aws_eip.airseeker_aws_eip.*.id, count.index)
  subnet_id     = element(aws_subnet.public.*.id, count.index)
  depends_on    = [aws_internet_gateway.airseeker_aws_igw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.airseeker_aws_vpc.id
}

resource "aws_route" "public" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.airseeker_aws_igw.id
}


resource "aws_route_table" "private" {
  count  = length(var.private_subnets)
  vpc_id = aws_vpc.airseeker_aws_vpc.id
}

resource "aws_route" "private" {
  count                  = length(compact(var.private_subnets))
  route_table_id         = element(aws_route_table.private.*.id, count.index)
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = element(aws_nat_gateway.airseeker_aws_ngw.*.id, count.index)
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnets)
  subnet_id      = element(aws_subnet.private.*.id, count.index)
  route_table_id = element(aws_route_table.private.*.id, count.index)
}

resource "aws_route_table_association" "public" {
  count          = length(var.public_subnets)
  subnet_id      = element(aws_subnet.public.*.id, count.index)
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "airseeker_aws_security_group" {
  name        = "${local.resource_prefix}-ecs-sg"
  description = "Allow only outgoing traffic"
  vpc_id      = aws_vpc.airseeker_aws_vpc.id

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