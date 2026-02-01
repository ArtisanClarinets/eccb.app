# Emerald Coast Community Band - Production Deployment Guide

This guide covers deploying the ECCB application to a bare-metal Ubuntu 22.04 LTS server.

## Prerequisites

- Ubuntu 22.04 LTS server with root access
- Domain name pointed to server IP
- At least 2GB RAM, 20GB disk space
- SSH access to server

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/eccb.app.git
cd eccb.app

# 2. Make scripts executable
chmod +x scripts/*.sh

# 3. Run initial server setup (as root)
sudo ./scripts/deploy-setup.sh

# 4. Install MinIO for file storage
sudo ./scripts/install-minio.sh

# 5. Configure environment
cp .env.example .env
nano .env  # Edit with your values

# 6. Deploy the application
./scripts/deploy.sh

# 7. Setup SSL certificate
sudo ./scripts/setup-ssl.sh your-domain.com admin@your-domain.com
```

## Detailed Setup

### 1. Server Setup (`deploy-setup.sh`)

This script installs and configures:
- Node.js 20 LTS via NodeSource
- pnpm package manager
- MariaDB database server
- Redis cache server
- Nginx reverse proxy
- UFW firewall
- fail2ban intrusion prevention
- systemd service for the application

**After running:**
- Database credentials are saved to `/root/.eccb_db_password`
- MariaDB is configured with secure defaults
- Nginx is configured for the application

### 2. MinIO Setup (`install-minio.sh`)

MinIO provides S3-compatible object storage for:
- Music file uploads (PDF, MP3, MIDI)
- Profile images
- Document storage

**Endpoints:**
- API: `http://localhost:9000`
- Console: `http://localhost:9001`

### 3. Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Database - use password from /root/.eccb_db_password
DATABASE_URL="mysql://eccb_user:PASSWORD@localhost:3306/eccb_production"

# Auth - generate a secure secret
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
BETTER_AUTH_URL="https://your-domain.com"

# S3/MinIO - from install-minio.sh output
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="your-minio-password"

# SMTP - your email provider settings
SMTP_HOST="smtp.your-provider.com"
SMTP_USER="your-email@domain.com"
SMTP_PASSWORD="your-password"
```

### 4. Application Deployment (`deploy.sh`)

Features:
- Zero-downtime deployments
- Automatic backup before deploy
- Git-based releases
- Symlink switching
- Health checks
- Automatic cleanup of old releases

**Release structure:**
```
/var/www/eccb/
├── current -> releases/20240131_120000
├── releases/
│   ├── 20240131_120000/
│   └── 20240130_150000/
├── shared/
│   └── .env
└── backups/
```

### 5. SSL Setup (`setup-ssl.sh`)

Configures:
- Let's Encrypt certificate via Certbot
- Nginx HTTPS configuration
- Auto-renewal via cron
- Security headers (HSTS, CSP, etc.)

## Operations

### Deploy Updates

```bash
# Pull latest and deploy
cd /var/www/eccb/repo
git pull
./scripts/deploy.sh
```

### Database Backup

```bash
# Manual backup
sudo ./scripts/backup-database.sh

# Backups are stored in /var/backups/eccb/
```

### Health Check

```bash
# Check all services
./scripts/health-check.sh

# API endpoint
curl https://your-domain.com/api/health
```

### View Logs

```bash
# Application logs
journalctl -u eccb -f

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

### Restart Services

```bash
# Application
sudo systemctl restart eccb

# All services
sudo systemctl restart eccb mariadb redis-server minio nginx
```

## Cron Jobs

Add to root crontab (`sudo crontab -e`):

```cron
# Database backup daily at 2 AM
0 2 * * * /var/www/eccb/repo/scripts/backup-database.sh >> /var/log/eccb-backup.log 2>&1

# Health check every 5 minutes
*/5 * * * * /var/www/eccb/repo/scripts/health-check.sh >> /var/log/eccb-health.log 2>&1

# Clear old sessions weekly
0 3 * * 0 redis-cli FLUSHDB
```

## Security Checklist

- [ ] SSH key-only authentication enabled
- [ ] UFW firewall active (ports 22, 80, 443 only)
- [ ] fail2ban installed and running
- [ ] SSL certificate installed
- [ ] Database password is strong and unique
- [ ] `.env` file has restricted permissions (600)
- [ ] Regular backups configured
- [ ] Security updates enabled (`unattended-upgrades`)

## Troubleshooting

### Application won't start

```bash
# Check service status
systemctl status eccb

# Check logs
journalctl -u eccb -n 50 --no-pager

# Verify environment
cat /var/www/eccb/shared/.env
```

### Database connection errors

```bash
# Test connection
mariadb -u eccb_user -p eccb_production

# Check MariaDB status
systemctl status mariadb
```

### Redis connection errors

```bash
# Test connection
redis-cli ping

# Check Redis status
systemctl status redis-server
```

### File upload issues

```bash
# Check MinIO status
systemctl status minio

# Test MinIO
mc admin info local
```

### SSL certificate issues

```bash
# Test renewal
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Internet                         │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                  Nginx (SSL/Proxy)                   │
│                    Port 80, 443                      │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│               Next.js Application                    │
│                    Port 3000                         │
└───────┬─────────────────┬─────────────────┬─────────┘
        │                 │                 │
┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
│   MariaDB     │ │     Redis     │ │     MinIO     │
│   Port 3306   │ │   Port 6379   │ │   Port 9000   │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Support

For issues with the deployment, check:
1. Service logs (`journalctl`)
2. Nginx error logs
3. Application health endpoint
4. Database connectivity
