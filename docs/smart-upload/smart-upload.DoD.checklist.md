# SMART_UPLOAD_COMPLETE_CHECKLIST

**Purpose:** Exhaustive end-to-end checklist for shipping Smart Upload as a **fully finalized** autonomous sheet-music ingestion system (metadata + part detection + PDF splitting + storage + review + provider support + observability + tests + docs).  
**Repo:** ECCB Platform (Next.js + TypeScript + BullMQ + Prisma)  
**Principle:** **OCR/Text-layer first**, LLM only when needed, with strict budgets and strong quality gates.

> All paths are **relative to repo root**.  
> Checklist is written to match the codebase structure you’ve been iterating on (workers, `src/lib/smart-upload`, `src/lib/services`, `src/lib/llm`, admin routes/UI, Prisma).

---

## 0) Global Definition of Done

Smart Upload is “complete” when:

### 0.1 User outcomes
- [ ] User can upload a PDF packet and the system automatically:
  - [ ] Extracts accurate piece metadata (title/composer/arranger/publisher/year/ensemble, etc.)
  - [ ] Detects each part (instrument + chair) and page ranges
  - [ ] Splits packet into individual PDFs
  - [ ] Names files using canonical conventions (`{Title} - {Chair?} {Instrument}.pdf`)
  - [ ] Commits into Music Library (piece + files + parts)
- [ ] If confidence is low or rules fail, the system routes to Review (human-in-the-loop) with clear diagnostics.
- [ ] Autonomy can be enabled/disabled and thresholds are configurable.

### 0.2 Reliability + safety
- [ ] No “hung processing” UI states; every upload reaches a terminal state.
- [ ] Idempotent: retrying a job or re-uploading the same file doesn’t duplicate pieces/parts.
- [ ] Secrets never leak to logs, SSE, API responses, or browser.
- [ ] All provider integrations are robust (timeouts, retries, rate-limits, meaningful errors).

### 0.3 Engineering completeness
- [ ] Full test suite for segmentation, splitting, gating, and provider adapters.
- [ ] Documentation + runbooks exist for production rollout, troubleshooting, and onboarding.
- [ ] Monitoring exists (health endpoints, worker queue health, DLQ visibility, metrics).

---

## 1) End-to-End Pipeline Stages (must exist and be wired)

### Stage A — Upload intake & session creation
- [ ] Upload request validated (mime/size).
- [ ] Original saved to storage (local or blob).
- [ ] SmartUploadSession row created with:
  - [ ] stable `sessionId`
  - [ ] `sourceSha256` (dedupe)
  - [ ] initial status = PROCESSING (or equivalent)
  - [ ] `requiresHumanReview=false` by default
- [ ] Smart upload process job enqueued.
- [ ] UI receives a session id + begins progress subscription (SSE + polling fallback).

**Files**
- [ ] MODIFY `src/app/api/files/smart-upload/route.ts`
- [ ] MODIFY `src/lib/services/storage.ts`
- [ ] MODIFY `src/lib/smart-upload/duplicate-detection.ts`
- [ ] MODIFY `src/types/smart-upload.ts`
- [ ] MODIFY `prisma/schema.prisma` (add/ensure `sourceSha256` indexed)

### Stage B — Preflight analysis (local-first)
- [ ] Determine:
  - [ ] total page count
  - [ ] text-layer coverage (page headers + body)
  - [ ] likely “packet type”: FULL_SCORE, PART, MULTI_PART_PACKET
- [ ] Determine processing strategy:
  - [ ] text-layer path
  - [ ] OCR path
  - [ ] LLM fallback path
- [ ] Store per-session diagnostics and provenance.

**Files**
- [ ] MODIFY `src/lib/services/pdf-text-extractor.ts`
- [ ] MODIFY `src/workers/smart-upload-processor.ts`
- [ ] CREATE `src/lib/smart-upload/diagnostics.ts` (structured pipeline diagnostics)

### Stage C — OCR-first metadata extraction
- [ ] If text-layer exists: extract title/composer/publisher from cover pages deterministically.
- [ ] If no text-layer: OCR cover page(s) for metadata.
- [ ] LLM used only if:
  - [ ] OCR confidence is low OR
  - [ ] fields remain missing OR
  - [ ] ambiguity detected (multiple candidates)
