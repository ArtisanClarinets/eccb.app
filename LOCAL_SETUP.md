# Local Development Setup

## Infrastructure Services

All services are running locally on Ubuntu 22.04 LTS server. No cloud dependencies.

### PostgreSQL Database
- **Service:** PostgreSQL 14+
- **Database:** `eccb_platform`
- **User:** `eccb_user`
- **Password:** `eccb_local_dev_password`
- **Port:** 5432
- **Connection:** `postgresql://eccb_user:eccb_local_dev_password@localhost:5432/eccb_platform`

**Commands:**
```bash
# Check status
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql

# Connect to database
psql -h localhost -U eccb_user -d eccb_platform
```

### Redis Cache
- **Service:** Redis 6.0+
- **Port:** 6379
- **URL:** `redis://localhost:6379`

**Commands:**
```bash
# Check status
sudo systemctl status redis-server

# Test connection
redis-cli ping

# Monitor commands
redis-cli monitor
```

### MinIO S3-Compatible Storage
- **Service:** MinIO (latest)
- **API Port:** 9000
- **Console Port:** 9001
- **Bucket:** `eccb-music`
- **Access Key:** `eccb_admin`
- **Secret Key:** `eccb_local_dev_password`
- **Data Directory:** `/home/meb/minio-data`

**Commands:**
```bash
# Start MinIO (if not running)
MINIO_ROOT_USER=eccb_admin MINIO_ROOT_PASSWORD=eccb_local_dev_password \
  minio server /home/meb/minio-data --console-address ":9001" &

# Check if running
curl http://localhost:9000/minio/health/live

# Access web console
# Open: http://localhost:9001
# Login: eccb_admin / eccb_local_dev_password

# MinIO CLI commands
mc alias set local http://localhost:9000 eccb_admin eccb_local_dev_password
mc ls local/eccb-music
mc cp myfile.pdf local/eccb-music/
```

## Application Setup

### Root Directory (Public Website)
- **Framework:** React 19 + Vite
- **Port:** 5173
- **Tailwind:** v4.1.8 (upgraded from v3)

**Commands:**
```bash
cd /home/meb/eccb.app
npm install
npm run dev
```

**Access:** http://localhost:5173

### eccb-platform (Next.js Platform)
- **Framework:** Next.js 16.1.6
- **Port:** 3001 (3000 is in use)
- **Database:** PostgreSQL (via Prisma)
- **Auth:** Better Auth

**Commands:**
```bash
cd /home/meb/eccb.app/eccb-platform

# Install dependencies
npm install

# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Seed database
npx prisma db seed

# Start dev server
npm run dev
```

**Access:** http://localhost:3001

## Environment Variables

Located at: `/home/meb/eccb.app/eccb-platform/.env`

```env
# Database
DATABASE_URL="postgresql://eccb_user:eccb_local_dev_password@localhost:5432/eccb_platform?schema=public"
DIRECT_URL="postgresql://eccb_user:eccb_local_dev_password@localhost:5432/eccb_platform?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Better Auth
AUTH_SECRET="bmufv9JfSQ4piu9D4jaxYfaQ8ZoIdz85E3R9LIdIq/4="
BETTER_AUTH_SECRET="bmufv9JfSQ4piu9D4jaxYfaQ8ZoIdz85E3R9LIdIq/4="
AUTH_URL="http://localhost:3001"
BETTER_AUTH_URL="http://localhost:3001"

# MinIO S3
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET_NAME="eccb-music"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="eccb_admin"
S3_SECRET_ACCESS_KEY="eccb_local_dev_password"
S3_FORCE_PATH_STYLE="true"

# App Config
NEXT_PUBLIC_APP_URL="http://localhost:3001"
NEXT_PUBLIC_APP_NAME="Emerald Coast Community Band"
```

## Migration Status

### Completed ✅
1. **Tailwind CSS v4 Upgrade** - Root app upgraded to Tailwind v4 with CSS imports
2. **PostgreSQL Setup** - Local database installed and configured
3. **Redis Setup** - Local cache server running
4. **MinIO Setup** - Local S3-compatible storage with `eccb-music` bucket
5. **Prisma Migration** - Schema migrated from SQLite to PostgreSQL
6. **Environment Configuration** - All local service URLs configured
7. **Database Schema** - 30+ tables created and ready
8. **eccb.platform Cleanup** - Obsolete duplicate folder removed

