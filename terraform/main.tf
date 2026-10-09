provider "aws" {
  region = "ap-south-1"   # must match what you set in `aws configure`
}
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical's official AWS account ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
resource "aws_security_group" "expense_tracker_sg" {
  name        = "expense-tracker-sg"
  description = "Allow SSH, frontend, and backend API access"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Frontend (website)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Backend API"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "expense_tracker_server" {
                  ami = data.aws_ami.ubuntu.id   # paste the AMI ID you found in Step 7
  instance_type = "t3.micro"                # free-tier eligible
  key_name               = "fa1-key"
  vpc_security_group_ids = [aws_security_group.expense_tracker_sg.id]

  tags = {
    Name = "ExpenseTrackerServer"
  }
}

output "public_ip" {
  value = aws_instance.expense_tracker_server.public_ip
}