- [ ] Apply sanity checks:
  - [ ] compare OCR title vs filename tokens vs LLM title
  - [ ] prevent “wild guess” overrides

**Files**
- [ ] CREATE `src/lib/services/cover-ocr.ts` (or extend existing OCR service)
- [ ] MODIFY `src/lib/services/ocr-fallback.ts`
- [ ] MODIFY `src/lib/smart-upload/metadata-normalizer.ts`
- [ ] CREATE `src/lib/smart-upload/sanity-checks.ts`

### Stage D — OCR-first part label extraction (segmentation)
- [ ] If text-layer headers exist: parse per-page labels from headers.
- [ ] Else: render header crops and OCR them (Tesseract) to get page labels.
- [ ] LLM header labeler only for pages where:
  - [ ] OCR confidence < threshold OR
  - [ ] label is unknown/blank after retries
- [ ] Adaptive crop strategies:
  - [ ] header-only
  - [ ] header+footer strip
  - [ ] full-page low-res fallback (only for stubborn pages)
- [ ] Convert per-page labels → segments with stable boundaries.
- [ ] Compute segmentationConfidence using segment-quality metrics (not % pages ≥ 70 only).

**Files**
- [ ] MODIFY `src/lib/services/pdf-renderer.ts` (support multi-crop strategies)
- [ ] CREATE `src/lib/services/header-ocr.ts`
- [ ] CREATE `src/lib/services/page-labeler.ts` (or equivalent orchestrator)
- [ ] MODIFY `src/lib/services/part-boundary-detector.ts`
- [ ] MODIFY `src/workers/smart-upload-processor.ts`

### Stage E — Cutting instructions generation & validation
- [ ] Build cutting instructions from segments:
  - [ ] one-indexed output
  - [ ] non-overlapping, no gaps, in bounds
- [ ] Assign each instruction:
  - [ ] canonical instrument
  - [ ] chair
  - [ ] partType (PART / SCORE / FRONT_MATTER / UNKNOWN)
- [ ] Validate:
  - [ ] overlaps/gaps
  - [ ] implausible segments (e.g., huge “Unknown” part)
  - [ ] chair mixing (don’t merge 1st & 2nd)
- [ ] Persist instructions + diagnostics in session.

**Files**
- [ ] MODIFY `src/lib/services/cutting-instructions.ts`
- [ ] MODIFY `src/lib/smart-upload/part-naming.ts`
- [ ] MODIFY `src/lib/smart-upload/canonical-instruments.ts`
- [ ] MODIFY `src/workers/smart-upload-processor.ts`

### Stage F — Split PDFs
- [ ] Split original into part PDFs according to instructions.
- [ ] Each part stored at deterministic storage key.
- [ ] Each output has:
  - [ ] validated page count
  - [ ] non-empty PDF bytes
  - [ ] stable filename and display name
- [ ] Optionally store original + “full score” PDF as a separate file.

**Files**
- [ ] MODIFY `src/lib/services/pdf-splitter.ts`
- [ ] MODIFY `src/lib/services/storage.ts`
- [ ] MODIFY `src/lib/smart-upload/part-naming.ts`

### Stage G — Verification / adjudication pass (optional but “complete”)
- [ ] Second pass verification triggers only when necessary based on:
  - [ ] metadata confidence below threshold
  - [ ] segmentation confidence below threshold
  - [ ] quality gates fail
- [ ] Second pass should be cost-controlled:
  - [ ] prefer PDF input for supported providers (Anthropic best)
  - [ ] otherwise use representative pages per segment and boundary pages
- [ ] Adjudicator pass (third pass) exists for deep reasoning and correction when still ambiguous.

**Files**
- [ ] MODIFY `src/workers/smart-upload-worker.ts`
- [ ] CREATE `src/workers/smart-upload-adjudicator.ts` (optional third pass)
- [ ] MODIFY `src/lib/smart-upload/prompts.ts`
- [ ] MODIFY `src/lib/smart-upload/fallback-policy.ts`

