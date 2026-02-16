# Emerald Coast Community Band Platform

A comprehensive web platform for the Emerald Coast Community Band, built with Next.js 16, React 19, and modern web technologies.

## Overview

This platform provides:

- **Public Website**: A cinematic, dynamic public-facing website with event listings, news, and contact information
- **Member Portal**: Authenticated area for band members to access music library, event calendar, and profile management
- **Admin Dashboard**: Full-featured administration panel for managing members, events, music library, communications, and site content

## Key Features

- 🎵 **Music Library Management**: Upload, organize, and distribute sheet music and audio files
- 📅 **Event Management**: Create events, track RSVPs, and manage attendance
- 👥 **Member Management**: Member profiles, sections, and role assignments
- 📧 **Communications**: Bulk email sending and announcement management
- 🔐 **Role-Based Access Control**: Fine-grained permissions with dot notation
- 📄 **CMS**: Dynamic page creation and content management
- 📊 **Reports**: Attendance and engagement analytics

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16.1.6 (App Router) |
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4.x, Radix UI |
| Database | PostgreSQL 14+ (Prisma ORM) |
| Cache/Queue | Redis 6.0+ (BullMQ) |
| Auth | Better Auth |
| Storage | Local filesystem or S3-compatible |
| Testing | Vitest |
| Animation | GSAP ScrollTrigger |

## Quick Start

### Prerequisites

- Node.js 20.x LTS
- PostgreSQL 14+
- Redis 6.0+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/eccb.app.git
cd eccb.app

# Install dependencies
npm ci

# Interactive environment setup (recommended)

# Interactive (recommended)
npm run setup

# Non-interactive (accept defaults)
# Use in scripts or CI to accept defaults: npm run setup -- --yes

# Or manual setup:
# cp .env.example .env && nano .env

# Setup database
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

The `npm run setup` command opens an interactive, guided wizard that:
- prompts for every environment variable (database, auth, storage, email, etc.) and shows current values / safe defaults,
- auto-generates strong secrets if left blank (AUTH_SECRET, BETTER_AUTH_SECRET),
- conditionally prompts S3/SMTP/ClamAV/VAPID values only when required,
- creates a timestamped backup of any existing `.env` before overwriting it,
- writes the completed `.env` and is safe to re-run (idempotent).

For production builds, `npm run build` executes `scripts/setup-admin.sh` (npm `prebuild`) to validate required variables; a masked summary is written to `./build/env-variables-check.txt` and the check is strict for non-CI production builds.


Access the application at http://localhost:3000

For detailed setup instructions, see [LOCAL_SETUP.md](./LOCAL_SETUP.md).

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint on codebase |
| `npm run test` | Run test suite |
| `npm run setup` | Interactive environment configuration (`--yes` for non-interactive) |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio GUI |

## Project Structure

```
eccb.app/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (admin)/         # Admin routes (auth + permissions required)
│   │   ├── (auth)/          # Authentication routes
│   │   ├── (member)/        # Member portal (auth required)
│   │   ├── (public)/        # Public routes
│   │   └── api/             # API endpoints
│   ├── components/          # React components
│   │   ├── admin/           # Admin-specific components
│   │   ├── auth/            # Authentication components
│   │   ├── member/          # Member portal components
│   │   ├── public/          # Public website components
│   │   └── ui/              # Shared UI components (shadcn/ui)
│   ├── lib/                 # Utilities and services
│   │   ├── auth/            # Authentication configuration
│   │   ├── jobs/            # Background job definitions
│   │   └── services/        # Business logic services
│   └── workers/             # Background job workers
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Migration files
│   └── seed.ts              # Database seed script
├── public/                  # Static assets
├── storage/                 # Local file storage
└── scripts/                 # Utility scripts
```

## Documentation

| Document | Description |
|----------|-------------|
| [LOCAL_SETUP.md](./LOCAL_SETUP.md) | Local development setup guide |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture overview |
| [PERMISSIONS.md](./PERMISSIONS.md) | Permission system documentation |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Database schema reference |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and changes |

## Deployment

The platform is designed for self-hosting on Ubuntu 22.04 LTS without Docker.

### Production Requirements

- Ubuntu 22.04 LTS server
- 2GB RAM minimum (4GB recommended)
- 20GB disk space
- Domain name (for SSL)

### Quick Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

For complete deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Security Features

- **CSRF Protection**: All state-changing operations protected
- **Rate Limiting**: Configurable limits per endpoint type
- **Secure File Upload**: Type validation, size limits, virus scanning support
- **Permission System**: Fine-grained access control with dot notation
- **Session Security**: Secure session handling with Better Auth
- **Environment Validation**: Required variables validated on startup

## Testing

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test
npx vitest run path/to/test.test.ts
```

## Contributing

1. Create a feature branch: `git checkout -b feat/description`
2. Make changes following the code style in [AGENTS.md](./AGENTS.md)
3. Run tests: `npm run test`
4. Run linting: `npm run lint`
5. Submit a pull request

## License

Copyright © 2026 Emerald Coast Community Band. All rights reserved.

## Support

For technical issues, contact the development team or create an issue in the repository.

---

**Version**: 0.1.0  
**Status**: Production Ready  
**Last Updated**: February 2026
