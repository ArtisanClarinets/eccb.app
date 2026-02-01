#!/bin/bash

# ====================================
# Database Backup Script
# For MariaDB with rotation
# ====================================

set -e

# Configuration
BACKUP_DIR="/var/backups/eccb"
RETENTION_DAYS=30
DB_NAME="eccb_production"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/eccb_${TIMESTAMP}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}Starting database backup...${NC}"

# Read database password from secure location
if [ -f /root/.eccb_db_password ]; then
    DB_PASSWORD=$(cat /root/.eccb_db_password)
else
    echo -e "${RED}Database password file not found${NC}"
    exit 1
fi

# Create backup with compression
mariadb-dump \
    --user=eccb_user \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    "$DB_NAME" | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
    echo -e "${RED}Backup failed!${NC}"
    exit 1
fi

# Remove old backups
echo -e "${YELLOW}Cleaning up old backups (keeping last $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "eccb_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "eccb_*.sql.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo -e "${GREEN}Backup complete!${NC}"
echo -e "Total backups: $BACKUP_COUNT"
echo -e "Total size: $TOTAL_SIZE"

# Optional: Copy to remote location
# rsync -avz "$BACKUP_FILE" backup-server:/backups/eccb/