### Stage H — Quality gates & routing decision
- [ ] Quality gates run on final data (after verification):
  - [ ] forbidden labels (null/unknown/cover/front matter) cannot be committed as parts
  - [ ] multi-part packet must produce ≥N parts unless explicitly a score
  - [ ] segmentationConfidence must meet thresholds OR require review
  - [ ] “composer names used as instruments” must fail
- [ ] FinalConfidence computed consistently:
  - [ ] `final = min(metadataConfidence, segmentationConfidence, verificationConfidence?)`
- [ ] Routing:
  - [ ] auto-commit if gates pass and autonomy enabled
  - [ ] else set requiresHumanReview=true with reasons

**Files**
- [ ] MODIFY `src/lib/smart-upload/quality-gates.ts`
- [ ] MODIFY `src/lib/smart-upload/schema.ts` (threshold settings)
- [ ] MODIFY `src/workers/smart-upload-processor.ts`
- [ ] MODIFY `src/workers/smart-upload-worker.ts`

### Stage I — Commit to library (transactional)
- [ ] Commit is transactional and idempotent:
  - [ ] creates MusicPiece only once
  - [ ] attaches file records without duplicates
  - [ ] updates session status to APPROVED/COMMITTED
- [ ] Instrument and chair stored correctly:
  - [ ] canonical instrument name
  - [ ] chair separate or normalized consistently
- [ ] On commit failure: session remains uncommitted with error details, and can be retried safely.

**Files**
- [ ] MODIFY `src/lib/smart-upload/commit.ts`
- [ ] MODIFY `src/app/api/admin/uploads/review/[id]/approve/route.ts` (call shared commit)
- [ ] MODIFY `src/workers/smart-upload-worker.ts` (auto-commit job enqueue)
- [ ] MODIFY `src/lib/jobs/smart-upload.ts`

---

## 2) Provider & LLM Integrations (complete support)

### 2.1 Supported providers (configured, tested, discoverable)
- [ ] Gemini
- [ ] OpenRouter
- [ ] OpenAI (and OpenAI-compatible)
- [ ] Anthropic
- [ ] Ollama local (OpenAI compat /v1)
- [ ] Ollama cloud (direct API)
- [ ] Custom OpenAI-compatible endpoint
- [ ] Optional: Groq, Mistral, etc. (if included in UI)

**Files**
- [ ] MODIFY `src/lib/llm/providers.ts`
- [ ] MODIFY `src/lib/llm/config-loader.ts`
- [ ] MODIFY `src/lib/llm/index.ts`
- [ ] MODIFY provider adapters:
  - [ ] `src/lib/llm/gemini.ts`
  - [ ] `src/lib/llm/openrouter.ts`
  - [ ] `src/lib/llm/openai.ts`
  - [ ] `src/lib/llm/anthropic.ts`
  - [ ] `src/lib/llm/ollama.ts`
  - [ ] `src/lib/llm/ollama-cloud.ts`
  - [ ] `src/lib/llm/custom.ts`
  - [ ] `src/lib/llm/groq.ts` (if used)
  - [ ] `src/lib/llm/mistral.ts` (if used)

### 2.2 Capabilities & input modes
- [ ] Per-provider capabilities defined:
  - [ ] supports PDF input
  - [ ] supports strict JSON response schema
  - [ ] max images per request
  - [ ] recommended default models
- [ ] LLM calls use:
  - [ ] strict JSON mode where available
  - [ ] retries with backoff on 429/5xx
  - [ ] timeouts
- [ ] Full-PDF analysis supported for at least one provider (Anthropic) for adjudication stage.

**Files**
- [ ] CREATE `src/lib/llm/capabilities.ts`
- [ ] MODIFY `src/lib/llm/types.ts` (add documents)
- [ ] MODIFY `src/lib/llm/index.ts`

### 2.3 Model discovery + connection tests
- [ ] `/api/admin/uploads/models` lists correct models and filters to vision-capable when needed.
- [ ] `/api/admin/uploads/settings/test` works for every provider.
- [ ] Provider discovery identifies available providers and suggests best free/local option.

