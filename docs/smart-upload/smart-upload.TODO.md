Below is the **repo-mapped implementation spec** for turning this Smart Upload codebase into a **fully autonomous, enterprise-grade music ingest workflow**.

This is based on the actual repo structure you uploaded.

## Real blockers already present in this repo

Before the file-by-file plan, these are the biggest repo-specific issues that must be corrected first:

1. **Status model is broken across code and schema**

   * `prisma/schema.prisma` only allows `PENDING_REVIEW | APPROVED | REJECTED`
   * `src/lib/smart-upload/commit.ts` expects statuses like `PROCESSED` and `READY_TO_COMMIT`
   * `src/types/smart-upload.ts` uses uppercase string unions
   * `src/workers/smart-upload-processor.ts` sometimes writes `NOT_NEEDED`, sometimes `null`

2. **Queue ownership is unsafe**

   * `src/workers/smart-upload-processor-worker.ts` and `src/workers/smart-upload-worker.ts` both consume `SMART_UPLOAD`
   * both workers “skip” unknown jobs instead of refusing ownership
   * that can cause jobs to be taken by the wrong worker and effectively disappear

3. **Provider support is inconsistent**

   * `src/lib/llm/providers.ts` includes `ollama-cloud`, `mistral`, and `groq`
   * `src/lib/smart-upload/schema.ts` does **not**
   * admin routes and settings form only partially support the provider matrix

4. **Manual review is still baked into the normal path**

   * the pipeline can parse and split
   * but the repo still treats review/approval as a normal operational path instead of an exception path

---

# Target architecture for this repo

This implementation spec assumes the finished repo will use this architecture:

* **one upload route**
* **separate queues by responsibility**

  * process
  * OCR
  * verify / second pass
  * commit
* **one canonical state model**
* **deterministic parsing first**
* **OCR fallback automatically**
* **second pass automatically**
* **autonomous commit by default for safe sessions**
* **manual review only for exception sessions**
* **provider matrix fully wired**

  * Ollama
  * Ollama Cloud
  * OpenAI
  * Anthropic
  * Gemini
  * OpenRouter
  * Mistral
  * Groq
  * custom OpenAI-compatible endpoints

---

# File-by-file implementation spec

## 1) Database and canonical state layer

### `prisma/schema.prisma` — **MODIFY**

This is the first file to change.

### Required changes

1. Replace the current limited `SmartUploadStatus` design with a **real workflow state model**.
2. Add typed enums for:

   * `SmartUploadWorkflowStatus`
   * `SmartUploadParseStatus`
   * `SmartUploadOcrStatus`
   * `SmartUploadSecondPassStatus`
   * `SmartUploadCommitStatus`
3. Convert `SmartUploadSession.parseStatus` and `SmartUploadSession.secondPassStatus` from loose `String?` fields into real enums.
4. Add an `ocrStatus` field.
5. Add a `commitStatus` field.
6. Add failure tracking fields:

   * `failureCode`
   * `failureStage`
   * `failureMessage`
7. Add observability fields:

   * `progressStep`
   * `progressPercent`
   * `processingStartedAt`
   * `processingCompletedAt`
   * `committedAt`
8. Add dedupe / idempotency fields:

   * `sourceSha256`
   * `normalizedMetadata`
   * `reviewReasons`
   * `commitAttemptCount`
9. Add result linkage fields:

   * `committedPieceId`
   * `committedRootFileId`
10. Add page-level bookkeeping:

* `pageCount`
* `ocrResult` or equivalent structured OCR JSON

11. Add a **unique session-to-piece idempotency anchor** on library data:

* recommended: `MusicPiece.sourceUploadSessionId String? @unique`

12. Add deterministic duplicate protection for created parts:

* recommended: `MusicPart.ingestFingerprint String?`
* add unique composite index per piece where appropriate

13. Add indexes for:

* workflow status
* parse status
* OCR status
* second-pass status
* commit status
* source hash
* committed piece linkage

### Done when

* the schema can represent the full autonomous workflow without raw string drift
* retries can be made idempotent at the DB level
* failures and review reasons are queryable

---

### `prisma/migrations/<new_timestamp>_smart_upload_enterprise_workflow/migration.sql` — **CREATE**

Create a new migration for the schema changes above.

### Required changes

* add new enums
* migrate old `parseStatus` / `secondPassStatus` strings safely
* backfill existing sessions where possible
* add new indexes and unique constraints
* preserve existing Smart Upload data

### Done when

* current sessions migrate safely
* production deployment can run this migration without manual DB cleanup

---

### `prisma/seed.ts` — **MODIFY**

This file must seed all Smart Upload defaults and required records for enterprise ingest.

### Required changes

1. Seed any new Smart Upload settings keys.
2. Seed canonical prompt defaults.
3. Seed provider defaults for supported providers.
4. Seed missing permissions if needed.
5. Seed instrument taxonomy entries required for normalization and commit safety.
6. Seed any model-parameter defaults required by the settings UI.

