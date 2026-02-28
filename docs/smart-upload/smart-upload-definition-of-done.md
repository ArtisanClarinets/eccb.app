# Smart Upload System — Definition of Done (Enterprise Autonomous Ingestion)

## Scope
Smart Upload is "done" when it can ingest a PDF of sheet music (single part, full score, or multi-part packet) and reliably:
- extract complete metadata
- detect individual parts (instrument + chair)
- split into correctly named PDFs
- commit to the library automatically when confidence is high
- fall back safely (second pass / adjudicator / human review) when confidence is low

This DoD defines functional, technical, reliability, security, and test requirements.

---

## 1) Functional Requirements

### 1.1 Upload + Session Lifecycle
- [ ] Upload endpoint accepts PDFs with configurable size limits and allowed MIME types.
- [ ] A `SmartUploadSession` is created with immutable `uploadSessionId`, `storageKey`, `sourceSha256`, and audit fields.
- [ ] Session transitions are deterministic and recorded:
  - `NOT_PARSED → PARSING → PARSED` or `PARSE_FAILED`
  - `secondPassStatus: NOT_NEEDED | QUEUED | IN_PROGRESS | COMPLETE | FAILED`
  - `status: PENDING_REVIEW | APPROVED | REJECTED`
- [ ] SSE/events endpoint streams progress updates and key milestones.

### 1.2 Metadata Extraction
- [ ] Extracted metadata includes at minimum:
  - title, composer, arranger (optional), publisher (optional), copyright year (optional)
  - ensembleType (e.g. Concert Band)
  - fileType: FULL_SCORE | CONDUCTOR_SCORE | PART | CONDENSED_SCORE
- [ ] Output is strict JSON (no markdown fences, no partial objects).
- [ ] Metadata normalization produces stable searchable values:
  - title casing normalized
  - person names normalized
  - publisher normalized

### 1.3 Part Detection + Cutting Instructions
- [ ] System produces a complete set of cutting instructions that:
  - covers all music pages exactly once (no overlap, no gaps)
  - represents each part as:
    - instrument (canonical)
    - chair (1st/2nd/3rd/4th/Aux/Solo/null)
    - transposition (Bb/Eb/F/C/etc.)
    - partType (PART/FULL_SCORE/etc.)
    - pageRange ([start,end], 1-indexed or 0-indexed consistently)
    - labelConfidence per part/segment
- [ ] "Front matter" / cover pages are handled deterministically:
  - either included in a single score file
  - or stored separately as metadata/cover attachment
  - never misclassified as an instrument part
- [ ] No part may have `instrument` or `partName` equal to `null`, `"null"`, `"none"`, `"n/a"`, or `"unknown"` unless flagged for human review.

### 1.4 PDF Splitting + Naming
- [ ] Split PDFs are created via a lossless PDF library (e.g. pdf-lib).
- [ ] Filenames follow a stable convention:
  - `{Title} {Chair?} {Instrument}.pdf`
  - Example: `American Patrol 1st Bb Clarinet.pdf`
- [ ] Storage keys are collision-safe and deterministic (slugged).
- [ ] Parts are persisted and visible in UI with download actions.

### 1.5 Autonomous Mode (Zero-touch)
- [ ] Autonomous mode can be enabled/disabled via settings.
- [ ] Auto-commit occurs only when **all** quality gates pass:
  - no Unknown/null parts (instrument or partName is null/empty/"null"/"unknown"/"n/a")
  - no absurdly large "PART" segment (configurable max pages per non-score part, default 12)
  - Parts count is not suspiciously low for total page count (e.g. ≥2 parts for PDFs >10 pages with `isMultiPart=true`)
  - segmentationConfidence >= threshold (default 70)
  - metadataConfidence >= threshold (default 80)
  - verificationConfidence >= threshold (if two-pass enabled, default 80)
  - finalConfidence = min(extractionConfidence, verificationConfidence, segmentationConfidence)
- [ ] If any gate fails, session remains in `PENDING_REVIEW` (no auto-commit).

---

## 2) Provider Support Requirements

### 2.1 Supported Providers (Minimum)
- [ ] Gemini
- [ ] OpenRouter
- [ ] OpenAI
- [ ] Anthropic
- [ ] Ollama (local OpenAI-compatible)
- [ ] Ollama Cloud (direct API or via local daemon)

### 2.2 Capability-aware Input Modes
- [ ] For providers that support PDF ingestion:
  - system can send whole PDF for page-label mapping and metadata extraction.