**Files**
- [ ] MODIFY `src/app/api/admin/uploads/models/route.ts`
- [ ] MODIFY `src/app/api/admin/uploads/settings/test/route.ts`
- [ ] MODIFY `src/app/api/admin/uploads/providers/discover/route.ts`

---

## 3) Smart Upload Settings (complete and production-safe)

- [ ] Settings are DB-authoritative and validated.
- [ ] Settings include:
  - [ ] enable OCR-first
  - [ ] OCR thresholds
  - [ ] LLM budgets (max calls, max images, max pages)
  - [ ] segmentation thresholds
  - [ ] auto-commit toggle + thresholds
  - [ ] crop strategy settings
  - [ ] provider config + model params (temp, top_p, max tokens)
- [ ] Secrets are masked at rest and never returned raw.

**Files**
- [ ] MODIFY `src/lib/smart-upload/schema.ts`
- [ ] MODIFY `src/app/api/admin/uploads/settings/route.ts` (mask secrets)
- [ ] MODIFY `src/lib/smart-upload/secret-settings.ts`
- [ ] MODIFY `src/components/admin/music/smart-upload-settings-form.tsx`
- [ ] MODIFY `prisma/seed.ts` (ensure keys seeded)

---

## 4) UI / UX Completion

### 4.1 Upload Queue UI
- [ ] Progress is accurate; not stuck; reconciles with polling fallback.
- [ ] Shows per-session state:
  - uploading, processing, verifying, splitting, committing, done, needs review, failed
- [ ] Clicking an item takes you to the correct session, not stale data.

**Files**
- [ ] MODIFY `src/app/(admin)/admin/uploads/page.tsx`
- [ ] MODIFY `src/app/api/admin/uploads/events/route.ts` (structured progress events)
- [ ] MODIFY `src/app/api/admin/uploads/status/[sessionId]/route.ts`

### 4.2 Review list should only show reviewable sessions
- [ ] Sessions appear when:
  - [ ] requiresHumanReview=true OR
  - [ ] processing finished but needs manual decision
- [ ] In-progress sessions should not appear as “pending review”.

**Files**
- [ ] MODIFY `src/app/api/admin/uploads/review/route.ts`
- [ ] MODIFY `src/app/(admin)/admin/uploads/review/page.tsx`

### 4.3 Review modal / preview modal formatting
- [ ] Modal fits viewport and scrolls internally
- [ ] Parts list is scrollable and doesn’t overflow
- [ ] Shows:
  - [ ] metadata with provenance (OCR vs LLM)
  - [ ] segmentation confidence + gate failures
  - [ ] cutting instructions preview
  - [ ] download previews of split parts (if already split)

**Files**
- [ ] MODIFY `src/app/(admin)/admin/uploads/review/page.tsx`
- [ ] MODIFY `src/components/admin/music/upload-preview-dialog.tsx`
- [ ] MODIFY `src/app/api/admin/uploads/review/[id]/preview/route.ts`
- [ ] MODIFY `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`

---

## 5) Observability & Operations (production readiness)

### 5.1 Logging & redaction
- [ ] No secrets in logs.
- [ ] No base64 blobs in logs.
- [ ] No provider URLs with API keys in querystring.

**Files**
- [ ] MODIFY `src/lib/logger.ts`
- [ ] MODIFY `src/lib/llm/index.ts`
- [ ] MODIFY `src/lib/llm/gemini.ts` (never log key)

### 5.2 Worker health & queue health
- [ ] Worker health endpoint reflects:
  - [ ] queue connectivity
  - [ ] active jobs
  - [ ] DLQ size
- [ ] DLQ has admin tooling to retry/inspect.

**Files**
- [ ] MODIFY `src/workers/index.ts` (health)
- [ ] MODIFY `src/lib/jobs/queue.ts` (DLQ metadata)
- [ ] CREATE `src/app/api/admin/uploads/dlq/route.ts` (optional)
- [ ] CREATE `src/app/(admin)/admin/uploads/dlq/page.tsx` (optional)

