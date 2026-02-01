#!/bin/bash

# ====================================
# MinIO Installation Script
# For local S3-compatible file storage
# ====================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
MINIO_USER="minio"
MINIO_DIR="/opt/minio"
DATA_DIR="/data/minio"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -base64 24)}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  MinIO Installation Script            ${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# ====================================
# 1. Create MinIO User
# ====================================
echo -e "\n${YELLOW}[1/5] Creating MinIO user...${NC}"

if ! id "$MINIO_USER" &>/dev/null; then
    useradd -r -s /sbin/nologin "$MINIO_USER"
    echo -e "${GREEN}User $MINIO_USER created${NC}"
else
    echo -e "${GREEN}User $MINIO_USER already exists${NC}"
fi

# ====================================
# 2. Download MinIO
# ====================================
echo -e "\n${YELLOW}[2/5] Downloading MinIO...${NC}"

mkdir -p "$MINIO_DIR"

ARCH=$(uname -m)
case $ARCH in
    x86_64)
        MINIO_ARCH="amd64"
        ;;
    aarch64)
        MINIO_ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

wget -q "https://dl.min.io/server/minio/release/linux-${MINIO_ARCH}/minio" -O "$MINIO_DIR/minio"
chmod +x "$MINIO_DIR/minio"

echo -e "${GREEN}MinIO downloaded${NC}"

# ====================================
# 3. Create Data Directory
# ====================================
echo -e "\n${YELLOW}[3/5] Creating data directory...${NC}"

mkdir -p "$DATA_DIR"
chown -R "$MINIO_USER":"$MINIO_USER" "$DATA_DIR"

echo -e "${GREEN}Data directory created at $DATA_DIR${NC}"

# ====================================
# 4. Create Environment File
# ====================================
echo -e "\n${YELLOW}[4/5] Creating configuration...${NC}"

cat > /etc/default/minio << EOF
# MinIO Root Credentials
MINIO_ROOT_USER=$MINIO_ROOT_USER
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD

# MinIO Volumes
MINIO_VOLUMES="$DATA_DIR"

# MinIO Server Options
MINIO_OPTS="--address :$MINIO_PORT --console-address :$MINIO_CONSOLE_PORT"
EOF

chmod 600 /etc/default/minio

echo -e "${GREEN}Configuration created${NC}"

# ====================================
# 5. Create Systemd Service
# ====================================
echo -e "\n${YELLOW}[5/5] Creating systemd service...${NC}"

cat > /etc/systemd/system/minio.service << EOF
[Unit]
Description=MinIO Object Storage
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target

[Service]
User=$MINIO_USER
Group=$MINIO_USER
EnvironmentFile=/etc/default/minio
ExecStart=$MINIO_DIR/minio server \$MINIO_VOLUMES \$MINIO_OPTS
Restart=always
RestartSec=10
LimitNOFILE=65536

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable minio
systemctl start minio

# Wait for MinIO to start
sleep 3

# ====================================
# 6. Download MinIO Client
# ====================================
echo -e "\n${YELLOW}Installing MinIO client...${NC}"

wget -q "https://dl.min.io/client/mc/release/linux-${MINIO_ARCH}/mc" -O /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configure mc
mc alias set local http://localhost:$MINIO_PORT $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD --api S3v4

# Create bucket for the application
mc mb local/eccb-files --ignore-existing
mc anonymous set download local/eccb-files/public

echo -e "${GREEN}MinIO client installed and configured${NC}"

# ====================================
# Summary
# ====================================
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  MinIO Installation Complete!         ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "MinIO Server: http://localhost:$MINIO_PORT"
echo -e "MinIO Console: http://localhost:$MINIO_CONSOLE_PORT"
echo -e ""
echo -e "Credentials:"
echo -e "  Username: $MINIO_ROOT_USER"
echo -e "  Password: $MINIO_ROOT_PASSWORD"
echo -e ""
echo -e "Bucket: eccb-files"
echo -e ""
echo -e "Add these to your .env file:"
echo -e "  S3_ENDPOINT=http://localhost:$MINIO_PORT"
echo -e "  S3_ACCESS_KEY=$MINIO_ROOT_USER"
echo -e "  S3_SECRET_KEY=$MINIO_ROOT_PASSWORD"
echo -e "  S3_BUCKET=eccb-files"
echo -e "  S3_REGION=us-east-1"
echo -e ""
echo -e "${YELLOW}Credentials saved to /etc/default/minio${NC}"