### Done when

* a fresh environment can boot with Smart Upload ready to configure
* no manual DB inserts are required

---

## 2) Canonical types and state machine

### `src/types/smart-upload.ts` — **MODIFY**

Right now this file is too thin and inconsistent with the DB model.

### Required changes

1. Replace ad hoc uppercase string unions with canonical shared types that match Prisma enums exactly.
2. Add types for:

   * workflow status
   * OCR status
   * commit status
   * failure stage
   * review reasons
   * normalized metadata
   * duplicate policy result
   * autonomous decision result
3. Make `ExtractedMetadata` richer and split it into:

   * raw extracted metadata
   * normalized metadata
4. Add a stable type for:

   * `PartBoundaryCandidate`
   * `ValidatedCuttingInstruction`
   * `CommittedPartRecord`

### Done when

* routes, workers, UI, and commit logic all consume the same type model

---

### `src/lib/smart-upload/state.ts` — **CREATE**

This should become the canonical state transition engine.

### Required contents

* allowed transitions for:

  * workflow
  * parse
  * OCR
  * second pass
  * commit
* helpers like:

  * `canQueueOcr`
  * `canQueueSecondPass`
  * `canAutoCommit`
  * `canEnterReview`
  * `canRetryCommit`

### Done when

* no worker or route writes raw state strings directly without going through valid transitions

---

### `src/lib/smart-upload/fallback-policy.ts` — **CREATE**

This file should own routing policy.

### Required contents

* decide:

  * text-only path
  * OCR path
  * second-pass path
  * auto-commit path
  * exception path
* inputs:

  * text coverage
  * OCR coverage
  * segmentation confidence
  * metadata confidence
  * duplicate result
  * provider/model failure class

### Done when

* policy decisions are centralized and not duplicated inside workers

---

### `src/lib/smart-upload/session-errors.ts` — **CREATE**

Centralize machine-readable error codes.

### Required contents

* failure codes like:

  * `PDF_CORRUPT`
  * `STORAGE_DOWNLOAD_FAILED`
  * `OCR_FAILED`
  * `MODEL_TIMEOUT`
  * `MODEL_SCHEMA_INVALID`
  * `BOUNDARY_CONFLICT`
  * `COMMIT_DUPLICATE`
  * `COMMIT_TX_FAILED`

### Done when

* all terminal and retriable failures have stable codes

---

## 3) Metadata normalization and duplicate safety

### `src/lib/smart-upload/metadata-normalizer.ts` — **CREATE**

This should normalize all raw extracted values before commit.

### Required contents

* normalize:

  * title
  * subtitle
  * composer
  * arranger
  * publisher
  * instrument
  * chair number
  * transposition
  * score vs part type
* keep both:

  * raw value
  * normalized value

### Done when

* downstream DB records are stable and searchable

---

### `src/lib/smart-upload/duplicate-detection.ts` — **CREATE**

This file should own duplicate strategy.

### Required contents

* calculate:

  * source PDF hash
  * work fingerprint
  * part fingerprint
* decide whether to:

  * reuse same session
  * reject duplicate
  * version a result
  * create a new distinct piece
  * enter exception flow

### Done when

* upload retries and job retries cannot create silent duplicates

---

### `src/lib/smart-upload/canonical-instruments.ts` — **CREATE**

Move the canonical instrument taxonomy out of `part-naming.ts`.

### Required contents

* alias tables for major ensemble instrument labels
* canonical family mappings
* canonical transposition mappings
* chair alias normalization
* OCR-error-tolerant aliases

### Done when

* the repo has one source of truth for instrument naming

---

### `src/lib/smart-upload/part-naming.ts` — **MODIFY**

This file already exists but should stop being the sole normalization layer.

### Required changes

1. Replace embedded canonical logic with imports from `canonical-instruments.ts`.
2. Add stronger handling for:

   * roman numerals
   * OCR confusion
   * abbreviations
   * conductor/full score/condensed score
   * duplicate chair naming
3. Add deterministic slug generation.
4. Add deterministic filename generation that does not vary across retries.
5. Add part fingerprint generation input.

### Done when

* the same part always gets the same normalized name and filename

---

## 4) Queue and worker topology

### `src/lib/jobs/definitions.ts` — **MODIFY**

This file is missing job definitions required by the current code.

### Required changes

1. Add missing job types:

   * `smartupload.autoCommit`
   * `ocr.process`
2. Split queue mapping by responsibility:

   * `smartupload.process`
   * `smartupload.secondPass`
   * `smartupload.autoCommit`
   * `ocr.process`
3. Add per-job retry policies.
4. Add per-job concurrency policy.
5. Add timeout metadata if you are enforcing job-level max time.

### Done when

* every job emitted by the code is formally defined here
* no helper can enqueue an undefined job

---

### `src/lib/jobs/queue.ts` — **MODIFY**

This is where queue ownership must be fixed.

### Required changes