### 5.3 Idempotency & retry safety
- [ ] Every job handler:
  - [ ] checks session state before acting
  - [ ] avoids duplicating splits/commits
  - [ ] is safe to retry
- [ ] Commit uses transaction and checks existing records.

**Files**
- [ ] MODIFY `src/workers/smart-upload-processor.ts`
- [ ] MODIFY `src/workers/smart-upload-worker.ts`
- [ ] MODIFY `src/lib/smart-upload/commit.ts`

---

## 6) Data Model & Persistence (finalized)

- [ ] `SmartUploadSession` stores:
  - [ ] `sourceSha256` (indexed)
  - [ ] `extractionConfidence`, `segmentationConfidence`, `finalConfidence`
  - [ ] `requiresHumanReview` boolean
  - [ ] pipeline diagnostics JSON
  - [ ] cutting instructions JSON
  - [ ] page label map (optional but recommended)
- [ ] Music library schema supports:
  - [ ] multiple part PDFs per piece
  - [ ] chair and instrument metadata
  - [ ] original packet stored too

**Files**
- [ ] MODIFY `prisma/schema.prisma`
- [ ] ADD migrations `prisma/migrations/*`
- [ ] MODIFY `src/types/smart-upload.ts`
- [ ] MODIFY `src/lib/smart-upload/commit.ts`

---

## 7) Testing & Regression Suite (finalized)

### 7.1 Unit tests
- [ ] JSON parsing/repair
- [ ] label normalization (chair/instrument)
- [ ] boundary detection
- [ ] cutting instruction validation
- [ ] quality gates

**Files**
- [ ] CREATE `src/lib/smart-upload/__tests__/json.test.ts`
- [ ] CREATE `src/lib/services/__tests__/part-boundary-detector.test.ts`
- [ ] CREATE `src/lib/services/__tests__/cutting-instructions.test.ts`
- [ ] CREATE `src/lib/smart-upload/__tests__/quality-gates.test.ts`

### 7.2 Golden PDF regression tests
Include fixtures:
- [ ] one clean digital packet
- [ ] one scanned packet (0% text layer)
- [ ] one “hard layout” packet (AmericanPatrol-style)
- [ ] one packet with combined parts (“1st/2nd”)

**Files**
- [ ] ADD fixtures under `src/**/__tests__/fixtures/*.pdf`
- [ ] CREATE `src/workers/__tests__/smart-upload-regression.test.ts`

### 7.3 Provider adapter tests (mocked)
- [ ] Ensure request formatting correct per provider
- [ ] Ensure secrets not logged
- [ ] Ensure JSON mode behavior

**Files**
- [ ] CREATE `src/lib/llm/__tests__/*.test.ts`

---

## 8) Documentation & Runbooks (finalized)

- [ ] Setup docs:
  - [ ] enabling providers
  - [ ] recommended models
  - [ ] OCR dependencies (Tesseract)
- [ ] Ops runbook:
  - [ ] DLQ recovery
  - [ ] stuck sessions recovery
  - [ ] how to replay jobs
- [ ] Troubleshooting guide:
  - [ ] “stuck processing”
  - [ ] wrong metadata
  - [ ] empty cutting instructions

**Files**
- [ ] CREATE `docs/smart-upload/README.md`
- [ ] CREATE `docs/smart-upload/RUNBOOK.md`
- [ ] CREATE `docs/smart-upload/TROUBLESHOOTING.md`
- [ ] (Optional) keep your existing `SMART_UPLOAD_ENTERPRISE_CHECKLIST.md` and link it.

---

## 9) Release & Production Rollout Checklist

- [ ] Verify environment:
  - [ ] Redis stable
  - [ ] workers running under process manager (pm2/systemd/docker)
  - [ ] storage path writable / S3 configured
  - [ ] OCR deps installed (tesseract + language packs)
- [ ] Dry run 10 uploads:
  - [ ] 6 should auto-commit correctly
  - [ ] 4 should go to review with clear reasons
- [ ] Validate no secrets in logs (grep).
- [ ] Validate DLQ is empty after runs.
- [ ] Confirm UI states:
  - [ ] progress updates
  - [ ] no stuck “Processing…”

