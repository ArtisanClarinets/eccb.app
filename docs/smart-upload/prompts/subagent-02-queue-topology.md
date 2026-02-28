## Prompt Title

Phase 2 – Queue Topology and Worker Ownership

## Role

You are a systems engineer specializing in distributed job queues and worker architecture.

## Objective

Audit and restructure the Smart Upload job queue topology to eliminate shared-queue ownership risks, enforce clear ownership boundaries, and add robust retry/idempotency rules. Ensure each job type has its own queue or well-defined worker, and update all enqueue/schedule functions accordingly.

## Context

Current implementation uses a single `eccb-smart-upload` queue for `smartupload.process`, `smartupload.secondPass`, and `smartupload.autoCommit`. Two separate worker modules (`smart-upload-processor-worker.ts` and `smart-upload-worker.ts`) skip unowned jobs by name; OCR uses its own `eccb-ocr` queue. This pattern has been flagged as a risk (shared-queue ownership) and complicates scaling and error isolation. Additionally, idempotency anchors and retry policies may be inadequate when jobs overlap or workers restart mid-job.

## Verified Files to Review

- `src/lib/jobs/definitions.ts` (general job definitions)
- `src/lib/jobs/smart-upload.ts` (queue functions)
- `src/lib/jobs/queue.ts` (queue initialization)
- Workers: `src/workers/smart-upload-processor-worker.ts`, `smart-upload-worker.ts`, `ocr-worker.ts`
- Enqueue calls in routes and services (`queueSmartUploadProcess`, `queueSmartUploadSecondPass`, etc.)
- Tests in `src/lib/jobs/__tests__/smart-upload-queue.test.ts`

## Files to Modify

- `src/lib/jobs/definitions.ts` (add new job types and queue names)
- `src/lib/jobs/queue.ts` (initialize separate queues `SMART_UPLOAD_PROCESS`, `SMART_UPLOAD_SECOND_PASS`, `SMART_UPLOAD_AUTO_COMMIT` and keep OCR if necessary)
- `src/lib/jobs/smart-upload.ts` (adjust queueSmartUpload* functions to target new named queues; update constants)
- Worker modules: either merge into a single worker that only processes its designated queue or rename and confine each worker to its dedicated queue. Remove skip logic.
- `src/workers/ocr-worker.ts` comment remains but ensure queue name is constant.
- Update any configuration or env variables referencing `SMART_UPLOAD` queue.

## Files to Create

- None initially; may add helper modules if needed (e.g. queue topology map).

## Technical Requirements

1. Create distinct BullMQ queues for each job family: `eccb-smart-upload-process`, `eccb-smart-upload-secondpass`, `eccb-smart-upload-autocommit` (names may align with QUEUE_NAMES constant). Maintain `eccb-ocr` for OCR.
2. Update `QUEUE_NAMES` enum mapping in `definitions.ts` and `getQueue`/`initializeQueues` accordingly.
3. Adjust job enqueue functions to call `getQueue('SMART_UPLOAD_PROCESS')` etc., with appropriate job options.
4. Refactor workers:
   - `smart-upload-processor-worker.ts` should only connect to `SMART_UPLOAD_PROCESS` and `SMART_UPLOAD_AUTO_COMMIT` queues; remove conditional checks and skip logic.
   - `smart-upload-worker.ts` should connect _only_ to `SMART_UPLOAD_SECOND_PASS` queue. Optionally rename it to `smart-upload-secondpass-worker.ts`.
   - Ensure each worker logs a startup message indicating which queue it is listening to.
5. Add unit tests verifying that each queue add function uses the proper queue name and options, and that `getQueueNameForJob` returns correct value. Extend existing queue tests accordingly.
6. Implement idempotency by ensuring job IDs are deterministic (e.g., use sessionId as jobId when appropriate) to prevent duplicates on retry. Add logic to `queueSmartUploadProcess` and others to accept an optional `jobId` parameter computed by caller.
7. Define retry policies per queue with backoff and dead-letter queue as appropriate (already mostly present, but verify separation). Document concurrency defaults and allow runtime config to tune each queue separately (via `loadSmartUploadRuntimeConfig`).

## Required Constraints

- Do not change the fundamental job data payload shapes; only routing.
- Preserve backwards compatibility with any external services that may still enqueue older jobs; gracefully handle by having old queue names alias or be deprecated with logging.
- Do not introduce circular dependencies between `queue.ts` and job-specific modules.

## Edge Cases to Handle

- Workers should gracefully ignore jobs of the wrong type if they somehow land in the queue during migration; log a warning and remove or move to dead-letter.
- When migrating existing queue data (jobs already enqueued under old queue), provide a transition plan comment in code (e.g. a one-time script to re-queue or let old worker handle them until drained).
- Ensure that jobs enqueued before the change are not lost; include logging in the new enqueue functions to detect if the old queue still exists.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Build and run unit tests; verify new queue names appear in tests.
- Spin up local Redis and enqueue sample jobs via each function; confirm they appear in the correct Redis key (using `run_in_terminal` to inspect or via `queue.getJobs()`).
- Start each worker manually and confirm that they only consume from their assigned queue and log appropriately.
- Confirm that retries and job ID deduplication work by queuing duplicate `sessionId` jobs and observing only one execution.

## Expected Deliverables

- Modified queue topology code, new queue constants.
- Updated workers with streamlined ownership and removed skip logic.
- Revised tests covering new topology.
- Comments in the code explaining migration steps and mapping old queue names if needed.

## Stop Conditions

Stop and ask for clarification if:
- The new queue naming conflicts with existing `QUEUE_NAMES` used elsewhere.
- Runtime configuration cannot be loaded per-queue.
- You discover other parts of repo enqueue to `SMART_UPLOAD` outside of inspection (search uncovered) that are not in this phase.
