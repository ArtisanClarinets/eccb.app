## Prompt Title

Phase 5 – Main Processing Pipeline and Autonomous Workflow

## Role

You are a backend engineer with deep knowledge of LLM orchestration and long‑running job processing.

## Objective

Refactor the main upload processing pipeline for full autonomy, durability, and state safety. Ensure durable sessions, source hashing, adaptive routing to OCR/LLM, deterministic second‑pass triggers, auto‑approval eligibility, and exception routing are implemented correctly and reliably.

## Context

The `processSmartUpload` and `processSecondPass` functions in workers contain core pipeline logic. They handle download, rendering, LLM calls, segmentation, splitting, metadata updates, second‑pass and auto‑commit queues. Observed issues include: `parseStatus` not updated if first pass skipped and second pass occurs; routingDecision logic unused; manual review is default; upload route creates sessions in `PENDING_REVIEW` without processing state; deferred errors may flash UI; missing durable session hashing and idempotency when processing a session twice; incomplete exception classification leading to manual review when truly error.

## Verified Files to Review

- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`
- `src/app/api/files/smart-upload/route.ts`
- `src/lib/llm/config-loader.ts`
- `src/lib/jobs/smart-upload.ts`
- `src/lib/smart-upload/commit.ts` (for routing decisions)
- Types that define job progress and routing decisions in `src/types/smart-upload.ts`

## Files to Modify

- Add durable hashing in route `POST` (compute fingerprint, store in session) and in worker start (verify fingerprint matches, else log duplicate). Maybe unify with Phase 3 duplicates.
- In `processSmartUpload`, restructure to create an explicit `SmartUploadSession` state machine. Add intermediate statuses: `PROCESSING`, `PARSED`, `READY_TO_COMMIT`, `FAILED` etc. Update `status` and `parseStatus` fields accordingly as the pipeline progresses, ensuring update order and concurrency safety.
- Implement `routingDecision` field and use it to decide whether to enqueue second pass or auto‑commit. The decision must be persisted in session before queueing.
- Handle skip‑parse threshold: if deterministic confidence >= skipParseThreshold, mark `parseStatus = PARSED`, upload parts immediately; set routingDecision accordingly and bypass LLM segmentation.
- Add OCR routing: if text layer absent and `llm_two_pass_enabled` false, route to OCR worker and set session status to `OCR_QUEUED` or similar; after OCR result, continue pipeline.
- Ensure second pass job enqueues only when needed (routingDecision `'auto_parse_second_pass'` or `'no_parse_second_pass'`?). Update `secondPassStatus` when queued/in-progress/complete/failed.
- Auto‑approval eligibility: after final metadata compute `confidenceScore`. If >= `autoApproveThreshold` set `autoApproved=true` in session and, if config enables fully autonomous mode, queue auto‑commit.
- Exception handling: wrap pipeline steps with try/catch, classify errors into categories (`PERMISSION`, `NETWORK`, `PARSING`, `LLM`, `STORAGE` etc.) and update session with a `requiresHumanReview` flag only for true exceptions. For transient provider errors, implement exponential backoff retry inside job itself and allow queue attempts to handle others.
- Durable session truthfulness: if worker restarts mid-job, ensure session state is consistent (`PROCESSING` remains until job updates). Add `jobId` mapping or use `locking` logic to avoid duplicate processing.
- Write helper `getSmartUploadSessionOrThrow(sessionId)` with typed return value for safety.

## Files to Create

- `src/lib/smart-upload/pipeline-utils.ts` with common helpers for state transitions, routing decision logic, and error classification.
- Extend `src/types/smart-upload.ts` with new enums / interfaces e.g. `RoutingDecision` values.

## Technical Requirements

1. **State machine enforcement:** Add comments at top of `processSmartUpload` enumerating all possible transitions. Use type-safe enums and `switch`/`case` to handle each state.
2. **Fingerprint check:** early exit if fingerprint stored on session differs from computed; log and mark session `REJECTED_DUPLICATE`.
3. **Routing logic:** function `determineRoutingDecision` must cover `auto_parse_auto_approve`, `auto_parse_second_pass`, `no_parse_second_pass`, `ocr_fallback`, `manual_review`. Persist decision before any costly LLM calls.
4. **Queue triggers:** After metadata extraction, if routingDecision indicates second pass, queue job. If auto-commit, queue auto‑commit job. When queueing, include jobId field equal to sessionId to prevent duplicates.
5. **Error classification:** in each `catch`, call `classifySmartUploadError(err)` returning string and `requiresHumanReview` boolean; update session accordingly and only propagate if job should fail (let main queue handle retries). Add tests verifying classification.
6. **Idempotency:** before performing splitting or DB writes, check if session already has `parsedParts` or `status === 'PARSED'` etc and skip duplicates. When reprocessing on retry, use this guard to avoid re-upload of parts.

## Required Constraints

- Do not integrate new libraries; use existing utilities.
- Maintain separation between first‑pass and second‑pass as per Phase 4 modifications.
- Preserve existing progress notifications so admin UIs remain functional.
- Do not assume file downloads succeed; always wrap and handle streaming errors.

## Edge Cases to Handle

- Lost client response after enqueue: session should still be valid; jobId must allow cancelation or restart.
- Duplicate job delivery: worker should detect if session already HAS BEEN PROCESSED by checking `status` and exit gracefully.
- Worker restart mid-job: when job restarts it should either lock the session or skip if `status` not `PROCESSING`; include `jobId` tracking in session for debugging.
- Data race between second-pass completion and auto-commit: ensure commit only fires once by marking a `commitQueued` boolean in session.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Write unit tests for `determineRoutingDecision` covering all thresholds and config combos.
- Add integration test that runs `processSmartUpload` on a fixture PDF and asserts the session ends in correct state depending on config. Use jest/vitest with real LLM mocks if needed.
- Simulate provider timeout and verify error classification and retry logic behave as expected.

## Expected Deliverables

- Patched worker functions with state machine comments and new helpers.
- New pipeline utility module.
- Updated session creation in upload route with fingerprint and initial statuses.
- Tests covering routing and error classification.

## Stop Conditions

Stop if:
- A refactor reveals the need to redesign the data model further (e.g., splitting status and routing into separate tables); escalate to orchestrator.
- You cannot guarantee idempotency without rewriting most of commit logic; note constraints and ask to break into further phases.
