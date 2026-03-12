# PRODUCTION READINESS SWEEP

This document provides a literal, comprehensive list of all files that need to be reviewed, modified, or created to ensure 100% security and optimization in an enterprise environment. It is categorized by function.

## 1. Security Enhancements

### `src/proxy.ts`
- **Issue:** The Content Security Policy (CSP) uses `'unsafe-inline'` for `script-src` and `style-src`.
- **Action Required:** Migrate to a nonce-based CSP. Dynamic nonces should be generated per request, injected into the `script-src` and `style-src` directives, and properly forwarded to the Next.js renderer via `NextResponse.next({ request: { headers: requestHeaders } })`.

### Authorization & RBAC
These files define and enforce the Role-Based Access Control system and must be strictly reviewed for potential privilege escalation vectors.
- `src/lib/auth/config.ts`: Better Auth configuration.
- `src/lib/auth/permissions.ts`: Core permission checking logic.
- `src/lib/auth/permission-constants.ts`: Complete list of defined permissions.
- `src/hooks/use-permissions.ts`: Client-side permission enforcement.

### API Route Security
All API endpoints must be reviewed to ensure they correctly implement rate limiting, CSRF protection, and permission validation.
- `src/app/api/admin/attendance/export/route.ts`
- `src/app/api/admin/audit/export/route.ts`
- `src/app/api/admin/jobs/route.ts`
- `src/app/api/admin/members/export/route.ts`
- `src/app/api/admin/monitoring/route.ts`
- `src/app/api/admin/music/[id]/archive/route.ts`
- `src/app/api/admin/music/[id]/delete/route.ts`
- `src/app/api/admin/music/[id]/restore/route.ts`
- `src/app/api/admin/music/bulk-archive/route.ts`
- `src/app/api/admin/music/bulk-delete/route.ts`
- `src/app/api/admin/music/bulk-restore/route.ts`
- `src/app/api/admin/music/events/route.ts`
- `src/app/api/admin/music/export/route.ts`
- `src/app/api/admin/stand/status/route.ts`
- `src/app/api/admin/uploads/api-keys/route.ts`
- `src/app/api/admin/uploads/events/route.ts`
- `src/app/api/admin/uploads/model-params/route.ts`
- `src/app/api/admin/uploads/models/route.ts`
- `src/app/api/admin/uploads/providers/discover/route.ts`
- `src/app/api/admin/uploads/review/[id]/approve/route.ts`
- `src/app/api/admin/uploads/review/[id]/draft/route.ts`
- `src/app/api/admin/uploads/review/[id]/original/route.ts`
- `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/part/route.ts`
- `src/app/api/admin/uploads/review/[id]/preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/reject/route.ts`
- `src/app/api/admin/uploads/review/[id]/resplit/route.ts`
- `src/app/api/admin/uploads/review/bulk-approve/route.ts`
- `src/app/api/admin/uploads/review/bulk-reject/route.ts`
- `src/app/api/admin/uploads/review/route.ts`
- `src/app/api/admin/uploads/second-pass/route.ts`
- `src/app/api/admin/uploads/settings/reset-prompts/route.ts`
- `src/app/api/admin/uploads/settings/route.ts`
- `src/app/api/admin/uploads/settings/test/route.ts`
- `src/app/api/admin/uploads/status/[sessionId]/route.ts`
- `src/app/api/admin/users/ban/route.ts`
- `src/app/api/admin/users/delete/route.ts`
- `src/app/api/admin/users/impersonate/route.ts`
- `src/app/api/admin/users/password-reset/route.ts`
- `src/app/api/admin/users/sessions/revoke-all/route.ts`
- `src/app/api/admin/users/unban/route.ts`
- `src/app/api/assets/[id]/route.ts`
- `src/app/api/assets/route.ts`
- `src/app/api/assets/upload/route.ts`
- `src/app/api/attendance/bulk/route.ts`
- `src/app/api/attendance/event/[eventId]/member/[memberId]/route.ts`
- `src/app/api/attendance/event/[eventId]/route.ts`
- `src/app/api/attendance/member/[memberId]/route.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/email/test/route.ts`
- `src/app/api/events/rsvp/route.ts`
- `src/app/api/files/[...key]/route.ts`
- `src/app/api/files/download-url/route.ts`
- `src/app/api/files/download/[...key]/route.ts`
- `src/app/api/files/smart-upload/route.ts`
- `src/app/api/files/upload/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/me/permissions/route.ts`
- `src/app/api/members/route.ts`
- `src/app/api/sections/route.ts`
- `src/app/api/setup/repair/route.ts`
- `src/app/api/setup/route.ts`
- `src/app/api/setup/status/route.ts`
- `src/app/api/setup/verify/route.ts`
- `src/app/api/stand/annotations/[id]/route.ts`
- `src/app/api/stand/annotations/route.ts`
- `src/app/api/stand/audio-files/[...key]/route.ts`
- `src/app/api/stand/audio/[id]/route.ts`
- `src/app/api/stand/audio/route.ts`
- `src/app/api/stand/bookmarks/route.ts`
- `src/app/api/stand/config/route.ts`
- `src/app/api/stand/files/[...key]/route.ts`
- `src/app/api/stand/metadata/route.ts`
- `src/app/api/stand/navigation-links/[id]/route.ts`
- `src/app/api/stand/navigation-links/route.ts`
- `src/app/api/stand/omr/route.ts`
- `src/app/api/stand/practice-logs/[id]/route.ts`
- `src/app/api/stand/practice-logs/route.ts`
- `src/app/api/stand/preferences/route.ts`
- `src/app/api/stand/roster/route.ts`
- `src/app/api/stand/setlists/route.ts`
- `src/app/api/stand/settings/route.ts`
- `src/app/api/stand/sync/route.ts`

