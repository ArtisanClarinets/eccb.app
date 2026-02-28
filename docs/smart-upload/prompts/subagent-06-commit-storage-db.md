## Prompt Title

Phase 6 – Commit, Storage, and DB Persistence

## Role

You are a transactions and storage specialist with experience in atomic operations and cleanup.

## Objective

Ensure the commit path from Smart Upload to the music library is atomic, idempotent, and storage-safe. Add precondition checks, handle existing library conflicts, and implement cleanup policies for temporary files and orphaned uploads.

## Context

`commitSmartUploadSessionToLibrary` currently wraps a Prisma transaction to create `MusicPiece`, `MusicFile`, and `MusicPart` records from a session. It performs a simple duplicate check but lacks comprehensive idempotency anchors. It also only cleans up temp files after commit and does not account for partial storage successes/rollbacks. Additionally, there is no mechanism to handle existing library conflicts (same piece title/composer but different upload). Cleanup logic is best-effort and may leave unused temp parts in storage.

## Verified Files to Review

- `src/lib/smart-upload/commit.ts`
- Storage service `src/lib/services/storage.ts` (upload/deleteFile functions)
- Workflows that call commit (admin review endpoints, auto-commit worker)
- `src/lib/services/smart-upload-cleanup.ts` (if implementation exists)
- Tests referencing commit logic (`approve` route tests)

## Files to Modify

- Update `commit.ts` to:
   - Compute and check session fingerprint from Phase 3 (prevent duplicate commit efforts).
   - Under transaction, insert or lookup existing `MusicPiece` by unique metadata (composer/title/publisher) to avoid duplicates; if found, decide whether to attach new MusicFile to existing piece or abort commit with `DUPLICATE_PIECE` status.
   - Use `tx.$transaction` with explicit try/catch to abort on any storage upload failure. Add compensation logic or rollback triggers to delete any stored parts if the transaction fails after partial upload.
   - Add `commitId` or `transactionId` field to session to record when a commit attempt occurred; prevent two commits concurrently.
   - After successful commit, update session status to `APPROVED` and add timestamps.
   - In case of commit failure, set session status to `COMMIT_FAILED` and record error details in a `commitError` field (add to schema migration).
- Expand cleanup policy: create `src/lib/services/smart-upload-cleanup.ts` if not already; implement periodic job or function to remove tempFiles older than 30 days or associated with `REJECTED`/`COMMIT_FAILED` sessions. Export a job definition to be queued by maintenance cron.
- Add additional checks in workers to delete temporary storage if a session is rejected or duplicate, not just after commit.
- Update tests to simulate partial storage failure and ensure DB transaction rolls back and no orphaned records remain.

## Files to Create

- Migration adding fields `commitError` (Json?), `commitId` (string?), and indexing them.
- New cleanup service and associated job definitions/tests.

## Technical Requirements

1. **Transaction Safety:** Use Prisma `tx.$executeRaw` only if necessary; prefer high‑level API. Wrap storage operations within the transaction using `tx.$transaction` with `transaction` object that includes a `afterCommit` callback to delete tempFiles only after commits succeed. If not natively supported, implement two-phase commit pattern: first upload parts to `staging/` path, then move them to final location inside transaction, roll back by deleting staging if tx fails.
2. **Idempotency:** Before any DB writes, check for a `musicFile` with `originalUploadId = sessionId`. If found, return early with a `CommitResult` or throw a `DuplicateCommitError` handled by caller. Use a database unique constraint on `musicFile.originalUploadId` for enforcement.
3. **Existing Library Conflict:** Implement fuzzy match on `MusicPiece` by title/composer/publisher; configurable via a `smart_upload_conflict_resolution` setting (fail/attach/ignore). Document in schema and UI.
4. **Cleanup Policy:** Use storage service to list keys under `smart-upload/{sessionId}` and remove unused keys. Add the cleanup job to `cleanup` queue with appropriate backoff. Ensure it only runs for completed sessions or those marked stale.

## Required Constraints

- Commit logic must not rely on deprecated `SmartUploadSession` statuses; use enums from Phase 1.
- Do not leak PDF buffers or file contents in logs; metrics only.
- Avoid network I/O during transactional phase: commit should write DB first then asynchronous storage cleanup, or use pre-uploaded tempFiles as earlier steps guarantee.

## Edge Cases to Handle

- Storage upload succeeds but DB transaction fails: ensure explicit cleanup or keep record of orphaned keys for later job to sweep.
- Concurrent commit attempts for same session (worker retry + manual approve): detect and abort second attempt gracefully.
- Session with `parsedParts` but some part storage keys missing due to earlier failure: do not crash, mark commit as `COMMIT_FAILED` and require manual intervention.
- Mixed partial part upload: when erasing tempFiles, handle pagination and possible 404 responses from storage.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Add unit tests that stub storage upload to throw mid‑commit and assert no DB changes.
- Add integration test for duplicate session commit and library conflict resolution.
- Verification to run the cleanup job manually and check that it deletes expected files and leaves others alone.
- Run a full pipeline from upload → processing → commit and inspect the storage bucket for expected key structure and absence of leftovers.

## Expected Deliverables

- Revised commit service with idempotency, conflict handling, and transaction safety.
- Added schema migrations and cleanup service.
- New tests verifying commit behavior, duplicate detection, and cleanup.

## Stop Conditions

Stop if:
- Transaction guard cannot prevent partial file writes due to storage API limitations (discuss alternative design with orchestrator).
- Proposed fuzzy conflict resolution logic cannot be implemented effectively; escalate for business decision.
