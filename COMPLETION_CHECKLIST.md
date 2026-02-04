# Completion Checklist

## Phase 0: Read & Map Spec to Work
- [x] Read ARCHITECTURE.md
- [x] Read PERMISSIONS.md
- [x] Read PLATFORM_OVERVIEW.md
- [x] Read IMPLEMENTATION_GUIDE.md
- [x] Read VISUAL_ARCHITECTURE.md
- [x] Create TRACKING file (this file)

## Phase 1: Baseline Project Hygiene
- [x] Env validation (Zod-based) (`src/lib/env.ts`)
- [x] Standardize server error handling and response shapes (Implicit in existing Next.js structure/API routes)
- [x] Add structured logger (`src/lib/logger.ts`)
- [x] Add test runner + config (Vitest)
- [x] Ensure "npm test" works

## Phase 2: Database + Prisma Alignment
- [x] Validate `prisma/schema.prisma` matches domain tables
- [x] Add missing models/relations/indexes (Schema was complete)
- [x] Create migrations (`prisma migrate dev`) (Verified locally with SQLite, code configured for Postgres)
- [x] Fix/Create idempotent seed (`prisma/seed.ts`) (Verified locally)
- [x] Seed roles (7 roles) (Verified)
- [x] Seed baseline permissions (Verified)
- [x] Seed admin user (Verified)

## Phase 3: Authentication + Identity
- [x] Better Auth config (`src/lib/auth/config.ts`)
- [x] Session handling (via Better Auth)
- [ ] Secure cookies (Better Auth default)
- [ ] Middleware route protection (verify "Proxy Pattern" compliance)
- [ ] Rate limiting for auth endpoints

## Phase 4: Authorization System
- [x] Permission format/parsing (`src/lib/auth/permissions.ts`)
- [x] Server-side helpers: `requirePermission`, `checkUserPermission`
- [ ] Server-side helpers: `hasPermission` (for client/hooks)
- [ ] Scoped permission evaluation
- [x] Permission matrix in seed
- [ ] Tests for permission evaluation
- [ ] Admin UI for assigning roles
- [ ] Admin UI for custom permissions

## Phase 5: Cross-cutting Concerns
- [ ] Audit logging service (`src/lib/services/audit.ts`) - *Schema exists*
- [ ] File storage abstraction (`src/lib/services/storage.ts`) - *File exists, need to verify content*
- [ ] Caching strategy (Redis wrapper)
- [ ] Accessibility strategy (WCAG 2.1 AA)
- [ ] Monitoring/observability (logs, error capture)

## Phase 6: Core Domains

### A) Public Content Domain
- [ ] Public site pages
- [ ] Admin/editor UI
- [ ] Asset upload
- [ ] Caching for public pages

### B) Authentication & Identity Domain
- [ ] Profile/user page

### C) Member Management Domain
- [ ] CRUD members
- [ ] Search/filter
- [ ] Section leader scoping

### D) Music Library Domain (Core)
- [ ] Catalog CRUD
- [ ] Parts/files upload & versioning
- [ ] Secure download (Signed URLs)
- [ ] Search/filter + pagination
- [ ] Librarian workflows
- [ ] Caching

### E) Events & Rehearsals Domain
- [ ] CRUD events/rehearsals
- [ ] Calendar/list views
- [ ] Attendance integration hooks

### F) Attendance Domain
- [ ] Take attendance
- [ ] Permission scopes
- [ ] Reports/export

### G) Communications Domain
- [ ] Announcements
- [ ] Email sending (Nodemailer)
- [ ] Templates

### H) Administration Domain
- [ ] User management
- [ ] Roles/permissions management
- [ ] Audit log viewer
- [ ] System settings

## Phase 7: UI/Routes Alignment
- [ ] Route structure matches VISUAL_ARCHITECTURE.md
- [ ] 403/404 handling
- [ ] Loading + Error states
- [ ] Mobile responsiveness

## Phase 8: Production Checklist
- [ ] Secure headers
- [ ] CSRF strategy
- [ ] Rate limiting
- [ ] Input validation (Zod everywhere)
- [ ] Dependency/security scripts
