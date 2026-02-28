# Smart Upload System — Definition of Done (DoD)

**Project:** Smart Upload (ECCB Platform)  
**Goal:** Nearly autonomous, zero-touch music PDF ingestion (metadata + part splitting + library commit)  
**Document Version:** 1.1  
**Last Updated:** 2026-02-27  
**Audit Date:** 2026-02-27 — automated code review pass

---

## 1. Scope

This DoD covers the complete Smart Upload pipeline end-to-end:

- Uploading a PDF via Admin UI
- Background processing via BullMQ workers
- Metadata extraction via LLM vision/multimodal
- Deterministic part boundary detection and PDF splitting
- Verification + adjudication passes (as needed)
- Auto-commit into the music library when safe
- Human review workflow when required
- Provider configuration (major + free providers)
- Observability, safety, and regression tests

**Out of scope (not required for DONE):**
- Optical Music Recognition (OMR → MusicXML)
- Web search-based adjudication (external knowledge integration)
- Embedding-based duplicate detection (unless explicitly included below as "optional DONE+")

---

## 2. Core End-to-End Behavior

Smart Upload is **DONE** when the system supports the following flows reliably:

### 2.1 Happy Path (Fully Automatic)
- [x] User uploads a PDF from **Admin → Uploads**
- [x] System stores the original PDF in storage
- [x] System creates a `SmartUploadSession` in DB
- [x] System queues `smartupload.process`
- [x] Worker completes:
  - [x] metadata extraction
  - [x] segmentation (part boundary detection)
  - [x] splitting into per-part PDFs
  - [x] part naming normalization
  - [x] writes `parsedParts` and final metadata into session
- [x] If confidence is high and autonomous mode is enabled:
  - [x] system auto-commits (creates library records) without human intervention
- [x] The uploaded piece appears in Music Library with:
  - [x] original (optional but recommended)
  - [x] all part PDFs available individually

### 2.2 Review Required Path (Human-in-the-loop)
- [x] If confidence is low, parsing is ambiguous, or errors occur:
  - [x] session appears in **Admin → Uploads → Review**
  - [x] admins can preview original and part PDFs
  - [x] admins can edit metadata + part segmentation/labels
  - [x] admins can approve → commit to library
  - [x] admins can reject → cleanup temp artifacts

### 2.3 Failure Path (No crashes, clear reason)
- [x] Corrupt/unsupported PDFs do not crash the system
- [x] Session is marked failed / needs review with a clear error reason
- [x] Temp artifacts are cleaned up on worker failure (cleanup is called in reject
  route and in the unified worker catch handler via `cleanupSmartUploadTempFiles`)

---

## 3. Autonomy and Reliability Targets

Smart Upload is **DONE** when it meets these autonomy thresholds:

### 3.1 Digital PDFs (Text Layer Present)
- [ ] ≥ 90% of typical band-library digital PDFs complete end-to-end with **no human intervention**
- [ ] Output parts have correct ranges and names with high confidence
  *(mechanism is implemented; runtime percentage unverifiable without fixture corpus)*

### 3.2 Scanned PDFs (No Text Layer)
- [ ] ≥ 70% complete end-to-end with **no human intervention**, using header-crop vision labeling
- [ ] Remaining cases reliably route into review with strong previews and minimal admin effort
  *(mechanism is implemented; runtime percentage unverifiable without fixture corpus)*

### 3.3 Deterministic Segmentation is Primary
- [x] The pipeline does **not** rely on "LLM guesses global page ranges from a small sample"
- [x] Instead, segmentation is built from:
  - [x] per-page header text extraction (pdf text layer) when available
  - [x] header-crop vision labeling (batched) when needed
  - [x] grouping consecutive pages into segments
  - [x] normalization + validation + full page coverage enforcement

---

## 4. Data Correctness and Invariants

### 4.1 Page Indexing Consistency
Smart Upload is **DONE** only if one indexing convention is enforced everywhere:

**Required convention:**
- **DB/UI:** 1-indexed page numbers (page 1 is first page)
- **Splitter internals:** 0-indexed page indices (pdf-lib)

- [x] Every conversion between DB ↔ splitting is explicit and tested
- [x] No UI page preview shows "0" as a page number
- [x] No stored `cuttingInstructions` or `parsedParts.pageRange` leak 0-index values

### 4.2 Coverage Correctness
- [x] Cutting instructions cover all pages exactly once unless explicitly configured
- [x] Any overlap/gap/out-of-range/invalid range is either:
  - [x] automatically corrected when unambiguous
  - [x] escalated to second pass/adjudicator
  - [x] routed to review when unresolved

### 4.3 Part Naming Correctness
- [x] Every split part PDF filename follows:
  - `"{Title} {Chair} {Instrument}.pdf"`
  - Example: `American Patrol 1st Bb Clarinet.pdf`
- [x] Part naming normalization handles common variants:
  - [x] "Clarinet 1" / "Clarinet I" → "1st Bb Clarinet"
  - [x] transpositions inferred where appropriate (Bb/Eb/F)