1. Add separate queues:

   * `SMART_UPLOAD_PROCESS`
   * `SMART_UPLOAD_VERIFY`
   * `SMART_UPLOAD_COMMIT`
   * `OCR`
2. Stop routing all Smart Upload jobs through one shared queue.
3. Expose queue event helpers for each queue.
4. Ensure queue stats can be queried for operational monitoring.
5. Make dead-letter handling explicit for Smart Upload failures.
6. Ensure queue initialization includes all new queues.

### Done when

* no worker can accidentally consume the wrong Smart Upload job

---

### `src/lib/jobs/smart-upload.ts` — **MODIFY**

This helper should become a thin, strict queue API.

### Required changes

1. Update helpers to send jobs to the correct queue.
2. Use deterministic job IDs where appropriate:

   * `process:<sessionId>`
   * `verify:<sessionId>`
   * `commit:<sessionId>`
3. Prevent duplicate enqueue of the same logical stage unless forced.
4. Add helpers for repair-safe requeue.

### Done when

* duplicate queueing becomes controlled and observable

---

### `src/lib/jobs/ocr.ts` — **CREATE**

Create a dedicated OCR job helper.

### Required contents

* `queueSmartUploadOcr(sessionId)`
* OCR job progress typing
* OCR retry policy wrapper

### Done when

* OCR orchestration is first-class instead of ad hoc

---

### `src/workers/smart-upload-processor-worker.ts` — **MODIFY**

This worker must only own process jobs.

### Required changes

1. Point it to the process queue only.
2. Remove “skip unowned job” behavior.
3. Treat unknown job names as programmer error.
4. Keep concurrency configurable from runtime settings.

### Done when

* this worker cannot ever take second-pass or commit jobs

---

### `src/workers/smart-upload-worker.ts` — **MODIFY**

This file should become the **verification / second-pass worker** only.

### Required changes

1. Point it to the verify queue only.
2. Remove shared-queue behavior.
3. Rename internal comments and logic to match true role.
4. Make it consume only:

   * `smartupload.secondPass`
5. Write status transitions through the new state helper.

### Done when

* it is impossible for this worker to consume process or commit jobs

---

### `src/workers/smart-upload-commit-worker.ts` — **CREATE**

Commit should get its own worker.

### Required contents

* consume `smartupload.autoCommit`
* verify session is commit-eligible
* call `commitSmartUploadSessionToLibrary`
* update `commitStatus`
* classify failures into retryable vs terminal

### Done when

* commit is isolated from parsing and verification

---

### `src/workers/ocr-worker.ts` — **MODIFY**

This worker exists but is not fully integrated.

### Required changes

1. Wire it into startup.
2. Accept only OCR jobs from the OCR queue.
3. Merge OCR results back into the active session in a format the main pipeline consumes.
4. Update `ocrStatus` using canonical transitions.
5. Requeue either:

   * process continuation
   * verify stage
   * exception flow
     depending on fallback policy

### Done when

* OCR is a real subflow in the autonomous ingest path

---

### `src/workers/index.ts` — **MODIFY**

This file must start the complete worker topology.

### Required changes

1. Start:

   * process worker
   * verify worker
   * commit worker
   * OCR worker
2. Stop them cleanly on shutdown.
3. Update health output to include OCR and commit workers.
4. Fail readiness when required Smart Upload workers are down.

### Done when

* production startup runs the full autonomous workflow, not a partial one

---

## 5) Upload intake and autonomous pipeline

### `src/app/api/files/smart-upload/route.ts` — **MODIFY**

This route must create a durable, idempotent intake session.

### Required changes

1. Keep auth, permission, CSRF, rate limit, file type, and magic-byte validation.
2. Add source file hashing:

   * SHA-256 of original file
3. Add optional lightweight sanity parse:

   * page count
   * encrypted/corrupt detection
4. Create session with canonical initial states:

   * workflow: `UPLOADED` then `QUEUED`
   * parse: `NOT_STARTED`
   * OCR: `NOT_NEEDED`
   * second pass: `NOT_NEEDED`
   * commit: `NOT_STARTED`
5. Save `sourceSha256`.
6. Save `pageCount` if available.
7. If enqueue fails, update session to failed/queue-error state instead of leaving misleading pending state.
8. Return the canonical session state payload to the client.
9. Add duplicate session handling policy based on source hash if desired.

### Done when

* a valid upload always creates a truthful session
* a failed enqueue does not masquerade as a live session

---

### `src/workers/smart-upload-processor.ts` — **MODIFY**

This is the main heart of the system and needs the most work.

### Required changes

1. Stop writing raw status strings directly.
2. Use the canonical state helper.
3. Separate pipeline stages clearly:

   * load session
   * download original
   * inspect PDF
   * text extraction
   * OCR decision
   * first-pass metadata extraction
   * deterministic boundary detection
   * boundary validation
   * split generation
   * normalized part manifest creation
   * routing decision