## 2. Optimization

### Database & ORM
These files manage database interactions and schemas. They must be reviewed for N+1 query patterns, missing indexes, and efficient aggregations.
- `prisma/schema.prisma`: Ensure appropriate indexes exist on foreign keys and frequently queried fields.
- `src/lib/db/index.ts`: Prisma client configuration and pooling.

### Services (Business Logic)
Core business logic files where heavy operations, loop optimizations, and caching strategies need strict review.
- `src/lib/services/attendance-report.service.ts`
- `src/lib/services/audit.ts`
- `src/lib/services/cms.service.ts`
- `src/lib/services/cutting-instructions.ts`
- `src/lib/services/email-template.service.ts`
- `src/lib/services/event.service.ts`
- `src/lib/services/file-upload.ts`
- `src/lib/services/header-image-segmentation.ts`
- `src/lib/services/member.service.ts`
- `src/lib/services/music.service.ts`
- `src/lib/services/ocr-fallback.ts`
- `src/lib/services/page-labeler.ts`
- `src/lib/services/part-boundary-detector.ts`
- `src/lib/services/pdf-part-detector.ts`
- `src/lib/services/pdf-renderer.ts`
- `src/lib/services/pdf-source.ts`
- `src/lib/services/pdf-splitter-adaptive.ts`
- `src/lib/services/pdf-splitter.ts`
- `src/lib/services/pdf-text-extractor.ts`
- `src/lib/services/smart-upload-cleanup.ts`
- `src/lib/services/storage-cleanup.ts`
- `src/lib/services/storage.ts`
- `src/lib/services/virus-scanner.ts`

### Server Actions
Server actions executed directly from UI components; must be reviewed for proper error boundaries, cache invalidation, and data sanitization.
- `src/app/(admin)/admin/announcements/actions.ts`
- `src/app/(admin)/admin/attendance/actions.ts`
- `src/app/(admin)/admin/audit/actions.ts`
- `src/app/(admin)/admin/communications/actions.ts`
- `src/app/(admin)/admin/communications/templates/actions.ts`
- `src/app/(admin)/admin/events/actions.ts`
- `src/app/(admin)/admin/members/actions.ts`
- `src/app/(admin)/admin/music/actions.ts`
- `src/app/(admin)/admin/pages/actions.ts`
- `src/app/(admin)/admin/roles/actions.ts`
- `src/app/(admin)/admin/roles/permissions/actions.ts`
- `src/app/(admin)/admin/settings/actions.ts`
- `src/app/(admin)/admin/users/actions.ts`
- `src/app/(member)/member/profile/actions.ts`
- `src/app/(public)/contact/actions.ts`

## 3. Configuration & Infrastructure

### Environment & Deployment
Files critical to secure deployment and correct environment configuration.
- `package.json`: Dependency versions and script definitions.
- `next.config.ts`: Next.js compiler optimizations and image domains.
- `tsconfig.json` & `tsconfig.app.json`: TypeScript strictness rules.
- `.env.example`: Expected environment variables; verify no default secrets are exposed.
- `.github/workflows/test.yml`: CI/CD pipeline definition; verify required checks block merges.
- `docker-compose.yml`: Infrastructure configuration for local/deployment services (Redis, MariaDB).

## 4. Frontend & Accessibility
Key UI components and layouts that must be reviewed for accessibility (WCAG) and responsive optimization.
- `src/components/ui/accordion.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/alert-dialog.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/alert.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/aspect-ratio.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/avatar.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/badge.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/breadcrumb.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/button-group.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/button.tsx` (and all other components in `src/components/ui/`)
- `src/components/ui/calendar.tsx` (and all other components in `src/components/ui/`)

## Summary

The platform possesses a robust foundation (Next.js 16, Prisma, Better Auth, BullMQ). To guarantee 100% production readiness for an enterprise, the exhaustive list of files above—particularly the API routes, Services, and Server Actions—must undergo rigorous manual security and performance audits. The critical middleware CSP vulnerability in `src/proxy.ts` must be addressed as described above.
