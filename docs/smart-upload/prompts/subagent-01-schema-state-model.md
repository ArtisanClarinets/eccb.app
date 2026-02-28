## Prompt Title

Phase 1 – Schema, State Model, and Canonical Types

## Role

You are a senior backend engineer specializing in database schema design and TypeScript typing.

## Objective

Review the current Smart Upload data model in Prisma/TypeScript and convert all loose string state fields into robust enums. Add missing observability fields, idempotency anchors, and validation helpers. Produce migrations and update seeds and TS types accordingly.

## Context

The `SmartUploadSession` model currently uses `parseStatus` and `secondPassStatus` fields typed as `String?` in Prisma and string aliases in TypeScript (`ParseStatus`, `SecondPassStatus` in `/src/types/smart-upload`). These values drift between workers, routes, and commit logic leading to brittle comparisons. There is also no canonical enum for `SmartUploadStatus` beyond DB; missing states like `PROCESSING`, `PARSE_FAILED`, `OCR_FALLBACK_COMPLETE`, etc. The goal is to define complete state models, ensure the database, types, and business logic are consistent, and add utility helpers for transitions.

## Verified Files to Review

- `prisma/schema.prisma` (SmartUploadSession model)
- All migrations that touched SmartUploadSession (`prisma/migrations/202602*.sql`)
- `src/types/smart-upload.ts`
- `src/workers/smart-upload-processor-worker.ts` and `smart-upload-worker.ts`
- `src/workers/ocr-worker.ts`
- `src/app/api/files/smart-upload/route.ts`
- `src/lib/smart-upload/commit.ts`
- Any tests referencing statuses (search for `parseStatus` / `secondPassStatus`).

## Files to Modify

- `prisma/schema.prisma` (add/modify enums, change fields to use enums)
- Add new migration to update existing rows and alter column types.
- `src/types/smart-upload.ts` (define enums and update interfaces)
- `src/lib/smart-upload/*` helpers (create new `state.ts` or add to existing helpers)
- All workers and routes that read/write statuses (update to use enums, ensure TS typing).
- Tests referencing string status values (update accordingly).
- `src/workers/ocr-worker.ts` (status update logic when OCR complete).
- `src/lib/jobs/smart-upload.ts` if job data uses statuses.

## Files to Create

- `src/lib/smart-upload/state.ts` (helper functions for transitions, validations)
- New migration file (use Prisma migration script) with name `convert_smart_upload_statuses`.

## Technical Requirements

1. **Prisma Enums:** Add `SmartUploadParseStatus`, `SmartUploadSecondPassStatus`, and extend `SmartUploadStatus` with values seen in code (`PENDING_REVIEW`,`PROCESSING`,`PARSED`,`PARSE_FAILED`,`OCR_FALLBACK_COMPLETE`,`QUEUED_SECOND_PASS`,`IN_PROGRESS_SECOND_PASS`,`SECOND_PASS_FAILED`,`SECOND_PASS_COMPLETE`,`AUTO_COMMIT_QUEUED`,`COMMITTING`, etc.).
2. **TypeScript Enums:** Mirror the Prisma enums in `src/types/smart-upload.ts` and reference them in all interfaces.
3. **Migration:** Write SQL to alter existing columns, migrate string values to the new enum values, and handle nulls. Add indexes if needed. Provide `down` SQL stub.
4. **Seed Alignment:** Update `prisma/seed.ts` to use new enums and add sample sessions covering each status for tests.
5. **State Helpers:** In `state.ts`, export:
   - `isParseComplete(status: SmartUploadParseStatus): boolean` etc.
   - `canAutoCommit(session: SmartUploadSession): boolean` with type-safe checks.
   - `normalizeStatuses(raw: string | null): { parseStatus: SmartUploadParseStatus; secondPassStatus: SmartUploadSecondPassStatus }` for backwards compatibility.
6. **Update Code:** Replace all string comparisons with enum references. Use TS compile to catch missing cases. Add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` only if unavoidable.
7. **Tests:** Ensure existing tests compile and update expected status values. Add new unit tests for the state helpers.

## Required Constraints

- Do _not_ change business logic or state semantics beyond renaming values and adding missing ones. Keep behavioural rewrite minimal.
- Preserve existing data by migrating carefully. Do not drop rows.
- Ensure the migration runs on MySQL (use correct syntax for altering enum types).
- Do not modify unrelated Prisma models.
- TypeScript changes must not introduce `any` or disable strict mode.

## Edge Cases to Handle

- Sessions with unknown legacy status strings (map them to `PENDING_REVIEW` and log warnings in migration).
- Null values in both status columns (treat as `PENDING_REVIEW`).
- Cases where `parseStatus` is `'PROCESSING'` while prime pipeline is still running: ensure job logic updates or tolerates the new enum.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Code compiles with `npm run build` and `mcp_type-inject_type_check`.
- Run `prisma migrate dev --name convert_smart_upload_statuses` locally and verify the generated SQL.
- Existing unit tests run and pass after updates.
- Additional tests for state helpers pass (add at least 10 assertions covering transitions and idempotency proof).
- A manual query on a seeded database shows migrated enum values.

## Expected Deliverables

- Updated `schema.prisma` with enums, new migration file, and updated `prisma/seed.ts` entries.
- `state.ts` helper module with exported functions and thorough JSDoc comments.
- All code references to statuses updated and typed.
- New unit tests for the state module.

## Stop Conditions

Pause and surface blockers if:
- The migration SQL cannot be generated or runs into MySQL limitations.
- There are shape mismatches between Prisma enums and TS enums.
- Changing a status value uncovers logic that relies on string formatting elsewhere (e.g., config keys).
- You cannot update a third‑party dependency that depends on raw status strings.