---

# Appendix A — Complete Smart Upload File Inventory (runtime)

This inventory is useful for audits and “wiring everything together”.

### UI
- `src/app/(admin)/admin/uploads/page.tsx`
- `src/app/(admin)/admin/uploads/review/page.tsx`
- `src/app/(admin)/admin/uploads/settings/page.tsx`
- `src/components/admin/music/smart-upload-settings-form.tsx`
- `src/components/admin/music/upload-preview-dialog.tsx`

### Upload + Admin APIs
- `src/app/api/files/smart-upload/route.ts`
- `src/app/api/admin/uploads/events/route.ts`
- `src/app/api/admin/uploads/status/[sessionId]/route.ts`
- `src/app/api/admin/uploads/review/route.ts`
- `src/app/api/admin/uploads/review/[id]/preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/approve/route.ts`
- `src/app/api/admin/uploads/review/[id]/reject/route.ts`
- `src/app/api/admin/uploads/review/bulk-approve/route.ts`
- `src/app/api/admin/uploads/second-pass/route.ts`
- `src/app/api/admin/uploads/settings/route.ts`
- `src/app/api/admin/uploads/settings/test/route.ts`
- `src/app/api/admin/uploads/settings/reset-prompts/route.ts`
- `src/app/api/admin/uploads/models/route.ts`
- `src/app/api/admin/uploads/model-params/route.ts`
- `src/app/api/admin/uploads/providers/discover/route.ts`

### Workers
- `src/workers/index.ts`
- `src/workers/smart-upload-processor-worker.ts`
- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`
- `src/workers/ocr-worker.ts`

### Smart Upload Core
- `src/lib/smart-upload/schema.ts`
- `src/lib/smart-upload/prompts.ts`
- `src/lib/smart-upload/quality-gates.ts`
- `src/lib/smart-upload/metadata-normalizer.ts`
- `src/lib/smart-upload/part-naming.ts`
- `src/lib/smart-upload/commit.ts`
- `src/lib/smart-upload/budgets.ts`
- `src/lib/smart-upload/fallback-policy.ts`
- `src/lib/smart-upload/duplicate-detection.ts`
- `src/lib/smart-upload/secret-settings.ts`

### Services
- `src/lib/services/pdf-renderer.ts`
- `src/lib/services/pdf-text-extractor.ts`
- `src/lib/services/part-boundary-detector.ts`
- `src/lib/services/cutting-instructions.ts`
- `src/lib/services/pdf-splitter.ts`
- `src/lib/services/ocr-fallback.ts`
- `src/lib/services/smart-upload-cleanup.ts`
- `src/lib/services/storage.ts`

### Jobs
- `src/lib/jobs/definitions.ts`
- `src/lib/jobs/queue.ts`
- `src/lib/jobs/smart-upload.ts`

### LLM
- `src/lib/llm/index.ts`
- `src/lib/llm/types.ts`
- `src/lib/llm/config-loader.ts`
- `src/lib/llm/providers.ts`
- `src/lib/llm/gemini.ts`
- `src/lib/llm/openrouter.ts`
- `src/lib/llm/openai.ts`
- `src/lib/llm/anthropic.ts`
- `src/lib/llm/ollama.ts`
- `src/lib/llm/ollama-cloud.ts`
- `src/lib/llm/custom.ts`
- `src/lib/llm/groq.ts`
- `src/lib/llm/mistral.ts`

### Data
- `prisma/schema.prisma`
- `prisma/seed.ts`

---

# Appendix B — New files strongly recommended for “complete” status

Minimum recommended adds to reach full completion:
- `src/lib/llm/capabilities.ts`
- `src/lib/services/header-ocr.ts`
- `src/lib/services/cover-ocr.ts`
- `src/lib/services/page-labeler.ts`
- `src/lib/smart-upload/sanity-checks.ts`
- `src/lib/smart-upload/diagnostics.ts`
- `docs/smart-upload/README.md`
- `docs/smart-upload/RUNBOOK.md`
- `docs/smart-upload/TROUBLESHOOTING.md`

- `docs/smart-upload/DEVELOPMENT.md`