---
description: Enforce enterprise patterns, update schemas, and ensure security after any smart-upload modification.
applyTo: "src/**/smart-upload/**"
---

# Smart Upload Post-Change Enforcement Hook

Whenever changes are made to the smart upload system, you must run through this checklist to ensure enterprise-grade quality. Stop and fix any violations immediately.

> **Context Overview:** The smart upload subsystem spans several layers.
> Before enforcing checks, gather a recursive snapshot of related files:
> - Core logic lives in `src/lib/smart-upload` (processors, helpers, state
>   machines).
> - API endpoints are under `src/app/api/files/smart-upload` and
>   may import utilities from the core.
> - Background workers can be found in `src/workers` or similar paths; they
>   operate via BullMQ queues named `smartupload.*`.
> - UI components for manual review sit in `src/components/admin/uploads`.
> - Database schema entries include `SmartUploadSession`, `MusicPiece`,
>   `MusicFile`, and related enums in `prisma/schema.prisma`.
> - Configuration keys are defined in `src/lib/smart-upload/schema.ts` and
>   seeded in `prisma/seed.ts`.
> - Tests, fixtures, and examples may be located under `tests/smart-upload`
>   or adjacent `__tests__` folders.
>
> A recursive listing of these directories ensures you understand the full
> context before applying enforcement rules; look for imports that pull in
> helpers from outside the smart-upload namespace as well.

1. **Schema & API Synchronization**:
   - If a new setting, enum, or data field was added, ensure `prisma/schema.prisma` is updated.
   - Verify `prisma/seed.ts` is updated with default values for any new configuration keys.
   - Check that API validation (Zod schemas) in `/api/files/smart-upload` strictly matches the new data model.

2. **Security & Production Readiness**:
   - Verify that all new endpoints or admin actions are protected by appropriate RBAC permissions (e.g., `MUSIC_ADMIN`, `MUSIC_UPLOAD`).
   - Ensure rate limiting is applied to new API routes and sensitive data (like API keys or tokens) is masked in logs and responses.
   - Confirm there are no unhandled Promise rejections, floating promises, or potential memory leaks in the background workers.

3. **Migrations**:
   - If the database schema changed, ensure a migration stub is generated, or explicitly instruct the user to run `npm run db:migrate` and include the schema change.

4. **Tests & Coverage**:
   - Ensure existing tests still pass and new functionality has corresponding unit or integration tests (e.g., in `tests/smart-upload/`).

5. **Self-Documentation**:
   - Validate that the Session Changelog in `skills/smart-upload/SKILL.md` has been updated with the changes made.