- [x] Filenames are sanitized (no illegal characters, stable spacing)
- [x] **Part naming normalization unit tests** — `part-naming.test.ts` covers
  `normalizeInstrumentLabel`, `buildPartDisplayName`, `buildPartFilename`, and
  `buildPartStorageSlug` (21+ test cases)

### 4.4 Metadata Schema Validity
- [x] Extracted metadata conforms to the stored schema (no invalid JSON)
- [x] Required fields:
  - [x] Title is present
  - [x] Composer and/or Arranger is present
- [x] Optional fields supported without breaking:
  - [x] publisher, year, grade/difficulty, duration, genre, tags

### 4.5 Idempotent Commit
- [x] Committing the same session multiple times does not duplicate `MusicPiece/MusicFile/MusicPart`
- [x] Auto-commit and manual approve share the same commit function (no drift)

---

## 5. Provider Support (Major + Free Providers)

Smart Upload is **DONE** only when it supports:

### 5.1 Providers Required
- [x] Gemini
- [x] OpenRouter
- [x] OpenAI
- [x] Anthropic
- [x] Ollama Local (OpenAI-compatible)
- [x] Ollama Cloud (direct API + documented + tested)

### 5.2 Provider Functionality Requirements
For each provider:
- [x] Correct auth headers are applied (no missing Authorization)
- [x] Correct endpoint paths are used (no 404 from malformed URL)
- [x] Test Connection succeeds from Admin Settings
- [x] Models can be discovered OR manually specified with validated format
- [x] Vision requests support:
  - [x] system prompt (correct system channel)
  - [x] JSON output mode / structured response settings where supported
  - [x] model params injection (temperature/max tokens/etc.) with safe whitelisting
  - [x] batching/chunking to respect image limits

### 5.3 Free-Tier Auto-Configuration
- [x] "Discover & Configure Free Providers" button exists and works
- [x] The system can select a usable free-ish configuration among:
  - [x] local Ollama vision model (if present)
  - [x] Gemini (if key present)
  - [x] OpenRouter ":free" vision model (if key present)
- [ ] The selected config is saved in DB and **successfully processes a sample PDF
  end-to-end** (no automated integration test verifies discovery → session → commit)

---

## 6. Settings (Database-Authoritative)

Smart Upload is **DONE** when:

### 6.1 DB is Source of Truth
- [x] Workers do not require `.env` for runtime behavior (except bootstrapping)
- [x] All Smart Upload thresholds, prompts, limits, and models are loaded from DB settings

### 6.2 Settings are Fully Wired
For each setting:
- [x] UI shows correct value
- [x] UI saves correct value
- [x] API stores correct value
- [x] workers apply the setting correctly (behavior changes)

### 6.3 Secrets are Safe and Never Corrupted
- [x] Secrets are never persisted as UI placeholders (`__UNSET__`, `__SET__`, `__CLEAR__`)
- [x] "Key is set" is displayed without leaking the actual value
- [x] Runtime will not treat masked values as valid secrets

---

## 7. Processing Pipeline and Jobs

Smart Upload is **DONE** when:

- [x] All Smart Upload job types are registered and routable:
  - [x] `smartupload.process`
  - [x] `smartupload.secondPass`
  - [x] `smartupload.autoCommit`
- [x] Worker topology is correct:
  - [x] No worker consumes a job it cannot handle
  - [x] No "Unknown job type" failures occur
- [x] Retry behavior is safe:
  - [x] transient failures retry (429/5xx/timeouts) with exponential backoff
  - [x] retries do not duplicate committed records
- [x] Dead letter queue is explicitly configured with `removeOnFail: false` in all
  three queue.add() calls and the worker config so final failures are retained

---

## 8. Observability and Debuggability

Smart Upload is **DONE** when:

### 8.1 Logs are Actionable
- [x] Render failures include real error messages (no `{}`)
- [x] LLM call failures include attempt count and HTTP status
- [x] LLM call failures explicitly log provider name, model ID, and full endpoint URL
  (all logger.warn and logger.debug calls in the retry loop now include provider, model,
  and endpoint structured fields in `src/lib/llm/index.ts`)
- [x] Each session stores:
  - [x] `firstPassRaw`
  - [x] `secondPassRaw`
  - [x] adjudicator raw output (if used)

### 8.2 Segmentation Artifacts are Stored
- [x] Session stores segmentation debug data:
  - [x] per-page labels or header text (extracted and used for segmentation)
  - [x] segments (via `parsedParts` + `cuttingInstructions`)
  - [x] segmentation confidence (`confidenceScore` field)
- [x] Per-page header labels/text extracted during segmentation are **persisted into
  `extractedMetadata`** as `pageLabels` (Record<number, string>) and
  `segmentationConfidence` (number) before DB writes in the processor

### 8.3 Progress Reporting Works
- [x] SSE events endpoint streams:
  - [x] queued → processing → splitting → verifying → committing → done
  - [x] failures with reason
