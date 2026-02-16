# Changelog

All notable changes to the Emerald Coast Community Band platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-14

### Production Readiness Overhaul

This release marks the completion of a comprehensive production readiness overhaul, transforming the platform from a development prototype to a production-ready application suitable for local Ubuntu 22.04 LTS hosting.

### Added

#### Permission System with Dot Notation
- Implemented permission strings using dot notation (`resource.action.scope`) per PERMISSIONS.md specification
- Added 43 permission checks across admin routes using standardized format
- Created permission constants in [`src/lib/auth/permission-constants.ts`](src/lib/auth/permission-constants.ts)
- Implemented [`usePermissions`](src/hooks/use-permissions.ts) hook for client-side permission checks
- Added permission guards: [`requirePermission`](src/lib/auth/guards.ts), [`requireAnyPermission`, `requireAllPermissions`]
- Created comprehensive permission seed data with role-based assignments

#### CSRF Protection
- Added CSRF token generation and validation in [`src/lib/csrf.ts`](src/lib/csrf.ts)
- Implemented CSRF protection for all server actions and mutation endpoints
- Added double-submit cookie pattern for stateless CSRF protection
- Created [`withCsrfProtection`](src/lib/csrf.ts) wrapper for API routes

#### Rate Limiting
- Implemented comprehensive rate limiting in [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts)
- Added configurable rate limits per endpoint type:
  - Authentication: 5 requests per 15 minutes
  - API: 100 requests per minute
  - File uploads: 10 requests per minute
  - Password reset: 3 requests per hour
- Redis-backed rate limiting with in-memory fallback
- Added rate limit headers to responses

#### Secure File Upload/Download
- Implemented secure file handling in [`src/lib/services/storage.ts`](src/lib/services/storage.ts)
- Added file type validation with allowed MIME types whitelist
- Implemented file size limits (configurable, default 50MB)
- Added secure filename generation to prevent path traversal
- Created presigned URL support for S3-compatible storage
- Added virus scanning integration (ClamAV) support
- Implemented file access control with permission checks

#### Authentication Flows
- **Forgot Password**: Complete flow with secure token generation and email delivery
- **Email Verification**: Verification flow with configurable expiration
- **Password Reset**: Secure reset flow with rate limiting
- Added email templates for all auth flows
- Implemented session management with Better Auth

#### Background Jobs with BullMQ
- Created job queue system in [`src/lib/jobs/`](src/lib/jobs/)
- Implemented job types:
  - Email sending (bulk and individual)
  - Report generation
  - File cleanup
  - Notification dispatch
- Added job scheduler for recurring tasks in [`src/workers/scheduler.ts`](src/workers/scheduler.ts)
- Created email worker in [`src/workers/email-worker.ts`](src/workers/email-worker.ts)
- Implemented job retry logic with exponential backoff

#### Structured Logging
- Created comprehensive logging system in [`src/lib/logger.ts`](src/lib/logger.ts)
- Added structured JSON logging for production
- Implemented log levels: debug, info, warn, error
- Added request ID tracking for request tracing
- Created file logger for persistent logs in [`src/lib/file-logger.ts`](src/lib/file-logger.ts)
- Added error logging utility in [`src/lib/error-logging.ts`](src/lib/error-logging.ts)
- Performance logging in [`src/lib/performance.ts`](src/lib/performance.ts)

#### Test Suite
- Created comprehensive test suite with 177 tests
- Added test utilities in [`src/lib/__tests__/test-helpers.ts`](src/lib/__tests__/test-helpers.ts)
- Created test database setup in [`src/lib/__tests__/test-db.ts`](src/lib/__tests__/test-db.ts)
- Test coverage for:
  - Permission system (unit tests)
  - Authentication flows (integration tests)
  - Storage service (unit tests)
  - Job queue (unit tests)
  - Validation schemas (unit tests)
  - Logger (unit tests)
- Configured Vitest with [`vitest.config.ts`](vitest.config.ts)

#### CI/CD with GitHub Actions
- Created GitHub Actions workflow for continuous integration
- Automated test runs on pull requests
- Automated build verification
- Added test coverage reporting
- Configured for Node.js 20.x

#### Environment Configuration
- Created comprehensive environment validation in [`src/lib/env.ts`](src/lib/env.ts)
- Added Zod schema for environment variables
- Implemented required variable validation
- Added production-specific validation rules
- Created detailed `.env.example` with documentation
- Added interactive environment setup wizard (`scripts/setup-interactive.sh`) and `npm run setup` (auto-generates secrets, conditionally prompts for optional drivers, and backs up existing `.env`).
- Added `scripts/setup-admin.sh` and configured `prebuild` to run it during `npm run build` to validate environment variables; the script writes a masked summary to `./build/env-variables-check.txt` and enforces stricter checks for non-CI production builds.

