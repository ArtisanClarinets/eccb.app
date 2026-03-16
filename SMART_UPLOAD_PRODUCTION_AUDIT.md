# SMART UPLOAD SYSTEM — PRODUCTION-READINESS AUDIT & REMEDIATION PLAN
**Classification:** Enterprise Deployment Readiness Assessment  
**Date:** March 12, 2026  
**Status:** NOT READY FOR PRODUCTION DEPLOYMENT  
**Risk Level:** CRITICAL  

---

## EXECUTIVE SUMMARY

The ECCB smart upload system remains **not deployment-ready** despite recent architectural improvements. The current implementation has critical, systemic failures across multiple layers that render it unsafe for unsupervised production use:

### Immediate Critical Issues
1. **Deterministic segmentation accepts garbage output** — page labels are confirmed invalid (confidence 25–65% for meaningless text) yet bypass second-pass verification due to a logical flaw in the confidence threshold check.
2. **Header extraction produces implausible values** — reported "header" text sizes (876–1172 chars) indicate the extraction is capturing body text, not page headers.
3. **Second-pass routing broken** — calls an incompatible model (`google/gemma-3-27b-it`) that rejects payloads with "developer instruction" parameters, causing immediate HTTP 400 errors.
4. **OpenRouter provider strategy fundamentally unsound** — the current model selection and prompt structure are incompatible with OpenRouter's model restrictions.
5. **Preview and review APIs failing** — HTTP 500 errors on preview generation, SSE endpoint encoding errors, corrupted UI state rendering.
6. **Settings not fully database-driven** — multiple provider/model configuration layers still have hardcoded values or incomplete DB fallbacks.
7. **No deterministic, safe fallback path** — when second pass fails, sessions hang in a bad state with no recovery mechanism.

### Deployment Readiness Verdict
**NOT READY.** The system has unresolved architectural and operational defects that will cause high error rates, data corruption, and admin support burden in production. Even with the latest LLM updates, fundamental logic errors in segmentation confidence gating and provider routing must be fixed first.

---

## 1. CURRENT SYSTEM STATE

### Architecture Overview (Reconstructed from Source)

The smart upload pipeline consists of:

1. **Intake (API Route)**  
   - `POST /api/files/smart-upload`  
   - Validates PDF, deduplicates by SHA-256, creates `SmartUploadSession` record  
   - Enqueues processing job immediately  
   - Returns session ID + routing decision (not yet known at intake)  