4. Add automatic OCR routing when:

   * no text layer
   * weak text coverage
   * low boundary confidence
5. Add policy-based second-pass routing when:

   * segmentation confidence is below threshold
   * metadata conflicts remain
   * duplicate policy is unresolved
6. Add stronger output manifest creation for each part:

   * normalized name
   * raw name
   * page range
   * page count
   * transposition
   * section
   * storage key
   * deterministic fingerprint
7. Add stronger part upload bookkeeping.
8. Stop converting `NOT_NEEDED` to `null`.
9. Stop relying on confidence only; use multi-signal routing.
10. Queue commit only when:

* autonomous mode enabled
* validated parts exist
* normalized metadata exists
* duplicate policy is resolved
* no review reasons remain

### Done when

* this worker can take a normal PDF from original upload to commit-ready state with no human help

---

### `src/workers/smart-upload-worker.ts` — **MODIFY**

This verification worker needs to become schema-validated and deterministic around updates.

### Required changes

1. Validate second-pass responses against schema before using them.
2. Reconcile first-pass and second-pass outputs using normalized metadata, not raw strings.
3. Use adjudication only when truly needed.
4. When corrected boundaries are returned, re-split parts deterministically.
5. Validate all regenerated parts.
6. Update session states truthfully:

   * second pass processing
   * complete
   * failed
7. Route to commit or review based on fallback policy.

### Done when

* second pass is an automated correction step, not a fragile side path

---

## 6) OCR, PDF, and segmentation services

### `src/lib/services/ocr-fallback.ts` — **MODIFY**

This file should stop acting like a side utility and become pipeline-grade.

### Required changes

1. Return structured OCR result data.
2. Include page-level confidence where possible.
3. Support:

   * header-only OCR
   * full-page OCR
   * both
4. Expose data the boundary detector can consume directly.
5. Normalize OCR text before passing it downstream.

### Done when

* OCR output can directly improve boundary detection and metadata extraction

---

### `src/lib/services/pdf-text-extractor.ts` — **MODIFY**

This file should return richer signals.

### Required changes

1. Return per-page text coverage.
2. Return header candidate confidence.
3. Distinguish empty text layer vs low-quality extracted text.
4. Add a clean signal for “OCR recommended”.

### Done when

* fallback policy can make OCR decisions from this file alone

---

### `src/lib/services/pdf-renderer.ts` — **MODIFY**

This file must be safe and deterministic for production.

### Required changes

1. Support:

   * full-page render
   * header crop render
   * optional grayscale optimization
   * rotation normalization
2. Add render bounds and memory protection.
3. Ensure image generation is deterministic enough for debugging.
4. Return render errors with structured failure info.

### Done when

* large or odd PDFs do not destabilize workers silently

---

### `src/lib/services/part-boundary-detector.ts` — **MODIFY**

This file must become the deterministic segmentation engine.

### Required changes

1. Accept:

   * extracted text
   * OCR text
   * header crops
   * normalized instrument aliases
2. Output:

   * candidate boundaries
   * segmentation confidence
   * ambiguity reasons
3. Handle:

   * no repeated header on continuation pages
   * repeated page numbers
   * score before parts
   * parts before score
   * blank separator pages
   * duplicate instrument sections
   * multi-page continuation
4. Return structured ambiguity signals.

### Done when

* deterministic segmentation works for the majority of normal packets before LLM fallback

---

### `src/lib/services/cutting-instructions.ts` — **MODIFY**

This file should be the final validator for page grouping.

### Required changes

1. Validate page ranges more strictly.
2. Reject or repair:

   * overlaps
   * gaps
   * reversed ranges
   * out-of-bounds pages
   * duplicate output names
3. Return both:

   * corrected instructions
   * warnings
4. Generate normalized one-indexed and zero-indexed forms consistently.

### Done when

* part splitting is fed only validated, normalized boundaries

---

### `src/lib/services/pdf-splitter.ts` — **MODIFY**

This file should return a richer manifest.

### Required changes

1. Return part buffer plus:

   * page count
   * page range
   * deterministic fingerprint
   * output name suggestion
2. Validate generated PDFs before returning them.
3. Detect empty output or malformed output.
4. Preserve original page order.

### Done when

* every split result is safe to upload and commit

---

### `src/lib/services/storage.ts` — **MODIFY**

This file must support enterprise ingest safely.

### Required changes

1. Add a `headFile` or equivalent existence check.
2. Add checksum-aware upload support.
3. Add metadata support for:

   * session ID
   * part fingerprint
   * source hash
4. Make download behavior consistent for LOCAL and S3.
5. Strengthen signed URL use and preview safety.
6. Return stable error classes for:

   * not found
   * permission
   * network
   * integrity mismatch

### Done when

* storage becomes safe enough for idempotent retries and forensic debugging

---

### `src/lib/services/smart-upload-cleanup.ts` — **MODIFY**

This cleanup file must become policy-aware.

### Required changes

