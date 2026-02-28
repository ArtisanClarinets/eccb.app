# Smart Upload System — Definition of Done (DoD)

**Project:** Smart Upload (ECCB Platform)  
**Goal:** Nearly autonomous, zero-touch music PDF ingestion (metadata + part splitting + library commit)  
**Document Version:** 1.0  
**Last Updated:** 2026-02-27

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
- Embedding-based duplicate detection (unless explicitly included below as “optional DONE+”)

---

## 2. Core End-to-End Behavior

Smart Upload is **DONE** when the system supports the following flows reliably:

### 2.1 Happy Path (Fully Automatic)
- [ ] User uploads a PDF from **Admin → Uploads**
- [ ] System stores the original PDF in storage
- [ ] System creates a `SmartUploadSession` in DB
- [ ] System queues `smartupload.process`
- [ ] Worker completes:
  - [ ] metadata extraction
  - [ ] segmentation (part boundary detection)
  - [ ] splitting into per-part PDFs
  - [ ] part naming normalization
  - [ ] writes `parsedParts` and final metadata into session
- [ ] If confidence is high and autonomous mode is enabled:
  - [ ] system auto-commits (creates library records) without human intervention
- [ ] The uploaded piece appears in Music Library with:
  - [ ] original (optional but recommended)
  - [ ] all part PDFs available individually

### 2.2 Review Required Path (Human-in-the-loop)
- [ ] If confidence is low, parsing is ambiguous, or errors occur:
  - [ ] session appears in **Admin → Uploads → Review**
  - [ ] admins can preview original and part PDFs
  - [ ] admins can edit metadata + part segmentation/labels
  - [ ] admins can approve → commit to library
  - [ ] admins can reject → cleanup temp artifacts

### 2.3 Failure Path (No crashes, clear reason)
- [ ] Corrupt/unsupported PDFs do not crash the system
- [ ] Session is marked failed / needs review with a clear error reason
- [ ] Temp artifacts are cleaned up (or clearly labeled as retained for debugging)

---

## 3. Autonomy and Reliability Targets

Smart Upload is **DONE** when it meets these autonomy thresholds:

### 3.1 Digital PDFs (Text Layer Present)
- [ ] ≥ 90% of typical band-library digital PDFs complete end-to-end with **no human intervention**
- [ ] Output parts have correct ranges and names with high confidence

### 3.2 Scanned PDFs (No Text Layer)
- [ ] ≥ 70% complete end-to-end with **no human intervention**, using header-crop vision labeling
- [ ] Remaining cases reliably route into review with strong previews and minimal admin effort

### 3.3 Deterministic Segmentation is Primary
- [ ] The pipeline does **not** rely on “LLM guesses global page ranges from a small sample”
- [ ] Instead, segmentation is built from:
  - [ ] per-page header text extraction (pdf text layer) when available
  - [ ] header-crop vision labeling (batched) when needed
  - [ ] grouping consecutive pages into segments
  - [ ] normalization + validation + full page coverage enforcement

---

## 4. Data Correctness and Invariants

### 4.1 Page Indexing Consistency
Smart Upload is **DONE** only if one indexing convention is enforced everywhere:

**Required convention:**
- **DB/UI:** 1-indexed page numbers (page 1 is first page)
- **Splitter internals:** 0-indexed page indices (pdf-lib)

- [ ] Every conversion between DB ↔ splitting is explicit and tested
- [ ] No UI page preview shows “0” as a page number
- [ ] No stored `cuttingInstructions` or `parsedParts.pageRange` leak 0-index values

### 4.2 Coverage Correctness
- [ ] Cutting instructions cover all pages exactly once unless explicitly configured
- [ ] Any overlap/gap/out-of-range/invalid range is either:
  - [ ] automatically corrected when unambiguous
  - [ ] escalated to second pass/adjudicator
  - [ ] routed to review when unresolved

### 4.3 Part Naming Correctness
- [ ] Every split part PDF filename follows:
  - `"{Title} {Chair} {Instrument}.pdf"`
  - Example: `American Patrol 1st Bb Clarinet.pdf`
- [ ] Part naming normalization handles common variants:
  - [ ] “Clarinet 1” / “Clarinet I” → “1st Bb Clarinet”
  - [ ] transpositions inferred where appropriate (Bb/Eb/F)
- [ ] Filenames are sanitized (no illegal characters, stable spacing)

### 4.4 Metadata Schema Validity
- [ ] Extracted metadata conforms to the stored schema (no invalid JSON)
- [ ] Required fields:
  - [ ] Title is present
  - [ ] Composer and/or Arranger is present
- [ ] Optional fields supported without breaking:
  - [ ] publisher, year, grade/difficulty, duration, genre, tags

### 4.5 Idempotent Commit
- [ ] Committing the same session multiple times does not duplicate `MusicPiece/MusicFile/MusicPart`
- [ ] Auto-commit and manual approve share the same commit function (no drift)

---

## 5. Provider Support (Major + Free Providers)

Smart Upload is **DONE** only when it supports:

### 5.1 Providers Required
- [ ] Gemini
- [ ] OpenRouter
- [ ] OpenAI
- [ ] Anthropic
- [ ] Ollama Local (OpenAI-compatible)
- [ ] Ollama Cloud (either direct API OR via local “cloud models”; must be documented + tested)