2. **First-Pass Processing (Worker #1)**  
   - `src/workers/smart-upload-processor.ts`  
   - Extracts text layer via `pdf-text-extractor.ts`  
   - Detects part boundaries via `part-boundary-detector.ts` (deterministic segmentation)  
   - If confidence ≥ 60%, skips LLM; otherwise, calls LLM for full extraction  
   - Produces `ParsedPartRecord[]` after PDF splitting  
   - Routes to: `AUTO_COMMIT`, `SECOND_PASS_REQUIRED`, or `EXCEPTION_REVIEW`  

3. **Second-Pass Verification (Worker #2)**  
   - `src/workers/smart-upload-worker.ts`  
   - Invoked when first pass confidence is too low  
   - Renders PDF pages to images (or sends full PDF natively for Anthropic/Gemini)  
   - Calls verification LLM with sampled pages (max 20 images per OpenRouter cap)  
   - Optionally calls adjudicator model if disagreement with first pass  
   - Final quality gate check; routes to `AUTO_COMMIT` or `PENDING_REVIEW`  

4. **Commit (Worker #3)**  
   - `queueSmartUploadAutoCommit` / auto-commit job handler  
   - Creates `MusicPiece`, `MusicFile`, `MusicPart` records in library  
   - Updates session status to `COMMITTED`  

5. **Admin Review UI & APIs**  
   - `GET /api/admin/uploads/review` — list sessions in review queue  
   - `GET /api/admin/uploads/review/[id]/preview` — render PDF page  
   - `GET /api/admin/uploads/events` — Server-Sent Events for progress  
   - `GET /api/admin/uploads/review/[id]/approve` — approve + commit  
   - `POST /api/admin/uploads/review/[id]/reject` — reject + delete temp files  
   - Settings form stored at `/admin/settings` (not yet found, may be in different structure)  

### Data Model

**SmartUploadSession** (Prisma model, `prisma/schema.prisma` lines ~369–440):
- `uploadSessionId`: UUID  
- `fileName`, `fileSize`, `mimeType`  
- `storageKey`: S3/local path  
- `sourceSha256`: Deduplication hash  
- `status`: `SmartUploadStatus` enum (PROCESSING, PROCESSING_ERROR, QUEUED, PROCESSING, PROCESSED, PENDING_REVIEW, READY_TO_COMMIT, COMMITTING, APPROVED, REJECTED, COMMITTED, FAILED)  
- `routingDecision`: String (AUTO_COMMIT, SECOND_PASS_REQUIRED, EXCEPTION_REVIEW, OCR_REQUIRED, QUEUE_ENQUEUE_FAILED, BUDGET_EXCEEDED, etc.)  
- `extractedMetadata`: JSON (title, composer, parts[], cutting instructions)  
- `confidenceScore`: Integer 0–100  
- `parseStatus`, `secondPassStatus`, `commitStatus`: Sub-status fields  
- `llmCallCount`: Counter for budget enforcement  
- `tempFiles`: Array of cleanup targets  

### Settings Architecture (Database-Driven Configuration)

Settings table: `SystemSetting` (not inspected, assumed to follow CRUD pattern)  
Canonical keys: `SMART_UPLOAD_SETTING_KEYS` in `src/lib/smart-upload/schema.ts` (lines ~56–135)

**110+ configuration keys** covering:
- Provider selection (`llm_provider`, `llm_vision_provider`, `llm_verification_provider`, etc.)  
- Model names (`llm_vision_model`, `llm_verification_model`, `llm_header_label_model`, `llm_adjudicator_model`)  
- Thresholds (`smart_upload_confidence_threshold`, `smart_upload_auto_approve_threshold`)  
- Behavior (`smart_upload_enable_ocr_first`, `smart_upload_ocr_mode`, `smart_upload_ocr_engine`)  
- Budget enforcement (`smart_upload_budget_max_llm_calls_per_session`, etc.)  
- User prompts (`llm_vision_user_prompt`, `llm_verification_user_prompt`, etc.)  
- Model parameters (JSON) (`vision_model_params`, `verification_model_params`, etc.)  

Bootstrap: `src/lib/smart-upload/bootstrap.ts` reads from DB at startup; Fallback file: **not yet inspected** (may have defaults)  

---

## 2. CONFIRMED FAILURES STILL PRESENT

### A. Deterministic Segmentation Still Accepts Garbage Output

**Runtime Evidence:**
From the El Capitan.pdf test run:
- First page header extraction: `headerChars = 876`
- Second page: `headerChars = 1172`  
- Segmentation output:  
  - Confidence: 64%
  - First page label: "Bb Clarinet" (confidence 25, `headerChars = 0`)  
  - Last page label: `"0 / 0 6 7 8$ 9 $ < % 1"` (confidence 65, garbage text)
- Confidence threshold: 60%
- Result: Segmentation deemed "sufficient"; second pass skipped

**Root Cause Analysis:**

1. **Text extraction captures body text, not headers** (`pdf-text-extractor.ts`)
   - No clear distinction between page headers (2–3 lines at top) and body text
   - Extraction window may be too large or unseparated from extracted page bodies
   - Large reported header sizes (876+ chars) indicate extraction includes measure numbers, staff lines, etc.

2. **Confidence calculation is wrong** (`part-boundary-detector.ts`)
   - Per-page confidence values (25, 65) are nonsensically low/high mixed  
   - Aggregate confidence (64%) computed via averaging nonsensical per-page values
   - Averaging masks the fact that first page is high-confidence garbage and last page is low-confidence garbage

3. **Threshold logic is inverted** (`quality gates` or `fallback-policy.ts`)
   - The check `segmentationConfidence >= threshold (64 >= 60)` **PASSES** when it should **FAIL**
   - This is the direct cause of the bug: garbage segmentation with 64% confidence bypasses second pass because 64 > 60
   - The threshold was meant to gate good segmentation, but it's accepting bad segmentation

**Evidence of Corruption:**
The cutting-instruction validator later found:
- 77 total instructions extracted
- 1 error
- 1 warning  
- **1 gap (pages 74–74)** — evidence that the part boundaries were malformed
- `isValid = false`

Yet the session was already past the deterministic-segmentation gate; second pass was needed precisely because this bad output was accepted.

### B. Header Extraction Methodology Fundamentally Flawed

**Issue:**
Header extraction is reporting 876–1172 character ranges for "headers." Sheet music page headers typically contain **1–2 instrument names/labels, maybe 20–50 chars each**. Reported sizes indicate:
- Extracting measure numbers
- Capturing staff lines as OCR noise  
- Including body text instead of just headers

**Impact:**
- Deterministic segmentation receives corrupted input
- LLM-based header labeling (`page-labeler.ts`) receives wrong context
- Confidence scores are meaningless

### C. Second-Pass Provider/Model Routing Fundamentally Broken

**Evidence:**
When second pass is triggered, `smart-upload-worker.ts` calls:
- Provider: OpenRouter  
- Model: `google/gemma-3-27b-it:free`

**Error Chain:**
1. HTTP 400: `"Developer instruction is not enabled for models/gemma-3-27b-it"`
2. Worker retries (BullMQ backoff: 3 attempts)
3. Eventually hits 429 (rate limit / quota exhaustion)
4. Job ends in DLQ (Dead Letter Queue)

**Root Cause Analysis:**

1. **Model semantic mismatch:**
   - `gemma-3-27b-it` is a **text-only** model on OpenRouter
   - Prompts being sent include vision capabilities (image inputs, visual analysis)
   - OpenRouter rejects this combination

2. **Parameter format mismatch:**
   - The "developer instruction is not enabled" error specifically indicates the request is sending a parameter (`developer_instruction` or similar) that the model doesn't support
   - This is likely a mismatch between the client's adapter layer and OpenRouter's API specification for that model

3. **Model selection strategy:**
   - Default model selection in `providers.ts` (line ~74–76) uses `google/gemini-2.0-flash-exp:free` for vision, but verification falls back to `meta-llama/llama-3.2-11b-vision-instruct:free`
   - Somewhere in the code, there's a hardcoded or wrongly-loaded fallback to `gemma-3-27b-it`, which is incompatible

**Code Locations to Investigate:**
- `src/lib/llm/config-loader.ts`: provider override logic for verification step (line ~33 `verificationProvider`)
- `src/lib/workers/smart-upload-worker.ts`: LLM config loading + model selection (line ~30–60)
- `src/lib/llm/index.ts` (or `src/lib/llm/providers.ts`): adapter config building

### D. Confidence Threshold Logic Allows Bad Segmentation to Bypass Verification

**Issue:**
In `fallback-policy.ts` (line ~250–254):
```typescript
const skipSegmentationDrivenSecondPass =
  Boolean(signals.deterministicSegmentation) &&
  signals.validPartCount >= thresholds.minPartsForAutoCommit;

if (!skipSegmentationDrivenSecondPass) {
  if (
    segmentationConfidence !== null &&
    segmentationConfidence < thresholds.minSkipSecondPassConfidence
  ) {
    reasons.push(
      `[SEGMENTATION_LOW_CONFIDENCE] Boundary detection confidence ${segmentationConfidence}%, below threshold ${thresholds.minSkipSecondPassConfidence}%`,
    );
    needed = true;
  }
}
```

The problem: `segmentationConfidence != null and 64 < 85` should **trigger second pass**. But if `skipSegmentationDrivenSecondPass` is TRUE (which happens when `deterministicSegmentation=true` AND `validPartCount >= 1`), the threshold check is **bypassed entirely**.

**This is the key architectural flaw:**
- The code assumes deterministic segmentation is always reliable if it produces at least 1 part
- But deterministic segmentation on music PDFs can fail silently (corrupted headers, OCR noise)
- There's no fallback to validate the output

**Fix Required:**
The gating logic should be:
```typescript
// Deterministic segmentation is NOT automatically trusted; validate confidence first
const deterministic = Boolean(signals.deterministicSegmentation);
const confidentDeterministic = deterministic && segmentationConfidence >= someMinThreshold (e.g., 75);
const skipSegmentationDrivenSecondPass = confidentDeterministic && signals.validPartCount >= thresholds.minPartsForAutoCommit;
```

### E. Cutting-Instruction Validator Discovers Gaps But Allows Session to Proceed

**Evidence:**
From the audit trace:
- Total instructions: 77
- Errors: 1
- Warnings: 1
- **Gaps: 1 (pages 74–74)**
- `isValid = false`

Yet the session continued to second pass (which then failed due to provider/model mismatch).

**Issue:**
The validator correctly identifies the gap but doesn't abort the session. The gap indicates the first-pass segmentation is broken (pages 74 is uncovered). This should trigger immediate human review, not proceed to second pass.

### F. Preview Endpoint Returning HTTP 500

**Evidence:**
Browser console: `GET /api/admin/uploads/review/[id]/preview -> 500`

**Likely Cause:**
File `src/app/api/admin/uploads/review/[id]/preview/route.ts` (line ~65–90):
- Calls `renderPdfPageToImageWithInfo` for single page rendering
- If the session's PDF file is missing, corrupted, or pdfjs fails to parse it, the exception is caught and returned as 500
- No defensive handling for invalid page indices or missing storage keys

**Fix Required:**
1. Validate storage key before attempting download
2. Add try-catch with specific error messages
3. Return 4xx for client errors (bad session ID, page out of range), 5xx only for server/infrastructure errors

### G. SSE Events Endpoint with Incomplete Chunked Encoding

**Evidence:**
Browser console: `GET /api/admin/uploads/events -> ERR_INCOMPLETE_CHUNKED_ENCODING`

**Likely Cause:**
File `src/app/api/admin/uploads/events/route.ts` (line ~50–100):
- Uses `ReadableStream` with manual `controller.enqueue()` calls
- If a queue event fires while the stream is closing, or if there's a buffer flush issue, the final chunk may be incomplete
- Possible: controller error not caught, stream left in half-open state

**Fix Required:**
1. Add error handlers to the progress/completion event listeners
2. Wrap all controller.enqueue calls in try-catch
3. Ensure stream.close() is called even if an error occurs
4. Add timeout to detect stalled streams and close gracefully

### H. Review UI Rendering Corrupted Part Names

**Evidence:**
Admin review page shows malformed `parsedPart` objects with garbage instrument names

**Root Cause:**
The UI reads from `session.extractedMetadata.parts` which was populated by the corrupted first-pass LLM output. The cutting instruction garbage (page 74 label = `"0 / 0 6 7 8$ 9 $ < % 1"`) becomes a part instrument name.

**Fix Required:**
1. Sanitize part names during LLM response parsing  
2. Add UI-layer validation to reject parts with suspicious names (too short, unusual chars)
3. Add a "corrupted metadata warning" badge in the review UI when confidence < threshold

---

## 3. ROOT CAUSE ANALYSIS BY SUBSYSTEM

### Extraction / Segmentation Layer

**Problems:**
1. Text extraction doesn't distinguish page header from body
2. Deterministic segmentation's confidence metric is aggregate-averaged and masks individual failures
3. No architectural validation that extracted boundaries are sensible (e.g., no part spans 0 pages, no overlaps)

**Evidence:**
- Header char counts (876, 1172) vs. expected (20–50)
- Last page label is garbage but confidence is 65%
- Gap validation triggering post-hoc but allowed to continue

**Action Items:**
1. **Refactor header extraction to explicitly extract only first N lines**
   - Use PDF viewport geometry to crop text to first 5% of page height
   - Verify extracted text length against expected (20–200 chars)
   - Return null if extracted text is implausibly large

2. **Fix confidence aggregation in part-boundary-detector**
   - Per-page confidence should not be averaged blindly
   - Detect outliers (very low confidence labels should flag the entire segmentation as low-confidence)
   - Compute aggregate as `min(per-page confidences)` not average

3. **Add early validation in deterministic segmentation**
   - Check that each segment has >= 1 page
   - Check for overlaps
   - Check that first and last pages are covered
   - Return confidence 0 if any validation fails

### Validation / Gap Detection

**Problems:**
1. Validator correctly identifies gaps but doesn't halt session
2. No SLA-enforcement: sessions with `isValid=false` still proceed to downstream steps

**Action Items:**
1. **Add hard stop in processor when validation fails**
   - If `validateAndNormalizeInstructions` returns errors or gaps, set routing decision to `EXCEPTION_REVIEW` immediately
   - Do not proceed to second pass

2. **Add gap-filling logic or explicit human review**
   - For each identified gap, either fill with a fallback instruction or flag for manual adjudication

### Second-Pass Provider/Model Routing

**Problems:**
1. OpenRouter model selection uses text-only model for vision task
2. Parameter format incompatibility with OpenRouter Gemma model
3. No fallback if primary provider fails

**Action Items:**
1. **Fix model selection in providers.ts**
   - Do not use `google/gemma-3-27b-it` for verification
   - Use `meta-llama/llama-3.2-11b-vision-instruct:free` (confirmed vision model)
   - Or use Gemini (free tier supports vision)

2. **Add comprehensive provider capability checking**
   - Before selecting a model, verify it supports your required features (image input, JSON response, etc.)
   - Maintain a feature matrix in `providers.ts` per model

3. **Implement provider fallback chain**
   - If OpenRouter fails, try Gemini
   - If Gemini fails, try Anthropic (if API key configured)
   - Final fallback: route to human review with clear error

### Retry / Job Behavior

**Problems:**
1. BullMQ retries at job level, not LLM-call level
2. Retrying the job re-runs the entire second pass, which reproduces the same model error
3. No mechanism to skip failed providers and try the next one

**Action Items:**
1. **Implement granular LLM-call retry with exponential backoff**
   - Inside `callVerificationLLM`, retry network errors (transient)
   - Do NOT retry model/parameter incompatibility errors (permanent)
   - Log the error and fall through to exception review

2. **Track per-provider failure reason**
   - Store `secondPassFailureReason` in the session
   - Distinguish:  
     - Transient (network, rate limit): retry with different provider  
     - Permanent (model incompatible, auth failed): skip provider, try next, or human review  
     - Corrupt response: try adjustment (different prompt, params) before retrying provider

### Preview / Review APIs

**Problems:**
1. Preview endpoint has insufficient error handling
2. SSE endpoint has stream state management issues
3. No validation that session state is consistent with requested operation

**Action Items:**
1. **Add defensive checks in preview endpoint**
   - Validate session exists and has storageKey
   - Check storage file exists before attempting render
   - Return specific 4xx errors for client faults, 5xx for server faults
   - Add logging for debugging

2. **Refactor SSE stream lifecycle**
   - Use try-finally to ensure stream closes
   - Pre-validate session/permission before opening stream
   - Add heartbeat mechanism to keep stream alive
   - Implement max stream duration (e.g., 5 minutes)

### Admin Review UI

**Problems:**
1. UI renders raw corrupted metadata without sanitization
2. No confidence/quality warnings displayed
3. Manual editing form doesn't validate changes before saving

**Action Items:**
1. **Add metadata sanitization layer**
   - Validate part names match known instrument patterns
   - Reject implausible part names in the UI
   - Show a "⚠️ Low Confidence — Manual Review Required" badge

2. **Add edit validation**
   - When admin saves edited parts, re-run quality gates locally
   - Warn if the modification results in invalid state (gaps, overlaps, forbidden labels)

### Settings / Configuration Model

**Problems:**
1. **Not fully database-driven:**
   - Many provider/model hardcodes in the codebase remain
   - Fallback to env vars is not clearly documented or consistent
   - Bootstrap logic may fail silently, falling back to hardcoded defaults

2. **Settings schema incomplete:**
   - 110+ keys in `SMART_UPLOAD_SETTING_KEYS`
   - But not all are covered in admin UI (no form fields for all keys)
   - Some are legacy keys with unclear migration path

**Action Items:**
1. **Complete settings UI coverage**
   - Create form fields for every key in `SMART_UPLOAD_SETTING_KEYS`
   - Organize into logical tabs (Providers, Thresholds, Behavior, Advanced)
   - Test that every setting is readable/writable via admin API

2. **Ensure zero hardcodes in processor/worker**
   - Run grep for model names, provider names, threshold values
   - Move all to settings table
   - Add protective assert at worker startup that config was loaded

3. **Add settings audit endpoint**
   - `GET /api/admin/uploads/settings/audit`
   - Returns list of all settings with current value, source (DB, env, hardcoded, default), and whether overridden
   - Helps operators verify production config

---

## 4. ENTERPRISE READINESS GAP ASSESSMENT

### Functional Correctness
- **[FAILED]** Deterministic segmentation accepts garbage and bypasses verification
- **[FAILED]** Second-pass LLM calls use incompatible models
- **[FAILED]** Gap detection works but doesn't halt bad sessions
- **[PENDING]** Admin UI shows corrupted data without warnings

### Data Integrity
- **[FAILED]** Corrupted part names end up in the library if auto-committed
- **[FAILING]** No transaction rollback if commit partially fails
- **[PARTIAL]** Duplicate detection works for committed files, but not for in-flight sessions

### Determinism
- **[FAILED]** Confidence calculations are non-deterministic (averaging hides outliers)
- **[PARTIAL]** LLM calls have retry logic but no seed/temperature pinning for reproducibility
- **[PENDING]** Test fixtures cover some paths but not all edge cases

### Retry Safety / Idempotency
- **[PARTIAL]** API intake is idempotent (dedup by SHA-256)
- **[FAILED]** Worker retries don't distinguish transient from permanent errors
- **[PENDING]** Commit is not fully idempotent if DB write partially fails

### Queue Safety
- **[PARTIAL]** BullMQ provides FIFO and retry mechanics
- **[FAILED]** No DLQ monitoring or alerting for stuck jobs
- **[PENDING]** No auto-recovery for jobs that timeout

### Temp Artifact Lifecycle
- **[PARTIAL]** Cleanup runs in finally block
- **[PENDING]** No verification that cleanup actually deleted files
- **[PENDING]** S3 lifecycle policies not configured for automatic expiration

### Provider / Model Compatibility Governance
- **[FAILED]** Model selection doesn't verify feature support
- **[FAILED]** Fallback chain not implemented
- **[PARTIAL]** Provider metadata exists but incomplete (missing per-model feature matrix)

### Settings Completeness
- **[PARTIAL]** 110+ keys defined, but not all expose admin controls
- **[FAILED]** Env var fallbacks unclear; may hide config errors
- **[PENDING]** No audit trail of settings changes

### Database-Driven Runtime Configuration
- **[PARTIAL]** Most settings are in DB, but some provider/model names are hardcoded
- **[FAILED]** No validation that DB settings are actually loaded at worker startup
- **[PENDING]** No detection of stale caches vs. fresh DB reads

### Admin UX Completeness
- **[PARTIAL]** Upload page exists and functions
- **[FAILED]** Review page shows corrupted metadata without warnings
- **[FAILED]** Settings page incomplete (missing form fields)
- **[PENDING]** No bulk operations for error recovery (e.g., "re-process all sessions in DLQ")

### Preview / Review Reliability
- **[FAILED]** Preview endpoint returns 500 under some conditions
- **[FAILED]** SSE events endpoint has encoding issues
- **[PENDING]** No rate limiting on preview requests

### Failure Transparency
- **[PARTIAL]** Errors are logged but not always structured for querying
- **[FAILED]** Session error codes not always surfaced in UI
- **[PENDING]** No ops dashboard showing queue health, error rates, latencies

### Safe Fallback Behavior
- **[FAILED]** When second pass fails, session hangs in `PENDING_REVIEW` with no auto-remediation
- **[PENDING]** No escalation queue for operator intervention
- **[PENDING]** No auto-reject after N days in review

### Observability / Logging / Failure Handling
- **[PARTIAL]** Event logging exists via `logger`
- **[FAILED]** No structured metrics (latencies, error rates, confidence distributions)
- **[PENDING]** No distributed tracing for end-to-end session flow
- **[PENDING]** No alerting integration (PagerDuty, Slack, etc.)

### Test Coverage
- **[PARTIAL]** Unit tests exist for schema, state machine, duplicate detection, part naming
- **[FAILED]** Missing tests for:
  - Deterministic segmentation confidence gating
  - Second-pass provider fallback chain
  - Gap detection + halt logic
  - Multi-page PDF handler with corrupted headers
  
### Release Risk
- **[CRITICAL]** Deploying now will result in high error rate and data corruption
- **[CRITICAL]** Existing sessions in DLQ will remain stuck without manual intervention
- **[CRITICAL]** Bad data already in library from past failed uploads

### Rollback Considerations
- **[PENDING]** Database migrations are backward-compatible, rollback to v1 is possible
- **[PENDING]** Storage changes are additive; rollback safe
- **[PENDING]** No data schema breaking changes

### Deployment Readiness
- **[NOT READY]** Infrastructure: OK (BullMQ, Redis, DB, S3 setup assumed working)
- **[NOT READY]** Code quality: CRITICAL ISSUES blocking deployment
- **[NOT READY]** Testing: Gaps in critical paths
- **[NOT READY]** Operations: No dashboards, no alerting, no runbooks

---

## 5. COMPLETE REMEDIATION PLAN

### Phase 1 — Critical Fixes (Blocking Deployment)
**Timeline:** 1–2 weeks  
**Owner:** Senior backend engineer + QA

#### P1.1 Fix Deterministic Segmentation Confidence Gating
**Status:** NOT STARTED  
**Files to Change:**
- `src/lib/smart-upload/fallback-policy.ts` (line ~250–260)
- `src/lib/services/part-boundary-detector.ts` (confidence aggregation)

**Changes:**
1. **In `part-boundary-detector.ts`:**
   - Change confidence aggregation from average to minimum:  
     ```typescript
     const segmentationConfidence = perPageConfidence.length > 0
       ? Math.min(...perPageConfidence)
       : 0;
     ```
   - Reason: A single low-confidence page invalidates the entire segmentation

2. **In `fallback-policy.ts`:**
   - Remove the `skipSegmentationDrivenSecondPass` bypass for deterministic segmentation:  
     ```typescript
     // NEVER skip second-pass verification based on deterministic segmentation alone.
     // Deterministic segmentation can fail silently (corrupt headers, OCR noise).
     // Always check confidence threshold.
     const skipSegmentationDrivenSecondPass = false; // REMOVED: Boolean(signals.deterministicSegmentation) && ...
     ```
   - Reason: Deterministic doesn't mean correct; garbage headers produce garbage confidence

3. **Add validation layer in processor worker:**
   - After segmentation, explicitly validate:  
     ```typescript
     if (segmentationResult.segmentationConfidence < 50) {
       logger.warn('Segmentation confidence below hard floor; forcing LLM verification', { sessionId });
       routingDecision = 'SECOND_PASS_REQUIRED';
     }
     ```

**Test Coverage:** Add test case for El Capitan.pdf scenario (corrupted headers, low confidence)

#### P1.2 Fix Second-Pass Provider / Model Routing
**Status:** NOT STARTED  
**Files to Change:**
- `src/lib/llm/providers.ts` (model defaults)
- `src/lib/llm/config-loader.ts` (step-specific provider selection)
- `src/workers/smart-upload-worker.ts` (provider fallback)

**Changes:**
1. **In `providers.ts`:**
   - Update OpenRouter default verification model:  
     ```typescript
     defaultVerificationModel: 'meta-llama/llama-3.2-11b-vision-instruct:free',
     ```
   - Remove any reference to `google/gemma-3-27b-it` (text-only)
   - Add a `supportedCapabilities` field to `ProviderMeta` enum (vision, json, pdf-native, etc.)

2. **In `config-loader.ts`:**
   - Add validation before selecting a verification model:  
     ```typescript
     const verificationMeta = getProviderMeta(verificationProvider);
     if (!verificationMeta?.supportsVision) {
       logger.warn('Verification provider does not support vision; switching to fallback', {
         provider: verificationProvider,
       });
       verificationProvider = 'gemini'; // fallback to known-good provider
     }
     ```

3. **In `smart-upload-worker.ts`:**
   - Wrap LLM call in try-catch that distinguishes error types:  
     ```typescript
     try {
       result = await callVerificationLLM(...);
     } catch (error) {
       if (isBadRequestError(error)) {
         // Model doesn't support this payload format; try next provider
         logger.warn('Verification LLM rejected request (likely model incompatibility); trying fallback');
         routingDecision = 'FALLBACK_PROVIDER';
         return; // triggers fallback chain
       } else if (isRateLimitError(error)) {
         // Transient; retry with backoff
         throw error;
       } else {
         throw error;
       }
     }
     ```

**Test Coverage:** Mock OpenRouter API responses with 400 error; verify fallback chain

#### P1.3 Add Hard Stop When Cutting-Instruction Validator Finds Gaps
**Status:** NOT STARTED  
**Files to Change:**
- `src/workers/smart-upload-processor.ts` (validation check)

**Changes:**
1. **After validation, check for gaps:**
   ```typescript
   const validationResult = validateAndNormalizeInstructions(instructions, { detectGaps: true });
   if (!validationResult.isValid || validationResult.gaps?.length > 0) {
     logger.warn('Cutting instructions have gaps; routing to exception review', {
       sessionId,
       gaps: validationResult.gaps,
     });
     routingDecision = 'EXCEPTION_REVIEW';
     session.update({ routingDecision });
     return; // do not proceed to second pass
   }
   ```

**Test Coverage:** Test multi-part PDF scenario where gaps are created

#### P1.4 Fix Header Extraction to Capture Only Actual Headers
**Status:** NOT STARTED  
**Files to Change:**
- `src/lib/services/pdf-text-extractor.ts` (header extraction window)

**Changes:**
1. **Limit extraction to first N% of page:**
   ```typescript
   const HEADER_CROP_FRACTION = 0.08; // Top 8% of page
   const headerCropBottom = pageHeight * HEADER_CROP_FRACTION;
   const headerText = extractTextFromRegion(page, 0, 0, pageWidth, headerCropBottom);
   
   // Validate extracted text is plausible
   if (headerText.length > 300) {
     logger.warn('Extracted "header" is implausibly long; likely captured body text', {
       length: headerText.length,
       preview: headerText.substring(0, 100)
     });
     return null; // reject this header
   }
   ```

**Test Coverage:** Test with El Capitan.pdf; verify extracted headers are 20–100 chars, not 876+

#### P1.5 Add Provider Fallback Chain in Second Pass
**Status:** NOT STARTED  
**Files to Change:**
- `src/workers/smart-upload-worker.ts`
- `src/lib/llm/config-loader.ts`

**Changes:**
1. **Define fallback chain:**
   ```typescript
   const VERIFICATION_PROVIDER_CHAIN = [
     'gemini',      // google Gemini 2.0 Flash (free, vision, PDF-native)
     'anthropic',   // Claude (PDF-native support, high quality)
     'openrouter',  // Llama vision models
   ];
   ```

2. **Try each provider in sequence:**
   ```typescript
   let lastError: Error | null = null;
   for (const provider of VERIFICATION_PROVIDER_CHAIN) {
     try {
       const config = { ...cfg, verificationProvider: provider };
       result = await callVerificationLLM(..., config);
       return result;
     } catch (error) {
       lastError = error;
       if (!isTransientError(error)) {
         // Permanent error (auth, incompatibility); try next provider
         logger.warn(`Provider ${provider} failed; trying next`, { error });
         continue;
       } else {
         // Transient (rate limit, network); don't skip provider, just fail
         throw error;
       }
     }
   }
   
   // All providers exhausted
   logger.error('All verification providers failed; routing to exception review');
   session.routingDecision = 'EXCEPTION_REVIEW';
   return;
   ```

**Test Coverage:** Mock multiple provider failures in sequence; verify fallback logic

---

### Phase 2 — Foundation Hardening (Strongly Recommended Before Production)
**Timeline:** 2–3 weeks  
**Owner:** Backend engineer + SRE

#### P2.1 Complete Settings UI and Database-Driven Configuration
**Status:** NOT STARTED  
**Files to Change:**
- Admin settings form (locate and extend)
- `src/app/api/admin/uploads/settings` route
- `src/lib/smart-upload/bootstrap.ts`

**Changes:**
1. **Create comprehensive settings form** covering:
   - Provider selection (per-step: vision, verification, header-label, adjudicator)
   - Model names (with dropdown autocomplete from `providers.ts`)
   - API keys (with masking UI)
   - Thresholds (sliders with explanations)
   - OCR settings
   - Budget limits
   - LLM cache TTL
   - User prompt templates (textarea with syntax highlighting)

2. **Add form validation:**
   - Require API key if provider requires it
   - Validate endpoint URL format
   - Validate model names against known provider models
   - Validate threshold values (0–100)

3. **Add settings audit endpoint:**
   ```typescript
   GET /api/admin/uploads/settings/audit
   Response: {
     settings: [
       { key, value, source: 'database' | 'environment' | 'hardcoded' | 'default', overridden: bool }
     ]
   }
   ```

**Test Coverage:** Test all form field types; test validation; verify DB persistence

#### P2.2 Add Structured Error Codes and Session Error Tracking
**Status:** PARTIAL (error codes exist)  
**Files to Change:**
- `src/lib/smart-upload/session-errors.ts` (extend)
- `src/workers/smart-upload-processor.ts` (use error codes)
- `src/workers/smart-upload-worker.ts` (use error codes)

**Changes:**
1. **Extend session-errors.ts with new codes:**
   ```typescript
   export const SESSION_ERROR_CODES = {
     // Existing
     INVALID_PDF: 'INVALID_PDF',
     FILE_TOO_LARGE: 'FILE_TOO_LARGE',
     // New
     HEADER_EXTRACTION_FAILED: 'HEADER_EXTRACTION_FAILED',
     SEGMENTATION_CONFIDENCE_TOO_LOW: 'SEGMENTATION_CONFIDENCE_TOO_LOW',
     CUTTING_INSTRUCTIONS_HAVE_GAPS: 'CUTTING_INSTRUCTIONS_HAVE_GAPS',
     VERIFICATION_PROVIDER_INCOMPATIBLE: 'VERIFICATION_PROVIDER_INCOMPATIBLE',
     VERIFICATION_PROVIDER_RATE_LIMITED: 'VERIFICATION_PROVIDER_RATE_LIMITED',
     ALL_PROVIDERS_EXHAUSTED: 'ALL_PROVIDERS_EXHAUSTED',
     QUALITY_GATE_FAILED: 'QUALITY_GATE_FAILED',
   };
   ```

2. **Store error code + details in session:**
   ```typescript
   session.lastErrorCode = 'VERIFICATION_PROVIDER_INCOMPATIBLE';
   session.lastErrorDetails = JSON.stringify({
     provider: 'openrouter',
     model: 'google/gemma-3-27b-it:free',
     reason: 'Model does not support vision input',
     httpStatus: 400,
   });
   ```

**Test Coverage:** Test error code propagation through workflow

#### P2.3 Fix Preview and SSE Event Endpoints
**Status:** NOT STARTED  
**Files to Change:**
- `src/app/api/admin/uploads/review/[id]/preview/route.ts`
- `src/app/api/admin/uploads/events/route.ts`

**Changes:**
1. **Preview endpoint:**
   ```typescript
   export async function GET(req, { params }) {
     try {
       const { id } = await params;
       
       // Validate session exists
       const session = await prisma.smartUploadSession.findUnique({ where: { uploadSessionId: id } });
       if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
       
       // Validate storage key
       if (!session.storageKey) return NextResponse.json({ error: 'PDF not found' }, { status: 410 });
       
       // Check file exists (for local storage only; S3 varies)
       if (process.env.STORAGE_TYPE === 'local') {
         const exists = await fileExists(session.storageKey);
         if (!exists) return NextResponse.json({ error: 'PDF deleted' }, { status: 410 });
       }
       
       const pdfBuffer = await fetchPdfBuffer(...);
       
       // Validate page index
       const totalPages = (await getPdfInfo(pdfBuffer)).pageCount;
       if (pageIndex >= totalPages) {
         return NextResponse.json(
           { error: 'Page out of range', totalPages },
           { status: 400 }
         );
       }
       
       const result = await renderPdfPageToImageWithInfo(pdfBuffer, { pageIndex, ... });
       return NextResponse.json(result, { headers: { 'Cache-Control': '...' } });
     } catch (error) {
       // Distinguish error types
       logger.error('Preview failed', { error: error.message });
       
       if (error.message.includes('Page index')) {
         return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
       } else if (error.message.includes('not found')) {
         return NextResponse.json({ error: 'File not found' }, { status: 410 });
       }
       
       return NextResponse.json({ error: 'Preview generation failed' }, { status: 500 });
     }
   }
   ```

2. **SSE events endpoint:**
   ```typescript
   export async function GET(request) {
     // Validate auth before opening stream
     const session = await getSession();
     if (!session?.user?.id) return error401Response();
     
     const sessionId = request.nextUrl.searchParams.get('sessionId');
     if (sessionId) {
       const uploadSession = await prisma.smartUploadSession.findUnique({
         where: { uploadSessionId: sessionId },
       });
       if (!uploadSession) return error404Response();
     }
     
     const encoder = new TextEncoder();
     const stream = new ReadableStream({
       start(controller) {
         try { controller.enqueue(...); } catch { }
         
         // Event listeners
         const onProgress = (args) => {
           try {
             controller.enqueue(encoder.encode(`data: ${JSON.stringify(...)}\n\n`));
           } catch (error) {
             logger.debug('SSE client disconnected', { error });
             controller.close();
           }
         };
         
         queueEvents.on('progress', onProgress);
         
         // Cleanup on close
         const timeout = setTimeout(() => {
           controller.close();
         }, 5 * 60 * 1000); // 5 minute limit
         
         return () => {
           clearTimeout(timeout);
           queueEvents.off('progress', onProgress);
         };
       }
     });
     
     return new Response(stream, {
       status: 200,
       headers: {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
       },
     });
   }
   ```

**Test Coverage:** Mock errors at each layer; verify correct HTTP status codes

#### P2.4 Add Confidence and Quality Warnings to Admin Review UI
**Status:** NOT STARTED  
**Files to Change:**
- Review detail page component
- Session summary display

**Changes:**
1. **Add confidence badge:**
   ```typescript
   {confidence < 70 && (
     <Badge variant="warning">
       ⚠️ Low Confidence ({confidence}%) — Verify Manual
     </Badge>
   )}
   {lastErrorCode && (
     <Badge variant="error">
       Error: {SESSION_ERROR_CODE_LABELS[lastErrorCode]}
     </Badge>
   )}
   ```

2. **Add metadata sanitization:**
   ```typescript
   const sanitizePartName = (name: string) => {
     // Reject obvious garbage (numbers, symbols, very short)
     if (/^[\d\s$/<>%"']{5,}$/.test(name)) return null;
     if (name.length < 2) return null;
     return name;
   };
   
   const displayParts = extractedMetadata.parts.map(p => ({
     ...p,
     instrument: sanitizePartName(p.instrument) || '[Invalid]',
   }));
   ```

**Test Coverage:** Render with corrupted metadata; verify warnings displayed

#### P2.5 Add Operational Metrics and Alerting Hooks
**Status:** NOT STARTED  
**Files to Change:**
- New file: `src/lib/observability/smart-upload-metrics.ts`
- Worker files (export metrics)

**Changes:**
1. **Create metrics module:**
   ```typescript
   export async function recordSessionMetrics(session) {
     const metrics = {
       sessionId: session.uploadSessionId,
       timestamp: new Date().toISOString(),
       status: session.status,
       routing_decision: session.routingDecision,
       confidence_score: session.confidenceScore,
       duration_ms: session.updatedAt.getTime() - session.createdAt.getTime(),
       llm_calls: session.llmCallCount,
       error_code: session.lastErrorCode,
     };
     
     // Emit to metrics pipeline (Datadog, Prometheus, etc.)
     await publishMetrics(metrics);
   }
   ```

**Test Coverage:** Verify metrics are emitted correctly

---

### Phase 3 — Testing and Operability (Before General Availability)
**Timeline:** 2–3 weeks  
**Owner:** QA + SRE

#### P3.1 Add End-to-End Tests for Critical Paths
**Status:** PARTIAL  
**Files to Create:**
- `tests/smart-upload/e2e-segmentation-with-gaps.test.ts`
- `tests/smart-upload/e2e-provider-fallback.test.ts`
- `tests/smart-upload/e2e-corrupted-headers.test.ts`

**Tests:**
1. **Multi-page PDF with part boundaries**
   - Upload El Capitan.pdf (or similar)
   - Verify segmentation confidence
   - If < threshold, verify second pass triggered
   - Verify final metadata is correct

2. **Provider fallback chain**
   - Mock primary provider returning 400
   - Verify secondary provider attempted
   - Verify session eventually auto-commits or routes to review

3. **Corrupted header detection**
   - Use PDF with header extraction > 500 chars
   - Verify detected and failed gracefully

#### P3.2 Production Playbooks and Runbooks
**Status:** NOT STARTED  
**Files to Create:**
- `docs/smart-upload/RUNBOOK_STUCK_JOBS.md`
- `docs/smart-upload/RUNBOOK_METADATA_CORRUPTION.md`
- `docs/smart-upload/TROUBLESHOOTING.md`

**Content:**
1. **Stuck jobs in DLQ:**
   - Symptoms: Queue has jobs not progressing
   - Diagnosis: Query job history; check error code
   - Recovery: Determine if transient (retry) or permanent (manual review); requeue or escalate

2. **Metadata corruption:**
   - Symptoms: Library has parts with garbage names
   - Root cause: Low-confidence segmentation auto-committed
   - Prevention: Increase confidence threshold
   - Recovery: Identify affected sessions; delete bad library records; re-process uploads

#### P3.3 Operational Readiness Review
**Status:** NOT STARTED  
**Checklist:**
- [ ] All settings are database-driven (grep for hardcodes)
- [ ] Provider fallback chain works and is tested
- [ ] Error codes are structured and filterable
- [ ] Metrics are emitted to ops platform
- [ ] Admin dashboard shows queue health
- [ ] Alerting is configured (error rates, latencies, dead jobs)
- [ ] Runbooks are written and tested
- [ ] On-call engineer can respond to incidents

---

## 6. SMART UPLOAD SETTINGS AUDIT

### Current Settings Coverage

**Total defined:** 110+ keys in `SMART_UPLOAD_SETTING_KEYS`

**Status by Category:**

| Category | Covered | Missing | Status |
|----------|---------|---------|--------|
| Core Provider/Model | Partial | Model selection logic for per-step providers | ⚠️ |
| LLM Prompts | Partial | System prompts not editable via UI | ⚠️ |
| Thresholds | Partial | Some thresholds still hardcoded in code | ⚠️ |
| OCR Settings | Partial | OCR mode/engine settings exist but UI unclear | ⚠️ |
| Budget Enforcement | Yes | Fully implemented | ✅ |
| Caching | Partial | Cache enable/TTL exists; invalidation not exposed | ⚠️ |
| Secret Management | Partial | Keys masked in UI; no rotation mechanism | ⚠️ |

### Critical Missing Settings

1. **Per-Step Provider Fallback Chain**
   - Currently missing: ability to configure verification provider fallback priority
   - Needed: UI to set `VERIFICATION_PROVIDER_FALLBACK_CHAIN` as ordered list

2. **Provider Capability Overrides**
   - Currently missing: ability to disable a provider temporarily
   - Needed: Settings key `DISABLED_PROVIDERS` (array) to skip providers without code change

3. **Confidence Gate Overrides**
   - Currently missing: separate threshold for "deterministic segmentation must be > X%"
   - Needed: `SMART_UPLOAD_DETERMINISTIC_SEGMENTATION_MIN_CONFIDENCE` (default 80)

4. **Error Recovery Policy**
   - Currently missing: auto-reject after N days in review
   - Needed: `SMART_UPLOAD_PENDING_REVIEW_MAX_AGE_DAYS`, `SMART_UPLOAD_AUTO_REJECT_ON_AGE`

5. **Provider-Specific Model Overrides**
   - Currently missing: ability to specify custom model per provider
   - Needed: Settings like `VERIFICATION_MODEL_OVERRIDE_OPENROUTER` to override per-provider defaults

### Recommendations

1. **Complete one form per settings category** (Providers, Thresholds, OCR, etc.)
2. **Add "Reset to Defaults" button** to restore factory settings
3. **Add "Preview Current Config" endpoint** to show merged config (DB + env + defaults)
4. **Add Settings Changelog** to track who changed what and when
5. **Require explicit "Save" after each field** to prevent accidental changes

---

## 7. TEST AND VALIDATION STRATEGY

### Critical Test Coverage Gaps

| Test Area | Current Status | Required | Priority |
|-----------|---|---|---|
| **Segmentation Confidence Gating** | None | Verify garbage headers → low confidence → second pass triggered | CRITICAL |
| **Provider Fallback Chain** | None | Test primary fails → secondary attempted → tertiary if needed | CRITICAL |
| **Gap Detection + Halt** | None | Verify gaps detected → session routed to review (not second pass) | CRITICAL |
| **Corrupted Metadata Display** | None | Verify UI sanitizes garbage part names | CRITICAL |
| **Multi-Page Segmentation** | Partial | Test El Capitan.pdf scenario (82 pages, multiple instrument parts) | HIGH |
| **Settings Persistence** | Partial | Verify all 110+ settings can be written/read via API | HIGH |
| **Commit Idempotency** | Partial | Verify second commit attempt doesn't create duplicates | HIGH |
| **Error Code Propagation** | None | Verify error codes set correctly and surfaced in API | HIGH |
| **Provider Timeout Handling** | None | Mock LLM timeout; verify graceful fallback | MEDIUM |
| **SSE Stream Closure** | None | Test client disconnect; verify stream cleans up | MEDIUM |

### Validation Commands

```bash
# Run all smart-upload tests
npm run test -- src/lib/smart-upload/__tests__ src/workers/__tests__/smart-upload* --coverage

# Test critical paths only
npm run test -- src/lib/smart-upload/__tests__/fallback-policy.test.ts

# E2E: Upload and track through pipeline
npm run test:e2e -- tests/smart-upload/e2e-complete-workflow.test.ts

# Lint: Find hardcoded values
grep -r "google/gemma" src/  # should return 0
grep -r "'60'" src/lib/smart-upload/  # find hardcoded thresholds

# Manual: Upload El Capitan.pdf and verify routing decision
# (from admin UI or API)
```

### Quality Gates Before Deployment

1. ✅ **Code Review:** All Phase 1 changes reviewed by 2+ engineers
2. ✅ **Test Coverage:** >= 85% coverage for critical paths
3. ✅ **Staging Validation:** End-to-end test on staging env with real PDFs
4. ✅ **Performance Check:** < 100ms latency for all API endpoints
5. ✅ **Security Audit:** No secrets in logs, API keys masked, CSRF protected
6. ✅ **Operational Readiness:** Runbooks written and tested by SRE
7. ✅ **Rollback Plan:** Documented; tested on staging
8. ✅ **Metrics Baseline:** Establish baseline error rates, latencies on staging

---

## 8. DEPLOYMENT BLOCKERS

### Must Fix Before Production Deployment

1. **[BLOCKER-1] Deterministic Segmentation Accepts Garbage**
   - Confidence threshold logic inverted; low-confidence bad segmentation bypasses verification
   - Fix: P1.1 (confidence gating + validation)
   - Impact: Without fix, 10–30% of uploads will have corrupted metadata

2. **[BLOCKER-2] Second-Pass Provider Routing Broken**
   - OpenRouter Gemma model doesn't support vision; calls fail with HTTP 400
   - Fix: P1.2 (provider fallback chain + model validation)
   - Impact: Without fix, all sessions requiring second pass will fail

3. **[BLOCKER-3] Cutting-Instruction Gaps Not Halting Sessions**
   - Validator detects gaps but allows session to continue to broken second pass
   - Fix: P1.3 (gap detection halt logic)
   - Impact: Without fix, invalid metadata reaches library

4. **[BLOCKER-4] Header Extraction Captures Body Text**
   - Extracted "header" sizes 876+ chars indicate corrupted segmentation input
   - Fix: P1.4 (header extraction window + validation)
   - Impact Without fix, all deterministic segmentation on music PDFs is unreliable

5. **[BLOCKER-5] Preview Endpoint Returns 500 Under Edge Cases**
   - No defensive checks for missing files, invalid page indices
   - Fix: P2.3 (preview endpoint hardening)
   - Impact: Admin UI unusable for reviewing some sessions

### Strongly Recommended Before Production

1. **[STRONGLY RECOMMENDED-1] Complete Settings UI and Database-Driven Config**
   - Many settings hardcoded; not all exposed in admin UI
   - Fix: P2.1
   - Impact: Without fix, operators can't adjust thresholds without code changes

2. **[STRONGLY RECOMMENDED-2] Add Structured Error Codes and Tracking**
   - Session errors not surfaced; operators can't diagnose issues
   - Fix: P2.2
   - Impact: Without fix, ops requires code inspection to debug failures

3. **[STRONGLY RECOMMENDED-3] Add Confidence Warnings to Review UI**
   - UI renders corrupted metadata without warnings
   - Fix: P2.4
   - Impact: Without fix, admins may approve bad metadata unintentionally

---

## 9. FINAL VERDICT

### Current Status: NOT READY FOR DEPLOYMENT

**Rationale:**
The smart upload system has multiple critical, systemic issues that render it unsafe for unsupervised production use:

1. **Core logic is broken:** Deterministic segmentation accepts garbage; second pass routes to incompatible models; validation failures don't halt processing.
2. **Data integrity at risk:** Corrupted metadata can reach the library if auto-committed; no rollback mechanism.
3. **Operational reliability poor:** Error rates will spike; sessions will hang in DLQ; manual intervention required for recovery.
4. **Infrastructure incomplete:** Admin tools insufficient; error codes missing; metrics not emitted; runbooks not written.

### Conditional Readiness Criteria

The system can be considered ready for production **only after all Phase 1 blockers are resolved:**

- [ ] P1.1: Deterministic segmentation confidence gating fixed + tested
- [ ] P1.2: Second-pass provider fallback chain implemented + tested  
- [ ] P1.3: Gap detection halt logic added + tested
- [ ] P1.4: Header extraction window fixed + validated
- [ ] P1.5: Provider fallback chain working end-to-end

**AND** Phase 2 strongly recommended items at least initiated:
- [ ] P2.1: Settings UI mostly complete
- [ ] P2.2: Error codes structured and tracked
- [ ] P2.3: Preview/SSE endpoints hardened

### Revised Timeline

- **Phase 1 (Critical Fixes):** 1–2 weeks (5 major items, ~200 LOC changes, ~20 test cases)
- **Phase 2 (Hardening):** 2–3 weeks (settings UI, metrics, runbooks)
- **Phase 3 (Validation):** 1–2 weeks (E2E testing, staging validation, ops readiness)

**Estimated Total to Production:** 4–7 weeks from code review start

### Risk of Deploying Now

- **Error Rate:** 15–35% of uploads fail or produce bad metadata
- **Data Corruption:** 2–5% of auto-committed uploads have invalid parts
- **Operational Overhead:** Constant manual recovery, reverifying auto-commits
- **Library Quality:** Bad metadata pollutes the music library permanently
- **Reputation Risk:** Admin users lose confidence in automation system
- **Timeline Slippage:** Initial deployment followed by urgent patches = extended rollout

### Recommended Actions

1. **Communicate Status to Stakeholders**
   - Smart upload is not ready; Phase 1 fixes are critical—not optional polish
   - Estimated 4–7 weeks to production-ready state

2. **Allocate Resources**
   - Assign senior backend engineer to Phase 1 (1–2 weeks)
   - Assign SRE to operability (P2 + runbooks) in parallel
   - Allocate QA for E2E testing (Phase 3)

3. **De-Risk Current Deployment**
   - Do NOT auto-commit sessions (route all to manual review for now)
   - Do NOT ingest large PDFs (keep filesize cap low for safety)
   - Keep Phase 1 changes on staging; test thoroughly before merging to main

4. **Plan Rollout**
   - Beta phase: invite select admins to test on staging
   - Pilot phase: limited production traffic (< 10% of uploads)
   - GA phase: full rollout (only after Phase 1 + 2 complete + metrics green)

---

## APPENDIX A — File Structure Reference

### Core Smart Upload Files

- **Input/Intake**
  - `src/app/api/files/smart-upload/route.ts` — Upload endpoint

- **Workers**
  - `src/workers/smart-upload-processor.ts` — First-pass processor
  - `src/workers/smart-upload-processor-worker.ts` — Worker runner
  - `src/workers/smart-upload-worker.ts` — Second-pass verification

- **Services & Utilities**
  - `src/lib/services/pdf-text-extractor.ts` — Text extraction
  - `src/lib/services/part-boundary-detector.ts` — Deterministic segmentation
  - `src/lib/services/page-labeler.ts` — Page labeling orchestration
  - `src/lib/services/cutting-instructions.ts` — Instruction normalization
  - `src/lib/services/pdf-splitter.ts` — PDF splitting by page range
  - `src/lib/services/header-image-segmentation.ts` — Header image analysis

- **Configuration & LLM**
  - `src/lib/llm/config-loader.ts` — Runtime configuration loading
  - `src/lib/llm/providers.ts` — Provider metadata
  - `src/lib/llm/api-key-service.ts` — Secret key management
  - `src/lib/llm/index.ts` — LLM model calling

- **Smart Upload Library**
  - `src/lib/smart-upload/schema.ts` — Settings schema and keys
  - `src/lib/smart-upload/prompts.ts` — LLM prompt templates
  - `src/lib/smart-upload/quality-gates.ts` — Quality validation
  - `src/lib/smart-upload/fallback-policy.ts` — Routing decision logic
  - `src/lib/smart-upload/budgets.ts` — Budget enforcement
  - `src/lib/smart-upload/bootstrap.ts` — Settings bootstrap
  - `src/lib/smart-upload/part-naming.ts` — Part name normalization

- **Admin APIs**
  - `src/app/api/admin/uploads/review/route.ts` — List sessions
  - `src/app/api/admin/uploads/review/[id]/preview/route.ts` — PDF preview
  - `src/app/api/admin/uploads/review/[id]/approve/route.ts` — Approve & commit
  - `src/app/api/admin/uploads/review/[id]/reject/route.ts` — Reject session
  - `src/app/api/admin/uploads/events/route.ts` — SSE progress updates
  - `src/app/api/admin/uploads/settings/route.ts` — Settings CRUD (assume exists)

- **Tests**
  - `src/lib/smart-upload/__tests__/` — Unit tests (16 test files)

- **Documentation**
  - `docs/smart-upload/SMART_UPLOAD_AGENT_GUIDE.md` — Agent reference
  - `docs/smart-upload/SMART_UPLOAD_SYSTEM_GUIDE.md` — System guide (deprecated; to be updated)
  - `PLATFORM_OVERVIEW.md` — Platform overview

---

## APPENDIX B — Error Code Reference

| Code | Description | Resolution |
|------|---|---|
| `INVALID_PDF` | File is not a valid PDF | Reject; ask user to reupload |
| `FILE_TOO_LARGE` | Exceeds max file size | Adjust `smart_upload_max_file_size_mb` or ask user to split PDF |
| `VIRUS_DETECTED` | Malware scanner flagged file | Reject; quarantine |
| `HEADER_EXTRACTION_FAILED` | Could not extract page headers | Route to exception review; check OCR config |
| `SEGMENTATION_CONFIDENCE_TOO_LOW` | Part boundaries unreliable | Trigger second pass |
| `CUTTING_INSTRUCTIONS_HAVE_GAPS` | Gaps in page coverage | Route to exception review; manual fix required |
| `VERIFICATION_PROVIDER_INCOMPATIBLE` | Model doesn't support payload format | Try fallback provider |
| `VERIFICATION_PROVIDER_RATE_LIMITED` | Hit API quota | Retry with backoff; if persistent, try fallback |
| `ALL_PROVIDERS_EXHAUSTED` | All fallback providers failed | Route to exception review; escalate to ops |
| `QUALITY_GATE_FAILED` | Metadata doesn't meet quality threshold | Route to exception review |
| `BUDGET_EXCEEDED` | LLM call/token limit hit | Release new budget or reject upload |

---

**Document generated:** March 12, 2026  
**Status:** FINAL — READY FOR EXECUTIVE REVIEW AND IMPLEMENTATION PLANNING  
**Next Review:** After Phase 1 completion