1. Only delete temporary artifacts.
2. Never delete committed library files.
3. Support cleanup after:

   * reject
   * failed pipeline
   * successful commit
4. Log every deleted object.

### Done when

* cleanup never destroys library truth

---

## 7) Commit and DB persistence

### `src/lib/smart-upload/commit.ts` — **MODIFY**

This file is one of the highest-priority changes.

### Required changes

1. Align commit eligibility with the real DB status model.
2. Stop checking statuses that do not exist in `prisma/schema.prisma`.
3. Lock commit around the session’s unique piece anchor.
4. Use normalized metadata, not raw extracted metadata, as the source of truth.
5. Add arranger support, not just composer.
6. Improve person matching:

   * avoid naïve “last token is last name” assumptions for all cases
7. Reuse or create publisher safely.
8. Create `MusicPiece` idempotently using `sourceUploadSessionId`.
9. Create root `MusicFile` safely.
10. Create part `MusicFile` rows safely.
11. Create `MusicPart` rows using deterministic part fingerprints.
12. Store provenance and confidence data.
13. Write back:

* committed piece ID
* committed root file ID
* commit status
* committed timestamp

14. Mark session completed in the same logical commit flow.
15. Handle already-committed session gracefully.

### Done when

* commit is idempotent
* retries do not create duplicates
* a session can be safely rechecked after crash/restart

---

## 8) Provider matrix and LLM runtime

### `src/lib/smart-upload/schema.ts` — **MODIFY**

This file must match the real provider matrix.

### Required changes

1. Expand provider enum to match `src/lib/llm/providers.ts`, or deliberately remove unsupported providers from the provider registry.
2. Add missing API key fields:

   * `llm_ollama_cloud_api_key`
   * `llm_mistral_api_key`
   * `llm_groq_api_key`
3. Update:

   * `getApiKeyFieldForProvider`
   * `providerRequiresApiKey`
   * endpoint rules
4. Add validation for provider/model compatibility where possible.
5. Add any missing smart-upload settings keys used by the runtime.

### Done when

* schema, runtime, admin routes, and UI all support the same providers

---

### `src/lib/smart-upload/bootstrap.ts` — **MODIFY**

This file must seed the full Smart Upload configuration surface.

### Required changes

1. Seed every key used by:

   * schema
   * runtime config loader
   * settings route
   * settings form
2. Seed defaults for:

   * prompt version
   * provider defaults
   * model params
   * autonomous mode defaults
   * OCR defaults if stored in settings

### Done when

* runtime settings are complete after bootstrap

---

### `src/lib/llm/providers.ts` — **MODIFY**

This should become the real provider capability registry.

### Required changes

1. Keep the provider list in sync with the Smart Upload schema.
2. Add capability flags:

   * supportsVision
   * supportsStructuredOutput
   * supportsDocumentInput
   * supportsModelDiscovery
   * requiresEndpoint
3. Stop using this file as label-only metadata.

### Done when

* routes and UI can ask this file what each provider supports

---

### `src/lib/llm/config-loader.ts` — **MODIFY**

This loader already supports more providers than the schema. That must be aligned.

### Required changes

1. Keep provider list aligned with schema.
2. Load all supported provider keys consistently.
3. Make endpoint fallback rules explicit per provider.
4. Validate that a selected provider has its required key and model before the worker runs.
5. Add OCR/second-pass/adjudicator model settings if required.

### Done when

* runtime config is deterministic and complete for every provider

---

### `src/lib/llm/index.ts` — **MODIFY**

This file should remain the adapter router, but with stronger validation.

### Required changes

1. Keep adapter selection aligned with provider registry.
2. Normalize provider errors into stable classes.
3. Enforce structured-output validation before pipeline use.
4. Add consistent retry classification.

### Done when

* provider failures do not corrupt workflow state

---

### `src/lib/llm/types.ts` — **MODIFY**

Strengthen request/response contracts.

### Required changes

* add explicit types for:

  * structured schema mode
  * multimodal input
  * labeled image input
  * provider capability response
  * normalized error envelope

### Done when

* adapter contracts are stable and testable

---

### `src/lib/llm/openai.ts` — **MODIFY**

### `src/lib/llm/anthropic.ts` — **MODIFY**

### `src/lib/llm/gemini.ts` — **MODIFY**

### `src/lib/llm/openrouter.ts` — **MODIFY**

### `src/lib/llm/ollama.ts` — **MODIFY**

### `src/lib/llm/ollama-cloud.ts` — **MODIFY**

### `src/lib/llm/mistral.ts` — **MODIFY**

### `src/lib/llm/groq.ts` — **MODIFY**

### `src/lib/llm/custom.ts` — **MODIFY**

### Required changes for all adapters

1. Normalize response envelope shape.
2. Normalize error shape.
3. Support schema-constrained output where supported.
4. Fail clearly when a model cannot do vision or structured output.
5. Respect provider-specific auth/header/endpoint rules.
6. Add timeout behavior and retry classification.
7. Avoid silent coercion of malformed JSON.