- [ ] For providers without PDF ingestion:
  - system uses image inputs (header crops/pages).
- [ ] Provider adapter layer is strict about auth headers and correct endpoints.
- [ ] **No provider logs secrets** (API keys, Authorization headers, signed URLs, query params like `?key=`).
- [ ] Gemini adapter joins **all** `candidates[0].content.parts[].text` entries before returning content (multi-part responses are common).

### 2.3 "Free Tier First" Auto Configuration
- [ ] Settings UI includes "Discover & Configure Free Providers".
- [ ] System can recommend models (vision-capable, low-cost/free).
- [ ] "Auto provider" mode selects best available option in priority order:
  1) local Ollama
  2) Gemini free-tier capable model
  3) OpenRouter free-tier vision model
  4) Paid providers (OpenAI/Anthropic/etc.)
- [ ] Provider discovery endpoint returns available providers + recommended models.

---

## 3) Enterprise Reliability Requirements

### 3.1 OCR-First Cost Control
- [ ] Pipeline always tries deterministic extraction first:
  1) PDF text layer headers
  2) local OCR on header crops (tesseract.js optional)
  3) LLM only for unknown/uncertain pages
- [ ] LLM never processes all pages by default unless explicitly configured.

### 3.2 Multi-pass Verification
- [ ] Two-pass verification exists and is configurable:
  - pass 1: extraction + segmentation
  - pass 2: verification + correction when confidence low
- [ ] Optional adjudicator pass exists for borderline cases.

### 3.3 Idempotency + Dedup
- [ ] Sessions are idempotent by `uploadSessionId` and `sourceSha256`.
- [ ] Commit is idempotent (retries do not duplicate pieces/files/parts).
- [ ] Duplicate detection can flag likely duplicates for review.

### 3.4 Failure Handling
- [ ] Any failure updates session with:
  - parseStatus = PARSE_FAILED
  - error details stored safely (no PDF bytes, no secrets)
- [ ] Jobs use retry with exponential backoff and DLQ behavior is correct.
- [ ] A failure in one part split does not crash the entire session (best-effort split).

---

## 4) Security Requirements
- [ ] No logs include:
  - API keys (query params like `?key=...`)
  - Authorization headers
  - signed URLs
  - raw PDF bytes
  - OCR extracted raw text containing sheet music
- [ ] All secrets are stored and handled via secret settings utilities.
- [ ] Upload is protected by auth + permission checks + CSRF validation.
- [ ] Optional malware scanning is supported for uploaded PDFs.

---

## 5) Observability Requirements
- [ ] Structured logs for each step with:
  - sessionId, jobId, durationMs, counts, confidence metrics
- [ ] SSE events emit step progress and failure reasons.
- [ ] Diagnostics stored in session:
  - text-layer coverage
  - segmentationConfidence
  - label coverage stats
  - prompt version + model params

---

## 6) Performance Requirements
- [ ] Rendering uses caching where possible.
- [ ] Header crop OCR/LLM runs in batches with configurable batch sizes.
- [ ] Concurrency and RPM are enforced via settings.
- [ ] 50–100 page PDFs process within acceptable time bounds on target hardware.

---

## 7) Testing Requirements
- [ ] Unit tests for:
  - provider adapters (auth + payload shapes, multi-part Gemini response joining)
  - prompt parsers (strict JSON parsing, "null" string handling)
  - segmentation logic (label propagation, boundary detection, forbidden labels)
  - cutting instruction validation (gaps/overlaps)
  - part naming normalization
  - quality gates (auto-commit blocked when null part present)
- [ ] Integration test:
  - upload → process → second pass (if needed) → split → commit
- [ ] Regression tests include at least:
  - scanned PDF with no text layer
  - "condensed title/instrumentation layout" PDF (e.g. AmericanPatrol)
  - multi-part with frequent instrument changes

---

## 8) Documentation Requirements
- [ ] README section: how to configure providers, including free-tier modes.
- [ ] "How Smart Upload Works" doc:
  - pipeline stages
  - confidence gates
  - how to troubleshoot failures
- [ ] Provider capability matrix documented (PDF support, image support, JSON mode).

---

## Done = All items above are satisfied and validated with:
- repeated runs of AmericanPatrol (and similar "messy" PDFs)
- no human intervention required for the majority of uploads
- safe fallback to review queue when confidence gates fail