### 5.2 Provider Functionality Requirements
For each provider:
- [ ] Correct auth headers are applied (no missing Authorization)
- [ ] Correct endpoint paths are used (no 404 from malformed URL)
- [ ] Test Connection succeeds from Admin Settings
- [ ] Models can be discovered OR manually specified with validated format
- [ ] Vision requests support:
  - [ ] system prompt (correct system channel)
  - [ ] JSON output mode / structured response settings where supported
  - [ ] model params injection (temperature/max tokens/etc.) with safe whitelisting
  - [ ] batching/chunking to respect image limits

### 5.3 Free-Tier Auto-Configuration
- [ ] “Discover & Configure Free Providers” button exists and works
- [ ] The system can select a usable free-ish configuration among:
  - [ ] local Ollama vision model (if present)
  - [ ] Gemini (if key present)
  - [ ] OpenRouter “:free” vision model (if key present)
- [ ] The selected config is saved in DB and successfully processes a sample PDF end-to-end

---

## 6. Settings (Database-Authoritative)

Smart Upload is **DONE** when:

### 6.1 DB is Source of Truth
- [ ] Workers do not require `.env` for runtime behavior (except bootstrapping)
- [ ] All Smart Upload thresholds, prompts, limits, and models are loaded from DB settings

### 6.2 Settings are Fully Wired
For each setting:
- [ ] UI shows correct value
- [ ] UI saves correct value
- [ ] API stores correct value
- [ ] workers apply the setting correctly (behavior changes)

### 6.3 Secrets are Safe and Never Corrupted
- [ ] Secrets are never persisted as UI placeholders (`__UNSET__`, `__SET__`, `__CLEAR__`)
- [ ] “Key is set” is displayed without leaking the actual value
- [ ] Runtime will not treat masked values as valid secrets

---

## 7. Processing Pipeline and Jobs

Smart Upload is **DONE** when:

- [ ] All Smart Upload job types are registered and routable:
  - [ ] `smartupload.process`
  - [ ] `smartupload.secondPass`
  - [ ] `smartupload.autoCommit`
- [ ] Worker topology is correct:
  - [ ] No worker consumes a job it cannot handle
  - [ ] No “Unknown job type” failures occur
- [ ] Retry behavior is safe:
  - [ ] transient failures retry (429/5xx/timeouts)
  - [ ] retries do not duplicate committed records
- [ ] Dead letter queue captures final failures with reason

---

## 8. Observability and Debuggability

Smart Upload is **DONE** when:

### 8.1 Logs are Actionable
- [ ] Render failures include real error messages (no `{}`)
- [ ] LLM call failures include provider, model, endpoint, attempt count, and error message
- [ ] Each session stores:
  - [ ] `firstPassRaw`
  - [ ] `secondPassRaw`
  - [ ] adjudicator raw output (if used)

### 8.2 Segmentation Artifacts are Stored
- [ ] Session stores segmentation debug data:
  - [ ] per-page labels (or header text)
  - [ ] segments
  - [ ] segmentation confidence
- [ ] Review UI can display these artifacts (at minimum, show segments + confidence)

### 8.3 Progress Reporting Works
- [ ] SSE events endpoint streams:
  - [ ] queued → processing → splitting → verifying → committing → done
  - [ ] failures with reason
- [ ] Status endpoint reflects the same state
- [ ] UI shows meaningful progress and does not “freeze” silently

---

## 9. Performance and Limits

Smart Upload is **DONE** when:

- [ ] Large PDFs (60–120 pages) do not send all pages as images to the LLM in one call
- [ ] Header labeling is batched (e.g., 6–12 images per call)
- [ ] Rendering uses caching where possible between passes
- [ ] Max file size, mime types, max pages, and concurrency limits are enforced
- [ ] Processing time is acceptable:
  - [ ] typical 30–80 page PDF completes within a practical timeframe on target hardware
  - [ ] no runaway memory usage / worker crashes

---

## 10. Security Requirements

Smart Upload is **DONE** when:

- [ ] Upload requires auth + proper permissions
- [ ] Allowed mime types are enforced (DB-configurable)
- [ ] Magic bytes validation prevents non-PDF uploads being treated as PDFs
- [ ] Storage keys are scoped and cannot be used to access other users’ data
- [ ] Secrets never appear in:
  - [ ] logs
  - [ ] API responses
  - [ ] client state

---

## 11. Tests Required for DONE

Smart Upload is **DONE** only when these test categories exist and pass:

### 11.1 Unit Tests
- [ ] cutting instruction normalization (gaps/overlaps/clamp/index conversion)
- [ ] part naming normalization
- [ ] secret masking + merge rules
- [ ] segmentation grouping logic

### 11.2 Adapter Tests
- [ ] correct request building per provider
- [ ] Gemini model ID normalization (no `models/models/...`)
- [ ] OpenRouter/OpenAI Authorization header correctness
- [ ] Ollama `/v1` normalization

### 11.3 Integration Tests
- [ ] upload route creates session + queues job
- [ ] worker processes fixture PDF end-to-end (mock LLM)
- [ ] approve route commits to library via shared commit service
- [ ] reject cleans up temp artifacts
- [ ] second pass improves/corrects results when ambiguous

---

## 12. Final Acceptance Checklist (Manual “Smoke Test”)

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
- [ ] No “Unknown job type” errors occur
- [ ] No `401 Missing Authentication header` occurs when keys are set
- [ ] No Gemini `404 Not Found` due to model ID mismatch occurs

---

## 13. Optional DONE+ Enhancements (Not required, but recommended)

- [ ] Embedding-based duplicate detection before commit
- [ ] Web search adjudication for ambiguous metadata
- [ ] Automated OMR pipeline for scanned PDFs (MusicXML export)
- [ ] Per-instrument chair templates tied to your band’s instrumentation standards

---