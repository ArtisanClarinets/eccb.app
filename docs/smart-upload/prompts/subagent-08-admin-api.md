## Prompt Title

Phase 8 – Admin API Routes and Exception Workflow

## Role

You are a full‑stack developer with expertise in Next.js server routes and RBAC.

## Objective

Review and improve all admin API endpoints related to Smart Upload: status, events, review (approve/reject/bulk), preview, second-pass trigger, settings management, provider discovery, and model listing. Ensure permissions are correct, canonical state is exposed, and exception workflows are fully implemented.

## Context

The admin API is the bridge between the backend pipeline and the UI. It must expose truthful session data and allow administrators to intervene only on true exceptions. Current routes may not correctly check permissions (legacy names), may leak drafts or normal sessions, and the second‑pass endpoint may not exist or correctly update statuses. Inconsistent state across APIs can confuse the UI. The review routes must reuse `commitSmartUploadSessionToLibrary` and mark sessions accordingly.

## Verified Files to Review

- `src/app/api/admin/uploads/events/route.ts`
- `src/app/api/admin/uploads/status/[sessionId]/route.ts`
- `src/app/api/admin/uploads/second-pass/route.ts`
- `src/app/api/admin/uploads/review/route.ts` and nested approve/reject/bulk endpoints
- `src/app/api/admin/uploads/review/[id]/preview/route.ts` and `part-preview/route.ts`
- `src/app/api/admin/uploads/settings/*.ts` routes (existing in previous phase)
- Permission constants in `src/lib/auth/permission-constants.ts`
- `checkUserPermission` usages in admin routes.

## Files to Modify

- Ensure each admin route imports and uses the latest permission constants (`MUSIC_UPLOAD_REVIEW` or similar) and not legacy names. Add tests verifying unauthorized access is denied.
- Review status route to return the full `SmartUploadSession` object including enums, routingDecision, parsedParts, tempFiles, and fingerprint. Include `requiresHumanReview` and `commitError` fields.
- Events route should stream progress updates from the job queue or logs; verify it filters out sensitive data and handles reconnects.
- The second-pass endpoint (`/api/admin/uploads/second-pass`) should accept a session id and enqueue a second-pass job only if session`s `secondPassStatus` is `FAILED` or `NOT_NEEDED` and status is `PROCESSED` or similar. Update session `secondPassStatus` to `QUEUED` and log. Add tests.
- Review approve/reject endpoints to call `commitSmartUploadSessionToLibrary` and update session status properly. Bulk‑approve should handle arrays atomically and report successes/failures.
- Preview endpoints must download and render PDFs via `pdf-renderer` and handle permissions; ensure they respect storage security and only allow authorised users.
- Add new route `/api/admin/uploads/diagnostics/duplicate-check` (optional) to query duplicate detection library for a given fingerprint or filename.
- Add proper HTTP status codes and JSON responses consistent across endpoints.

## Files to Create

- `src/app/api/admin/uploads/second-pass/route.ts` (if missing) with permission checks and error handling.
- Tests for each modified route under corresponding `__tests__` directories; add scenarios for unauthorized users, invalid session IDs, and happy paths.

## Technical Requirements

1. **Permission Enforcement:** Use `getSession()` and `checkUserPermission()` with correct constants. Deny with 403 on failure, 401 if unauthenticated. Add unit tests mocking permission checks.
2. **State Exposure:** In status and events routes, convert enums to strings (they are anyway). Filter out sensitive fields such as API keys. Use `maskSecrets` helper if needed.
3. **Exception Routing:** For sessions flagged `requiresHumanReview`, the `/events` route should include a flag so UI can highlight them. Second-pass trigger should be accessible on flagged sessions only.
4. **Preview Security:** When serving part previews, validate that the requesting user has upload permission and that the session belongs to the correct organization if multitenant.
5. **Atomic Bulk Actions:** For bulk approve, wrap commit calls in try/catch per session and return a report array with `sessionId`, `success`, `errorMessage`.
6. **Consistency:** All admin routes must use the same JSON envelope pattern `{ success: boolean; data?: ...; error?: string }`.

## Required Constraints

- Do not expose storage URLs or raw PDF content in API responses. Previews must stream image data or base64 encoded content.
- Avoid long-running operations in synchronous routes; queue background jobs where necessary (e.g., for second pass).

## Edge Cases to Handle

- Session not found or already in a terminal state (approve/reject) – respond with 409 Conflict.
- Bulk actions where some sessions are duplicates or `COMMIT_FAILED`; handle individually.
- Rate limit second-pass endpoint to prevent spamming in case of large backlogs.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Add route tests verifying permission failures (mock `checkUserPermission` to return false).
- Integration test for second-pass endpoint: create a session with `secondPassStatus='FAILED'`, call endpoint, assert DB update and job queued.
- Test preview endpoints with invalid storage keys and unauthorized users.

## Expected Deliverables

- Revised admin API routes with correct logic and tests.
- New second-pass route and duplicate-check endpoint (if implemented) with documentation.

## Stop Conditions

Stop if an admin route requires refactoring of shared middleware not covered by this phase; escalate for architecture decision.