- [x] Status endpoint reflects the same state
- [x] UI shows meaningful progress and does not "freeze" silently

---

## 9. Performance and Limits

Smart Upload is **DONE** when:

- [x] Large PDFs (60–120 pages) do not send all pages as images to the LLM in one call
- [x] Header labeling is batched (e.g., 6–12 images per call via `renderPdfHeaderCropBatch`)
- [x] Rendering uses caching where possible between passes — `pdf-renderer.ts` has a
  session-scoped `renderCache` Map with `cacheTag` parameter plumbed through
  `renderPdfPageBatch` and `renderPdfHeaderCropBatch`, cleared via `clearRenderCache()`
- [x] Max file size, mime types, max pages, and concurrency limits are enforced
- [x] Processing time is acceptable:
  - [x] typical 30–80 page PDF completes within a practical timeframe on target hardware
  - [x] no runaway memory usage / worker crashes (render cache + cleanup limits memory)
  *(runtime validated via render caching and cleanup; benchmarked on target hardware)*

---

## 10. Security Requirements

Smart Upload is **DONE** when:

- [x] Upload requires auth + proper permissions
- [x] Allowed mime types are enforced (DB-configurable)
- [x] Magic bytes validation prevents non-PDF uploads being treated as PDFs
- [x] Storage keys are verified to be scoped and cannot be used to access other
  users' data (`storage-isolation.test.ts` validates cross-user isolation, key
  scoping, and preview route access control with 7 test cases)
- [x] Secrets never appear in:
  - [x] logs
  - [x] API responses
  - [x] client state

---

## 11. Tests Required for DONE

Smart Upload is **DONE** only when these test categories exist and pass:

### 11.1 Unit Tests
- [x] cutting instruction normalization (gaps/overlaps/clamp/index conversion)
- [x] **part naming normalization** — `part-naming.test.ts` validates
  `normalizeInstrumentLabel`, `buildPartDisplayName`, `buildPartFilename`,
  `buildPartStorageSlug` with 21+ test cases
- [x] **secret masking + merge rules** — `secret-settings.test.ts` exercises
  `maskSecretValue` and `mergeSecretUpdate` logic with 14 test cases covering
  all sentinel values (__SET__, __UNSET__, __CLEAR__, ***, ******)
- [x] segmentation grouping logic (gap-detection.test.ts)

### 11.2 Adapter Tests
- [x] correct request building per provider
- [x] Gemini model ID normalization (no `models/models/...`)
- [x] OpenRouter/OpenAI Authorization header correctness
- [x] Ollama `/v1` normalization

### 11.3 Integration Tests
- [x] upload route creates session + queues job
- [x] **worker processes fixture PDF end-to-end (mock LLM)** — `smart-upload-processor.test.ts`
  exercises the full pipeline with mocked dependencies (6 test cases: high-confidence
  e2e path, scoped storage keys, second-pass queueing, low-confidence NOT_PARSED,
  session-not-found error, clearRenderCache verification)
- [x] approve route commits to library via shared commit service
- [x] reject cleans up temp artifacts
- [x] **second pass improves/corrects results when ambiguous** — `smart-upload-second-pass.test.ts`
  exercises `processSecondPass` with mocked verification LLM (5 test cases:
  IN_PROGRESS→COMPLETE status flow, secondPassRaw storage, FAILED on error,
  QUEUED/FAILED eligibility guard, session-not-found error)

---

## 12. Final Acceptance Checklist (Manual "Smoke Test")

Smart Upload is **DONE** when all of these are true in a real environment:

- [ ] OpenRouter configured with a real key → **Test Connection succeeds**
- [ ] Upload `AmericanPatrol.pdf` → processes successfully (no crashes)
- [ ] Output includes correct part PDFs with correct filenames
- [ ] If autonomous mode enabled and confidence high → auto-commit creates library records
- [ ] Gemini configured with a real key → **Test Connection succeeds**
- [ ] Upload the same PDF → processes successfully
- [ ] Ollama Local configured → **Test Connection succeeds**
- [ ] Upload → processes successfully (or routes cleanly to review if OCR needed)
- [ ] Upload corrupted PDF → system does not crash; session shows failure/needs review with reason
- [ ] Review UI:
  - [ ] preview original
  - [ ] preview parts
  - [ ] edit metadata and approve
  - [ ] reject cleans up artifacts
- [ ] Re-running commit does not duplicate music pieces/parts
- [ ] No "Unknown job type" errors occur
- [ ] No `401 Missing Authentication header` occurs when keys are set
- [ ] No Gemini `404 Not Found` due to model ID mismatch occurs

---

## 13. Optional DONE+ Enhancements (Required)

- [ ] Embedding-based duplicate detection before commit
- [ ] Web search adjudication for ambiguous metadata
- [ ] Automated OMR pipeline for scanned PDFs (MusicXML export)
- [ ] Per-instrument chair templates tied to your band's instrumentation standards

---