### Done when

* every adapter either works fully for Smart Upload or fails explicitly and predictably

---

## 9) Admin API routes

### `src/app/api/admin/uploads/status/[sessionId]/route.ts` — **MODIFY**

This route currently lacks auth and permission enforcement.

### Required changes

1. Add auth.
2. Add permission check.
3. Return canonical status fields:

   * workflow
   * parse
   * OCR
   * second pass
   * commit
   * failure code/stage/message
4. Return progress step/percent.
5. Return normalized metadata summary.
6. Return review reasons when present.

### Done when

* the frontend can trust this route as the source of truth

---

### `src/app/api/admin/uploads/events/route.ts` — **MODIFY**

This route should stream all Smart Upload stages.

### Required changes

1. Include OCR events.
2. Include second-pass events.
3. Include commit events.
4. Include failed terminal events with failure codes.
5. Ensure queue event mapping matches the new queue layout.

### Done when

* live progress reflects the real workflow

---

### `src/app/api/admin/uploads/review/route.ts` — **MODIFY**

This route currently uses legacy permission names.

### Required changes

1. Replace `music:read` with the current permission constant.
2. Filter to exception sessions by default.
3. Return structured review reasons.
4. Stop treating all pending sessions as normal review work.

### Done when

* review page becomes an exception inbox, not the main ingest queue

---

### `src/app/api/admin/uploads/review/[id]/approve/route.ts` — **MODIFY**

This route currently uses legacy `music:create`.

### Required changes

1. Use correct permission constant.
2. Reuse the shared commit service only.
3. Only allow approval for exception sessions.
4. Return canonical post-commit state.
5. Prevent approving already-committed sessions.

### Done when

* manual approval is safe and secondary

---

### `src/app/api/admin/uploads/review/[id]/reject/route.ts` — **MODIFY**

This route currently uses legacy `music:edit`.

### Required changes

1. Use correct permission constant.
2. Persist rejection reason into session review data.
3. Mark workflow rejected with canonical state helper.
4. Run cleanup safely.

### Done when

* reject is auditable and safe

---

### `src/app/api/admin/uploads/review/bulk-approve/route.ts` — **MODIFY**

This route duplicates commit logic.

### Required changes

1. Stop doing direct transaction logic here.
2. Reuse `commitSmartUploadSessionToLibrary`.
3. Enforce only exception-session bulk approval.
4. Return partial success/failure details safely.

### Done when

* there is one commit path in the repo, not two

---

### `src/app/api/admin/uploads/review/[id]/preview/route.ts` — **MODIFY**

### `src/app/api/admin/uploads/review/[id]/part-preview/route.ts` — **MODIFY**

### Required changes

1. Replace legacy permission checks with permission constants.
2. Keep strict session-scoped storage validation.
3. Add safer logging.
4. Return canonical preview metadata:

   * page index
   * total pages
   * source type

### Done when

* previews are safe and consistent

---

### `src/app/api/admin/uploads/second-pass/route.ts` — **MODIFY**

This route should become a controlled manual override, not a normal workflow trigger.

### Required changes

1. Keep correct permission enforcement.
2. Only allow manual queueing when policy allows.
3. Prevent manual second-pass spam on the same session.
4. Return canonical status update.

### Done when

* manual second pass is a controlled support action

---

### `src/app/api/admin/uploads/models/route.ts` — **MODIFY**

This route currently supports only a partial provider type union.

### Required changes

1. Expand provider support to match the real provider registry.
2. Stop hardcoding incomplete provider union types.
3. Use capability flags from `providers.ts`.
4. Stop treating stale static metadata as the final truth.
5. Mark unsupported capabilities clearly rather than pretending support exists.
6. Return structured recommendation info.

### Done when

* model discovery is aligned with provider reality

---

### `src/app/api/admin/uploads/model-params/route.ts` — **MODIFY**

This route must support the full provider matrix.

### Required changes

1. Add missing providers.
2. Use provider capability metadata instead of fragile branching.
3. Return param schemas consistent with adapters.

### Done when

* the settings UI can configure every supported provider correctly

---

### `src/app/api/admin/uploads/settings/route.ts` — **MODIFY**

This route must validate against the expanded provider/settings schema.

### Required changes

1. Support all provider keys.
2. Preserve masked secrets correctly.
3. Reject invalid provider/model combinations.
4. Save all canonical settings keys used by runtime.
5. Validate model param JSON before save.

### Done when

* DB settings always match runtime expectations

---

### `src/app/api/admin/uploads/settings/reset-prompts/route.ts` — **MODIFY**

### Required changes

* reset all prompts used by first pass, second pass, header labeling, and adjudication
* preserve prompt version consistency

### Done when

* prompt reset brings the system back to a coherent default state

---

### `src/app/api/admin/uploads/settings/test/route.ts` — **MODIFY**

This route currently omits several providers.

