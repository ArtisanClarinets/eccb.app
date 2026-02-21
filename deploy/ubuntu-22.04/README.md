# Bare-Metal Ubuntu 22.04 Deployment

This guide describes how to deploy the ECCB Platform on a fresh Ubuntu 22.04 LTS server.

## 1. Prerequisites

- Ubuntu 22.04 LTS
- Node.js v20.9.0+
- MariaDB 10.6+
- Redis 6.0+
- Nginx

### Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install common tools
sudo apt install -y curl git unzip build-essential

# Install Node.js 20 (via NVM recommended, or NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MariaDB
sudo apt install -y mariadb-server libmysqlclient-dev
sudo mysql_secure_installation

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx
```

## 2. Database Setup

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE eccb_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'eccb_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON eccb_production.* TO 'eccb_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. User & Directory Setup

```bash
# Create dedicated user
sudo adduser eccb

# Create directory structure
sudo mkdir -p /var/www/eccb
sudo chown eccb:eccb /var/www/eccb
sudo chmod 755 /var/www/eccb

# Switch to user
sudo su - eccb

# Setup directories
mkdir -p /var/www/eccb/{shared,releases,backups}
mkdir -p /var/www/eccb/shared/storage
```

## 4. Environment Configuration

Create `/var/www/eccb/shared/.env`:

```bash
# Use the example as a template
# Make sure to set DATABASE_URL, BETTER_AUTH_SECRET, etc.
DATABASE_URL="mysql://eccb_user:your_secure_password@localhost:3306/eccb_production"
# ... other vars
```

## 5. Nginx Configuration

Copy the provided config:

```bash
sudo cp deploy/ubuntu-22.04/nginx/eccb.conf /etc/nginx/sites-available/eccb
sudo ln -s /etc/nginx/sites-available/eccb /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
```

## 6. Systemd Services

Copy the provided service files:

```bash
sudo cp deploy/ubuntu-22.04/systemd/eccb-web.service /etc/systemd/system/
sudo cp deploy/ubuntu-22.04/systemd/eccb-worker.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable eccb-web eccb-worker
```

## 7. Initial Deployment

Use the deployment script:

```bash
# As eccb user
cd /var/www/eccb
# Clone the repo initially if needed or use the deploy script which handles it
# You might need to manually run the first deploy or use the script from your local machine via SSH
```

Refer to `scripts/deploy.sh` for the automated deployment process.
