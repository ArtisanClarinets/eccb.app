## Prompt Title

Phase 3 – Metadata Normalization and Duplicate Safety

## Role

You are a data normalization and deduplication specialist with experience in music metadata.

## Objective

Implement robust metadata normalization routines and deduplication safeguards for Smart Upload. This includes canonical instrument/part taxonomy, chair/disambiguation normalization, file naming rules, hashing/fingerprinting to detect duplicates, and preserving provenance.

## Context

The existing `part-naming.ts` contains normalization logic but is not fully referenced throughout the pipeline; duplicate detection logic is sparse or absent. Uploaded parts may create duplicate MusicPieces/MusicFiles if the same score is processed twice. Chair normalization and filename slugs must be consistent across ingestion and commit paths. A fingerprint of original files may help prevent duplicate commits.

## Verified Files to Review

- `src/lib/smart-upload/part-naming.ts`
- `src/lib/services/ocr-fallback.ts` (some metadata parsing)
- `src/lib/services/part-boundary-detector.ts` (normalisation)
- `src/lib/smart-upload/commit.ts` (instrument lookups, duplicate file check)
- `src/workers/smart-upload-processor.ts` and `smart-upload-worker.ts` (use of metadata and part names)
- Tests for part naming or duplicates in `__tests__` directories.

## Files to Modify

- Enhance `part-naming.ts` with additional normalization (roman numerals, numeric chairs, duplicates, transposition inference). Export a normalization function for metadata from the first & second pass.
- Add a new module `src/lib/smart-upload/duplicates.ts` with functions:
    - `computeFileFingerprint(buffer: Buffer): string` (SHA256 or similar)
    - `isDuplicateUpload(sessionId: string, fingerprint: string): Promise<boolean>`
    - `registerFingerprint(sessionId: string, fingerprint: string): Promise<void>`
  and integrate with `SmartUploadSession` (add `fingerprint` field in schema migration and update commit logic to persist it).
- Update `prisma/schema.prisma` to add `fingerprint` field to `SmartUploadSession` and create migration.
- Modify `commit.ts` early check for existing imported file to also query fingerprint to catch duplicates across sessions.
- Update workers to compute fingerprint as soon as PDF is downloaded and store it on the session.
- Update tests to cover normalization functions and duplicate detection.

## Files to Create

- `src/lib/smart-upload/duplicates.ts`
- Update migration file for `fingerprint` column and any required indexes.

## Technical Requirements

1. **Instrument/Chair taxonomy:** Extend `normalizeInstrumentLabel` to recognise roman numerals, Arabic numerals, and common chair synonyms. Add unit tests for at least 20 varied inputs.
2. **Filename slugging:** Ensure `buildPartFilename` and `buildPartStorageSlug` handle edge cases (duplicate names, long titles). Add tests verifying max-length and invalid char stripping.
3. **Fingerprinting:** Use `crypto.createHash('sha256').update(buffer).digest('hex')`. Compute on the original PDF buffer only once. Store in session and later in MusicFile record if desired.
4. **Duplicate detection:** Before queuing processing or before commit, check for existing session/file with same fingerprint. If found and status `APPROVED` or similar, mark current session `REJECTED_DUPLICATE` and skip further work.
5. **Provenance:** When duplicates are detected, log the originating session and attach a reference in session records (add `duplicateOf?` field to schema if necessary). The commit service should not create new records and should clean up temp files.
6. **Normalization integration:** After LLM or OCR metadata extraction, pass raw instrument strings through the normalization function; update `cuttingInstructions`, `parts`, and any display strings accordingly. Add tests verifying that normalized metadata flows through to split filenames and DB records.

## Required Constraints

- Avoid computationally expensive operations on every job run; fingerprint once, reuse if retries.
- Do not change existing public APIs or database column names (use `fingerprint` new field but keep legacy support if exported to admin UI).
- Normalization must not mutate original LLM output for audit; always keep raw in session data (`firstPassRaw`, etc.).

## Edge Cases to Handle

- Very large PDFs ( >100MB ) when computing fingerprint – use streaming hash to avoid OOM.
- Slight metadata variations that should still be considered duplicates (e.g. identical score with tiny scanner noise). We will not implement fuzzy compare but may log suggestions.
- Cases where two sessions have different fingerprints but import the same piece (maybe same file across multiple formats). Duplicate detection will not catch these; document this limitation.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Add unit tests for duplicate detection and normalization (≥ 50 assertions total).
- Simulate two sessions with identical fingerprint and ensure second one is marked `REJECTED_DUPLICATE` before processing begins (create test in queue/unit tests or worker tests).
- Run integration scenario where a fingerprint collision triggers early rejection and no commit occurs.

## Expected Deliverables

- Enhanced `part-naming.ts` and new `duplicates.ts` modules with full JSDoc.
- Migration adding `fingerprint` (and optional `duplicateOf`) columns.
- Updated `commit.ts` and processors to compute/store fingerprint and check duplicates.
- Updated tests covering normalization and duplicates.

## Stop Conditions

Stop and escalate if:
- Migration for new column cannot be applied due to existing data type restrictions.
- The fingerprint algorithm slows down workers unacceptably (>500ms per file) – you must propose a caching strategy.