### Next Steps 🚀
1. **Create Next.js Route Groups:**
   - `app/(public)` - Public pages (future port from Vite)
   - `app/(member)` - Member portal (requires auth)
   - `app/(admin)` - Admin dashboard (elevated permissions)
   - `app/(auth)` - Login/signup (no auth required)

2. **Port Public Sections:**
   - Start with Hero section as proof-of-concept
   - Verify GSAP animations work with `"use client"` directive
   - Migrate remaining sections (About, Events, Contact, Footer)

3. **Move eccb-platform to Root:**
   - Archive current Vite app to `legacy/`
   - Move eccb-platform contents to root
   - Update all paths and configs
   - Test unified application

4. **Production Preparation:**
   - Set up systemd services for MinIO
   - Configure PostgreSQL for production settings
   - Implement backup strategies
   - Set up monitoring and logging

## Troubleshooting

### Port Conflicts
Port 3000 is occupied. eccb-platform runs on 3001.

**Find process:**
```bash
lsof -i :3000
sudo netstat -tulpn | grep 3000
```

### Database Connection Issues
```bash
# Test connection
psql -h localhost -U eccb_user -d eccb_platform

# Reset if needed
sudo -u postgres psql -c "DROP DATABASE eccb_platform;"
sudo -u postgres psql -c "CREATE DATABASE eccb_platform;"
cd /home/meb/eccb.app/eccb-platform && npx prisma migrate dev
```

### MinIO Not Accessible
```bash
# Check if running
ps aux | grep minio

# View logs
cat /home/meb/minio.log

# Restart
pkill minio
MINIO_ROOT_USER=eccb_admin MINIO_ROOT_PASSWORD=eccb_local_dev_password \
  minio server /home/meb/minio-data --console-address ":9001" &
```

### Prisma Issues
```bash
# Regenerate client
npx prisma generate

# Reset database
npx prisma migrate reset

# View database schema
npx prisma studio
```

## Security Notes

⚠️ **Development Credentials**
Current passwords are for local development only:
- PostgreSQL: `eccb_local_dev_password`
- MinIO: `eccb_local_dev_password`

**Before production:**
1. Generate strong random passwords
2. Use environment-specific `.env` files
3. Never commit `.env` to git
4. Implement proper secrets management

## Service Persistence

### Auto-start on Boot

**PostgreSQL & Redis:** Already enabled via systemd

**MinIO:** Create systemd service
```bash
sudo nano /etc/systemd/system/minio.service
```

```ini
[Unit]
Description=MinIO
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
WorkingDirectory=/usr/local
User=meb
Group=meb
Environment="MINIO_ROOT_USER=eccb_admin"
Environment="MINIO_ROOT_PASSWORD=eccb_local_dev_password"
ExecStart=/usr/local/bin/minio server /home/meb/minio-data --console-address ":9001"
Restart=always
RestartSec=10
LimitNOFILE=65536
TasksMax=infinity
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable minio
sudo systemctl start minio
```

## Architecture Overview

```
/home/meb/eccb.app/
├── eccb-platform/          # Next.js 16 full-stack platform (port 3001)
│   ├── app/                # Next.js App Router
│   ├── prisma/             # Database schema & migrations
│   ├── lib/                # Auth, storage, utilities
│   └── .env                # Local service configuration
│
├── src/                    # React/Vite public website (port 5173)
│   ├── sections/           # Hero, About, Events, etc.
│   └── components/ui/      # Radix UI components
│
├── public/                 # Static assets
└── package.json            # Root Vite app dependencies

Local Services:
├── PostgreSQL:5432         # Database
├── Redis:6379              # Cache
└── MinIO:9000/9001         # S3-compatible storage
```

## Cost Comparison

**Previous Plan (Cloud):** ~$800/year
- Vercel Pro: $240/year
- Supabase PostgreSQL: $300/year
- Upstash Redis: $120/year
- AWS S3: $144/year

**Current Setup (Local):** $0/year
- Uses existing Ubuntu 22.04 LTS server
- All services self-hosted
- No ongoing subscription costs
- Full control and customization

## Next DevTools Integration

The project supports Next.js MCP (Model Context Protocol) for advanced development features.

**Usage:**
```bash
# Discover running Next.js servers
# (Use next-devtools MCP in Claude Desktop)

# Access at: http://localhost:3001/_next/mcp
```

MCP provides:
- Route inspection
- Error diagnostics
- Build status
- Cache management
- Component hierarchy

---

**Last Updated:** January 31, 2026
**Status:** Development environment fully operational with local infrastructure