### Required changes

1. Add support for:

   * `ollama-cloud`
   * `mistral`
   * `groq`
2. Keep support for:

   * openai
   * anthropic
   * gemini
   * openrouter
   * ollama
   * custom
3. Distinguish:

   * auth failure
   * endpoint failure
   * unsupported model
   * capability mismatch
4. Test a capability-appropriate endpoint per provider.

### Done when

* “test connection” means the provider is actually viable for Smart Upload

---

### `src/app/api/admin/uploads/providers/discover/route.ts` — **MODIFY**

This route currently uses legacy `system:settings`.

### Required changes

1. replace with the current system config permission constant
2. expand discovery to supported provider matrix where appropriate
3. use provider capability registry
4. return safe, honest recommendations only
5. do not auto-write incomplete provider configurations

### Done when

* discovery never writes a config the workers cannot actually use

---

## 10) Admin UI

### `src/app/(admin)/admin/uploads/page.tsx` — **MODIFY**

### Required changes

* show canonical status model
* stop implying manual review is normal
* show autonomous completion path
* show structured failures and exception routing

### Done when

* this page feels like job intake, not manual processing

---

### `src/app/(admin)/admin/uploads/review/page.tsx` — **MODIFY**

### Required changes

* treat this as the exception queue
* show review reasons
* show raw vs normalized metadata
* show OCR and second-pass history
* allow safe approve/reject only for exception sessions

### Done when

* librarians review only the files that truly need intervention

---

### `src/app/(admin)/admin/uploads/settings/page.tsx` — **MODIFY**

Mostly wrapper-level adjustments if new settings sections are added.

---

### `src/components/admin/music/smart-upload-settings-form.tsx` — **MODIFY**

This is a major UI file.

### Required changes

1. Support the full provider matrix.
2. Keep masked secret behavior correct.
3. Show capability notes:

   * vision
   * structured output
   * model discovery
4. Expose autonomous mode thresholds clearly.
5. Expose OCR policy controls if stored as settings.
6. Expose second-pass and adjudication settings.
7. Stop rendering providers the backend schema cannot save.

### Done when

* the form fully matches backend truth

---

### `src/components/admin/sidebar.tsx` — **MODIFY**

Only if you want clearer nav labeling.

### Required change

* rename review section to reflect “exceptions” rather than routine work

---

## 11) Tests, fixtures, and CI

### Existing test files to **MODIFY**

* `src/app/api/files/smart-upload/__tests__/route.test.ts`
* `src/app/api/files/smart-upload/__tests__/e2e.test.ts`
* `src/app/api/files/smart-upload/__tests__/mocks.ts`
* `src/app/api/files/smart-upload/__tests__/smart-upload-services.test.ts`
* `src/app/api/admin/uploads/settings/__tests__/route.test.ts`
* `src/app/api/admin/uploads/review/[id]/approve/__tests__/route.test.ts`
* `src/app/api/admin/uploads/review/[id]/reject/__tests__/route.test.ts`
* `src/lib/jobs/__tests__/smart-upload-queue.test.ts`
* `src/lib/smart-upload/__tests__/schema.test.ts`
* `src/lib/smart-upload/__tests__/bootstrap.test.ts`
* `src/lib/llm/__tests__/adapters.test.ts`
* `src/lib/llm/__tests__/providers.test.ts`

### New test files to **CREATE**

* `src/lib/smart-upload/__tests__/state.test.ts`
* `src/lib/smart-upload/__tests__/metadata-normalizer.test.ts`
* `src/lib/smart-upload/__tests__/duplicate-detection.test.ts`
* `src/lib/smart-upload/__tests__/fallback-policy.test.ts`
* `src/lib/smart-upload/__tests__/part-naming.test.ts`
* `src/app/api/admin/uploads/status/[sessionId]/__tests__/route.test.ts`
* `src/app/api/admin/uploads/models/__tests__/route.test.ts`
* `src/app/api/admin/uploads/model-params/__tests__/route.test.ts`
* `src/app/api/admin/uploads/settings/test/__tests__/route.test.ts`
* `src/app/api/admin/uploads/providers/discover/__tests__/route.test.ts`
* `src/workers/__tests__/smart-upload-processor.test.ts`
* `src/workers/__tests__/smart-upload-worker.test.ts`
* `src/workers/__tests__/smart-upload-commit-worker.test.ts`
* `src/workers/__tests__/ocr-worker.test.ts`

### Test fixture directory to **CREATE**

* `src/test/fixtures/smart-upload/`

### Required fixture classes

* clean text-layer score+parts PDF
* scanned image-only packet
* ambiguous packet
* score-only PDF
* single-part PDF
* duplicate upload sample
* malformed/corrupt PDF

### `.github/workflows/test.yml` — **MODIFY**

### Required changes

* run Smart Upload tests with Redis
* run migration + seed
* run worker/integration suite
* fail build on autonomous ingest regression

### Done when