#### Health Check Endpoint
- Created health check API at [`/api/health`](src/app/api/health/route.ts)
- Checks database connectivity
- Checks Redis connectivity
- Returns system status and version info

### Changed

#### Security Improvements
- Removed hardcoded default password for super admin
- Made `SUPER_ADMIN_PASSWORD` required in production
- `prisma db:seed` now requires `SUPER_ADMIN_PASSWORD` to be set in the environment; the seeder will refuse to run without explicit root credentials (prevents accidental default/admin passwords)
- Added production environment validation
- Improved session security with Better Auth
- Enhanced file upload security

#### Permission System Migration
- Migrated all permission checks from colon notation (`resource:action`) to dot notation (`resource.action.scope`)
- Updated permission strings across all admin pages
- Updated permission strings in server actions
- Aligned implementation with PERMISSIONS.md specification

#### Documentation Updates
- Rewrote [`LOCAL_SETUP.md`](LOCAL_SETUP.md) for Ubuntu 22.04 LTS
- Rewrote [`DEPLOYMENT.md`](DEPLOYMENT.md) for non-Docker local hosting
- Updated [`README.md`](README.md) with current project state
- Created comprehensive `.env.example`

### Fixed

- Client-side permission check now properly validates against user permissions
- File download now properly checks user permissions
- Rate limiting now correctly handles Redis failures with fallback
- CSRF tokens now properly validated on all mutations
- Session handling improved for edge cases

### Security

- **CRITICAL**: Removed hardcoded default super admin password
- Added CSRF protection for all state-changing operations
- Implemented rate limiting to prevent brute force attacks
- Added secure file upload handling with type validation
- Implemented secure file download with permission checks
- Added session security enhancements

### Infrastructure

- Configured for local Ubuntu 22.04 LTS hosting
- PostgreSQL 14+ as primary database
- Redis 6.0+ for caching and job queues
- Local filesystem or S3-compatible storage
- Nginx reverse proxy with SSL termination
- Systemd service for process management

### Documentation

- [`LOCAL_SETUP.md`](LOCAL_SETUP.md): Complete local development setup guide
- [`DEPLOYMENT.md`](DEPLOYMENT.md): Production deployment guide
- [`PERMISSIONS.md`](PERMISSIONS.md): Permission system documentation
- [`ARCHITECTURE.md`](ARCHITECTURE.md): System architecture overview
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md): Database schema documentation
- [`.env.example`](.env.example): Environment configuration template

### Scripts

- [`scripts/start.ts`](scripts/start.ts): Production startup script with worker processes
- [`scripts/backup-database.sh`](scripts/backup-database.sh): Database backup script
- [`scripts/health-check.sh`](scripts/health-check.sh): Health monitoring script
- [`scripts/deploy.sh`](scripts/deploy.sh): Deployment automation script
- [`scripts/setup-ssl.sh`](scripts/setup-ssl.sh): SSL certificate setup with Certbot

### Technical Details

| Category | Count |
|----------|-------|
| Permission checks implemented | 43 |
| Test cases | 177 |
| API endpoints | 15+ |
| Admin routes | 18 |
| Member routes | 10 |
| Public routes | 10 |

### Dependencies

- Next.js 16.1.6
- React 19.2.3
- Better Auth 1.4.18
- Prisma 7.3.0
- BullMQ 5.69.1
- Zod 4.3.6
- Tailwind CSS 4.x

### Breaking Changes

- Permission strings now use dot notation - any hardcoded permission checks need updating
- `SUPER_ADMIN_PASSWORD` is now required in production environment
- CSRF tokens required on all mutation requests

### Migration Guide

For existing deployments:

1. Update permission strings from `resource:action` to `resource.action.scope`
2. Set `SUPER_ADMIN_PASSWORD` in environment
3. Run `npx prisma migrate deploy` to apply schema updates
4. Run `npm run db:seed` to update permission data
5. Update any API clients to include CSRF tokens

---

## Release Notes

### Version 0.1.0 - Production Ready

This release represents the completion of the production readiness overhaul. The platform is now suitable for deployment on Ubuntu 22.04 LTS servers with local PostgreSQL and Redis.

**Key Achievements:**
- ✅ Permission system with dot notation
- ✅ CSRF protection and rate limiting
- ✅ Secure file upload/download
- ✅ Complete auth flows (forgot password, email verification)
- ✅ Background jobs with BullMQ
- ✅ Structured logging
- ✅ 177 tests passing
- ✅ CI/CD with GitHub Actions
- ✅ Comprehensive documentation

**Deployment Status:** Ready for production deployment on Ubuntu 22.04 LTS

---

For older changes, see git commit history.