* CI proves autonomous ingest still works after code changes

---

## 12) Ops and deployment

### `env.example` — **MODIFY**

Add or document all required Smart Upload environment variables.

### Required additions

* OCR queue name if configurable
* provider-specific keys that the repo truly supports
* any new autonomous / worker / storage tuning vars
* render / OCR safety limits if env-driven

### Done when

* a new environment can be configured without guesswork

---

### `scripts/update-llm-config.ts` — **MODIFY**

This script must write the full supported settings surface.

### Required changes

* include all provider keys
* include missing provider values
* include new prompt and model param keys
* stay aligned with schema and bootstrap

### Done when

* CLI config writes exactly what runtime reads

---

### `docs/SMART_UPLOAD.md` — **MODIFY**

### `docs/SMART_UPLOAD_MASTER_GUIDE.md` — **MODIFY**

### `DEPLOYMENT.md` — **MODIFY**

### Required changes

Document:

* worker topology
* queue topology
* full workflow states
* OCR flow
* second-pass flow
* autonomous commit flow
* exception review flow
* provider matrix
* deployment requirements
* troubleshooting
* replay / retry guidance

### Done when

* another engineer can operate the system without reading the whole codebase

---

# Exact new files to create

These are the most important new files I recommend creating:

1. `src/lib/smart-upload/state.ts`
2. `src/lib/smart-upload/fallback-policy.ts`
3. `src/lib/smart-upload/session-errors.ts`
4. `src/lib/smart-upload/metadata-normalizer.ts`
5. `src/lib/smart-upload/duplicate-detection.ts`
6. `src/lib/smart-upload/canonical-instruments.ts`
7. `src/lib/jobs/ocr.ts`
8. `src/workers/smart-upload-commit-worker.ts`
9. `prisma/migrations/<new_timestamp>_smart_upload_enterprise_workflow/migration.sql`
10. `src/test/fixtures/smart-upload/`
11. the new test files listed above

---

# Exact implementation order

Do the work in this order.

## Phase 1

* `prisma/schema.prisma`
* new migration
* `prisma/seed.ts`
* `src/types/smart-upload.ts`
* `src/lib/smart-upload/state.ts`

## Phase 2

* `src/lib/jobs/definitions.ts`
* `src/lib/jobs/queue.ts`
* `src/lib/jobs/smart-upload.ts`
* `src/lib/jobs/ocr.ts`
* `src/workers/smart-upload-processor-worker.ts`
* `src/workers/smart-upload-worker.ts`
* `src/workers/smart-upload-commit-worker.ts`
* `src/workers/ocr-worker.ts`
* `src/workers/index.ts`

## Phase 3

* `src/lib/smart-upload/canonical-instruments.ts`
* `src/lib/smart-upload/metadata-normalizer.ts`
* `src/lib/smart-upload/duplicate-detection.ts`
* `src/lib/smart-upload/fallback-policy.ts`
* `src/lib/smart-upload/session-errors.ts`
* `src/lib/smart-upload/part-naming.ts`

## Phase 4

* `src/lib/services/pdf-text-extractor.ts`
* `src/lib/services/ocr-fallback.ts`
* `src/lib/services/pdf-renderer.ts`
* `src/lib/services/part-boundary-detector.ts`
* `src/lib/services/cutting-instructions.ts`
* `src/lib/services/pdf-splitter.ts`
* `src/lib/services/storage.ts`
* `src/lib/services/smart-upload-cleanup.ts`

## Phase 5

* `src/app/api/files/smart-upload/route.ts`
* `src/workers/smart-upload-processor.ts`
* `src/workers/smart-upload-worker.ts`
* `src/lib/smart-upload/commit.ts`

## Phase 6

* `src/lib/smart-upload/schema.ts`
* `src/lib/smart-upload/bootstrap.ts`
* `src/lib/llm/providers.ts`
* `src/lib/llm/config-loader.ts`
* `src/lib/llm/index.ts`
* adapter files

## Phase 7

* admin upload routes
* admin review routes
* status/events routes
* settings/models/test/discover routes

## Phase 8

* admin UI pages
* settings form
* review UI

## Phase 9

* tests
* fixtures
* CI
* docs
* deployment docs

---

# What “finished” looks like in this repo

When this spec is implemented, the repo should behave like this:

1. librarian uploads one PDF
2. system stores original
3. system analyzes text layer
4. system triggers OCR automatically if needed
5. system finds part boundaries
6. system validates boundaries
7. system generates individual part PDFs
8. system normalizes metadata
9. system detects duplicates safely
10. system runs second-pass verification automatically only when needed
11. system commits piece/file/part rows exactly once
12. system marks session completed
13. review UI only shows real exception cases

That is the point where Smart Upload becomes a **time-saving digital library ingestion system**, not just an assisted upload tool.

**Best next move:** I can turn this into a **phase-by-phase build sheet** with exact acceptance checkpoints for each phase, so you can implement it in the right order without breaking the repo.
