# SMART_UPLOAD_ENTERPRISE_CHECKLIST

**Repo:** ECCB Platform (Next.js/TypeScript)  
**Scope:** Smart Upload → autonomous sheet-music ingestion (metadata + part detection + splitting + library commit)  
**Goal:** “Enterprise, production-level” means: reliable, secure, observable, cost-controlled, idempotent, test-covered, and able to run unattended for the majority of real-world band PDFs.

> This checklist is written against the structure and files found in the attached `eccb.app-main (17).zip`.  
> All paths below are **relative to repo root**.

---

## 0) What “Enterprise / Production-level” means for Smart Upload

Smart Upload is **DONE** only when ALL of the following are true:

### 0.1 End-to-end outcomes
- [ ] A user can upload a PDF and the system:
  - [ ] Extracts accurate piece metadata (title/composer/arranger/publisher/year/ensemble).
  - [ ] Detects parts (instrument + chair) and builds **complete cutting instructions**.
  - [ ] Splits into part PDFs with correct filenames and correct pages.
  - [ ] Commits the piece + files + parts into the library **automatically** when thresholds are met.
  - [ ] Falls back to human review only when confidence gates fail (with actionable diagnostics shown in UI).
- [ ] The pipeline is **idempotent**: retries do not create duplicate parts, pieces, or storage objects.
- [ ] The pipeline can run **unattended** for most typical concert band library PDFs.

### 0.2 Production hygiene
- [ ] No API keys ever appear in logs, job payloads, error messages, or SSE streams.
- [ ] Failures are observable: every failure produces a session error record + reason + remediation hint.
- [ ] Latency/cost controls exist: no “send 67 images” unless explicitly configured.
- [ ] Worker restarts and retries are safe (no partial commits, no corrupt state).
- [ ] Automated tests cover:
  - [ ] JSON parsing robustness
  - [ ] Part boundary detection regressions
  - [ ] Splitting correctness (page ranges, no overlaps/gaps)
  - [ ] Provider integration smoke tests (mocked)
  - [ ] At least 1 “nasty” real PDF regression fixture (e.g., AmericanPatrol.pdf)

---

## 1) Findings from the latest Smart Upload run (American Patrol)

From the log you pasted (high-level diagnosis):
- ✅ PDF rendering + header cropping now works reliably (`pdf-renderer.ts` is working).
- ✅ Gemini calls are working and returning structured content.
- ✅ Second pass can split and auto-commit successfully.
- ⚠️ **Segmentation confidence is extremely low** (e.g., `segmentationConfidence=13`) even when segmentation can be usable.
- ⚠️ **Front matter** (cover/title pages) can become a “part” (e.g., `partName="null"` / “Unknown Part” behavior).
- ⚠️ `parseVisionResponse: no JSON object found` can occur even when content looks like JSON → parsing is brittle.
- ⚠️ You are still doing expensive work in places (batching 67 header crops, full-PDF second pass images) without a strict cost budget.

These are expected “last-mile” enterprise hardening issues. The checklist below focuses on eliminating them.

---

## 2) P0 Blockers (must fix before calling it “production-level”)

### 2.1 Fix autonomy decision ordering (quality gates must be final authority)
**Problem:** In second pass, `isAutonomousThreshold` is computed *before* `evaluateQualityGates()` recomputes `finalConfidence`. This can lead to incorrect auto-commit behavior.

- [ ] **Modify:** `src/workers/smart-upload-worker.ts`
  - [ ] Move *all* auto-commit eligibility checks **after** `evaluateQualityGates()`.
  - [ ] Use **gateResult.finalConfidence** and **gateResult.failed** as the sole authority.
  - [ ] Never enqueue `smartupload.autoCommit` if `gateResult.failed === true`.
  - [ ] Ensure you persist `finalConfidence` (not just extraction confidence) consistently in DB.

### 2.2 Make JSON parsing enterprise-grade (no more “no JSON object found”)
**Problem:** `parseVisionResponse` is brittle. Provider output can include leading text, multiple JSON chunks, or partial JSON.

- [ ] **Create:** `src/lib/smart-upload/json.ts`
  - [ ] `stripCodeFences(text: string): string`
  - [ ] `extractFirstJsonObject(text: string): string | null`
  - [ ] `parseJsonLenient<T>(text: string): { ok: true; value: T } | { ok: false; error: string }`
  - [ ] Prefer: extract → attempt `JSON.parse` → if fails, attempt repair (optional: add `jsonrepair` dependency) → parse again.
  - [ ] Must never log raw content; only log small safe previews (first ~200 chars) with secrets redacted.

- [ ] **Modify:** `src/workers/smart-upload-processor.ts`
  - [ ] Replace local JSON regex parsing with `parseJsonLenient`.
- [ ] **Modify:** `src/workers/smart-upload-worker.ts`
  - [ ] Replace second-pass parsing with the same utility.
- [ ] **Add tests:** `src/lib/smart-upload/__tests__/json.test.ts`
  - [ ] Covers: plain JSON, fenced JSON, JSON with leading prose, array responses, malformed trailing commas, etc.

### 2.3 Stop “front matter” from becoming a “part”
**Problem:** `part-boundary-detector.ts` propagates the first label backwards onto unlabeled pages. This makes cover/title pages get mislabeled as an instrument part.

- [ ] **Modify:** `src/lib/services/part-boundary-detector.ts`
  - [ ] Introduce explicit “Front Matter / Cover” handling:
    - [ ] Pages 1–N (configurable, default 2–4) are treated as “FRONT_MATTER” unless there is strong evidence they are a part.
    - [ ] Do **not** backfill labels onto pages before the first confident part label.
  - [ ] Add heuristic: if page contains title/composer/publisher patterns (from text layer or OCR), mark as `FrontMatter`.
  - [ ] Ensure cutting instructions can include a `fileType="FULL_SCORE"` or `fileType="FRONT_MATTER"` segment that is **not committed as a part** (or is committed as the “full score” file depending on your library rules).

- [ ] **Modify:** `src/workers/smart-upload-processor.ts`
  - [ ] When deterministic segmentation yields a FrontMatter segment:
    - [ ] Exclude it from “PART” splitting, or store it as “FULL_SCORE” (decision must be consistent with your library schema).
  - [ ] Update quality gates to fail if a “PART” name is `null/Unknown/FrontMatter`.

- [ ] **Modify:** `src/lib/smart-upload/quality-gates.ts`
  - [ ] Add: “First segment labeled Unknown/FrontMatter is allowed only if fileType=FULL_SCORE”.
  - [ ] Fail if any committed part has forbidden labels.

### 2.4 Fix segmentation confidence to reflect segmentation quality (not a bogus %)
**Problem:** Segmentation confidence is currently “% pages with label confidence >= 70”. That’s not a good measure.

- [ ] **Modify:** `src/lib/services/part-boundary-detector.ts`
  - [ ] Replace `segmentationConfidence` computation with a weighted score using:
    - [ ] boundary stability (label changes occur at plausible places, not every page)
    - [ ] segment completeness (no giant “Unknown” segment unless it’s FrontMatter)
    - [ ] per-segment label confidence (median/mean across segment)
    - [ ] chair-differentiation correctness (1st vs 2nd shouldn’t be merged)
  - [ ] Emit diagnostics that explain *why* segmentationConfidence is low (but do not log OCR text).

- [ ] **Modify:** `src/lib/smart-upload/quality-gates.ts`
  - [ ] Gate on: (a) finalConfidence, (b) forbidden labels, (c) segment plausibility checks.

### 2.5 Prevent incorrect auto-commit when part labels are invalid
- [ ] **Modify:** `src/lib/smart-upload/quality-gates.ts`
  - [ ] Treat any partName/instrument containing:
    - `null`, `unknown`, `n/a`, `front matter`, `cover`, empty string
    as **hard fail** unless explicitly allowed for `FULL_SCORE` file.
- [ ] **Modify:** `src/lib/smart-upload/commit.ts`
  - [ ] Before commit, validate parsedParts and reject if any forbidden label survives.

---

## 3) P1: OCR-first pipeline (reduce LLM usage and improve reliability)

You already have a strong OCR fallback service (`ocr-fallback.ts`) and a dedicated OCR worker (`ocr-worker.ts`). The missing piece is **wiring OCR into the Smart Upload flow as a first-class stage**.

### 3.1 Add “OCR-first” decision logic in main processor
- [ ] **Modify:** `src/workers/smart-upload-processor.ts`
  - [ ] Before calling any LLM:
    - [ ] Run `extractPdfPageHeaders` (text-layer) and compute text coverage.
    - [ ] If coverage >= threshold (config), extract title/composer deterministically and attempt header label parsing from text.
    - [ ] If coverage is low, run OCR on:
      - [ ] cover page (full page) for metadata
      - [ ] header crops for part labels (first pass: sample pages, then targeted pages)
  - [ ] Only call the LLM for:
    - [ ] unresolved metadata fields after OCR/text-layer
    - [ ] uncertain page labels / ambiguous segments
    - [ ] normalization decisions (chair/instrument mapping) when confidence is low

### 3.2 Create an OCR-based page labeler
- [ ] **Create:** `src/lib/services/page-labeler.ts`
  - [ ] Inputs: `pdfBuffer`, `pageCount`, `pageIndices`, `mode`
  - [ ] Strategies (in priority order):
    1. [ ] Text-layer header extraction → deterministic label parse
    2. [ ] OCR header crop → deterministic label parse
    3. [ ] LLM header-label prompt (batch) for remaining pages
  - [ ] Output: per-page `{ label: string | null; confidence: number; source: 'text'|'ocr'|'llm' }`
  - [ ] Must enforce a **budget**: max pages to send to LLM, max batches, max prompt tokens, etc.

- [ ] **Modify:** `src/workers/smart-upload-processor.ts`
  - [ ] Replace the direct header-crop → LLM flow with `page-labeler.ts`.

### 3.3 Make OCR configurable via DB settings (not env-only)
- [ ] **Modify:** `src/lib/smart-upload/schema.ts`
  - [ ] Add settings:
    - `smart_upload_enable_ocr_first: boolean`
    - `smart_upload_text_layer_threshold_pct: number` (e.g., 40)
    - `smart_upload_ocr_mode: 'header'|'full'|'both'`
    - `smart_upload_ocr_max_pages: number`
    - `smart_upload_llm_max_pages: number`
    - `smart_upload_llm_max_header_batches: number`

- [ ] **Modify:** `src/lib/llm/config-loader.ts`
  - [ ] Load these new settings into runtime config.
- [ ] **Modify:** `src/components/admin/music/smart-upload-settings-form.tsx`
  - [ ] Add UI controls for the new OCR + budget settings.

---

## 4) P1: Full-PDF LLM analysis (where supported) + hybrid strategy

You can get the “enterprise” result by using a **hybrid** approach:
1) OCR/text-layer first  
2) LLM only for ambiguity  
3) Optionally, for providers that support PDF inputs, run a whole-document adjudication pass.

### 4.1 Add a “document input” abstraction to LLM layer
- [ ] **Modify:** `src/lib/llm/types.ts`
  - [ ] Extend `VisionRequest` to support optional `documents`:
    - `{ mimeType: 'application/pdf'; base64Data: string; label?: string }[]`
  - [ ] Keep `images` for providers that only accept images.

- [ ] **Modify:** `src/lib/llm/index.ts`
  - [ ] Add `callDocumentModel(...)` or extend `callVisionModel` to accept `documents`.
  - [ ] Ensure logging strips query params and never logs base64.

### 4.2 Provider support for PDF inputs (optional, but recommended)
- [ ] **Modify:** `src/lib/llm/anthropic.ts`
  - [ ] Add support for sending PDF blocks when `documents` present.
- [ ] **Modify:** `src/lib/llm/gemini.ts`
  - [ ] Add support for PDF input when available (fallback to images if not).
- [ ] **Modify:** `src/lib/llm/openai.ts` / `src/lib/llm/openrouter.ts`
  - [ ] Keep images path; optionally support file-based APIs if you later adopt them.

### 4.3 Add a “whole PDF adjudicator” stage
- [ ] **Modify:** `src/workers/smart-upload-worker.ts` (or create a new adjudicator job)
  - [ ] If after OCR + header-label segmentation + normalizer the system is still low confidence:
    - [ ] Run a “whole PDF adjudicator” call (PDF input) to return:
      - final metadata
      - final part map (instrument + chair + page ranges)
      - explanations for corrections
  - [ ] This stage should be **disabled by default** and only enabled by config because of cost.

- [ ] **Modify:** `src/lib/smart-upload/prompts.ts`
  - [ ] Add a dedicated `DEFAULT_PDF_ADJUDICATOR_PROMPT_TEMPLATE` that requests a strict JSON output.

---

## 5) P1: Part naming, chair detection, and canonicalization

The output quality lives or dies by naming normalization.

### 5.1 Make chair detection first-class (not a string heuristic)
- [ ] **Modify:** `src/lib/smart-upload/part-naming.ts`
  - [ ] Ensure chair parsing handles:
    - “Clarinet 1”, “1st Clarinet”, “Clarinet I”, “Cl. 1”, “B♭ Clarinet 1”
  - [ ] Ensure transposition parsing handles:
    - Bb/Eb/F/C (and “in F”, “Horn in F”, etc.)
  - [ ] Ensure you never produce “Instrument - Instrument” duplicate UI strings (dedupe displayName logic).

### 5.2 Ensure part-boundary detector does not merge different chairs
- [ ] **Modify:** `src/lib/services/part-boundary-detector.ts`
  - [ ] In “merge similar segments” logic:
    - [ ] Penalize labels with different chair numbers/roman numerals.
    - [ ] Penalize labels with different transpositions.
    - [ ] Only merge segments when they are *truly* the same part.

### 5.3 Enforce naming conventions at the splitter layer
- [ ] **Modify:** `src/lib/services/pdf-splitter.ts`
  - [ ] Enforce output filenames like:
    - `American Patrol - 1st Bb Clarinet.pdf`
    - `American Patrol - Flute 1.pdf` (if chair is part of name)
  - [ ] Disallow writing `null.pdf`, `Unknown.pdf`, etc.

---

## 6) P1: Budgeting, performance, and cost controls

### 6.1 Add a strict budget system
- [ ] **Create:** `src/lib/smart-upload/budgets.ts`
  - [ ] Holds max limits:
    - max images per request
    - max pages to OCR
    - max header batches
    - max total token budget per session (soft limit)
- [ ] **Modify:** `src/workers/smart-upload-processor.ts` and `src/workers/smart-upload-worker.ts`
  - [ ] Enforce budgets before rendering pages / calling LLM.
  - [ ] If over budget, degrade gracefully:
    - [ ] fewer header pages
    - [ ] prompt user to enable “Full PDF adjudicator” if needed
    - [ ] route to human review

### 6.2 Don’t render everything unless needed
- [ ] **Modify:** `src/lib/services/pdf-renderer.ts`
  - [ ] Add/verify a cheap “page dimension probe” to avoid rendering huge pages at 2x if not needed.
  - [ ] Add `renderPdfHeaderCropBatch` concurrency limit (if not already), configurable.

---

## 7) P1: Provider completeness + auto-config

You’ve added providers in `src/lib/llm/*`. Ensure the entire app can configure them end-to-end.

### 7.1 Settings UI must support every provider in schema
- [ ] **Modify:** `src/components/admin/music/smart-upload-settings-form.tsx`
  - [ ] Ensure provider dropdown includes: `openai`, `anthropic`, `gemini`, `openrouter`, `ollama`, `ollama-cloud`, `mistral`, `groq`, `custom`, and optionally `auto`.
  - [ ] Ensure API key inputs exist for each provider (and are masked properly).
  - [ ] Ensure changing provider clears the correct key fields (currently only clears a subset).

### 7.2 Provider discovery should include all “free-ish” and “local” options
- [ ] **Modify:** `src/app/api/admin/uploads/providers/discover/route.ts`
  - [ ] Add:
    - [ ] `ollama` reachability check (local free)
    - [ ] `ollama-cloud` reachability check (remote)
    - [ ] `groq` / `mistral` presence check (if keys exist)
  - [ ] Return recommended models per provider + which ones are vision-capable.
  - [ ] Never return raw keys.

### 7.3 Connection test must cover all providers
- [ ] **Modify:** `src/app/api/admin/uploads/settings/test/route.ts`
  - [ ] Implement provider-specific “cheap” probes:
    - [ ] OpenAI: list models or minimal chat call
    - [ ] Gemini: minimal generateContent call
    - [ ] OpenRouter: minimal chat call
    - [ ] Anthropic: minimal message call
    - [ ] Ollama: GET /api/tags or /v1/models (depending on mode)
    - [ ] Mistral/Groq: list models via OpenAI-compatible endpoint

---

## 8) P1: Review UX for exceptions (human-in-the-loop only when required)

### 8.1 Show why the system is uncertain
- [ ] **Modify:** `src/app/(admin)/admin/uploads/review/page.tsx`
  - [ ] Display:
    - extractionConfidence
    - segmentationConfidence
    - gate failures
    - which strategy was used (text/ocr/llm/pdf-adjudicator)
- [ ] **Modify:** `src/app/api/admin/uploads/review/[id]/preview/route.ts`
  - [ ] Return structured diagnostics for UI (not raw OCR or LLM output).

### 8.2 Allow manual correction of cutting instructions
- [ ] **Create:** `src/components/admin/music/cutting-instructions-editor.tsx`
  - [ ] UI to adjust page ranges and part labels.
  - [ ] On save, rerun validation and optionally re-split.

- [ ] **Modify:** `src/app/api/admin/uploads/review/[id]/approve/route.ts`
  - [ ] Accept optional overridden cutting instructions.

---

## 9) P2: Data model hardening (recommended for enterprise)

### 9.1 Store per-page label map and provenance
- [ ] **Modify:** `prisma/schema.prisma`
  - [ ] Add fields to `SmartUploadSession` (JSON):
    - `pageLabels` (array of `{page,label,confidence,source}`)
    - `pipelineDiagnostics` (structured, safe)
- [ ] **Create migration** in `prisma/migrations/*`

### 9.2 Make confidence fields explicit and consistent
- [ ] **Modify:** `src/types/smart-upload.ts`
  - [ ] Add explicit fields: `extractionConfidence`, `segmentationConfidence`, `finalConfidence`.
- [ ] **Modify:** `src/workers/smart-upload-processor.ts` and `src/workers/smart-upload-worker.ts`
  - [ ] Persist all three, consistently.

---

## 10) Tests, regression fixtures, and CI

### 10.1 Add a regression fixture pipeline test
- [ ] **Add fixture:** `src/app/api/files/smart-upload/__tests__/fixtures/AmericanPatrol.pdf` (or similar)
- [ ] **Modify/Add:** `src/workers/__tests__/regression.test.ts`
  - [ ] Run processor in “mock LLM” mode with a pinned expected segmentation map.
  - [ ] Validate:
    - no forbidden labels
    - cutting instructions cover all pages
    - split PDF page counts match instructions

### 10.2 Add unit tests for part boundary detector
- [ ] **Modify/Add:** `src/lib/services/__tests__/part-boundary-detector.test.ts`
  - [ ] Test:
    - front matter behavior
    - chair vs chair merging prevention
    - large PDFs with sparse labels

---

## 11) Security & operations (must-have for enterprise)

### 11.1 Ensure no secret leakage anywhere
- [ ] **Audit & modify as needed:**
  - `src/lib/llm/index.ts` (already strips query params in logs — keep it)
  - `src/lib/logger.ts` (ensure it doesn’t stringify configs containing keys)
  - All worker logs: never log config objects that include secrets

### 11.2 Virus scanning in pipeline (optional but recommended)
- [ ] **Modify:** `src/app/api/files/smart-upload/route.ts`
  - [ ] If `ENABLE_VIRUS_SCAN=true`, scan before saving or before processing.
- [ ] **Modify:** `src/lib/services/virus-scanner.ts`
  - [ ] Ensure it runs in worker-safe context.

---

## 12) Final “Done” sign-off checklist (runbook)

- [ ] Upload 20 representative PDFs:
  - [ ] digital parts PDFs
  - [ ] scanned PDFs
  - [ ] mixed text-layer coverage
  - [ ] weird condensed cover pages (American Patrol class)
- [ ] ≥ 80% auto-commit success at configured thresholds
- [ ] 0 occurrences of forbidden part labels in committed library
- [ ] No log contains API keys / base64 blobs
- [ ] System handles restarts mid-job with no duplicates or corruption
- [ ] All unit + integration tests pass

---

## Appendix: Files used by Smart Upload (inventory)

This list is useful for “wiring everything together” audits.

### Upload entry + progress
- `src/app/api/files/smart-upload/route.ts`
- `src/app/api/admin/uploads/events/route.ts`
- `src/app/api/admin/uploads/status/[sessionId]/route.ts`
- `src/app/(admin)/admin/uploads/page.tsx`

### Workers + job routing
- `src/workers/smart-upload-processor-worker.ts`
- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`
- `src/workers/index.ts`
- `src/lib/jobs/smart-upload.ts`
- `src/lib/jobs/queue.ts`
- `src/lib/jobs/definitions.ts`

### PDF + segmentation + splitting
- `src/lib/services/pdf-renderer.ts`
- `src/lib/services/pdf-text-extractor.ts`
- `src/lib/services/part-boundary-detector.ts`
- `src/lib/services/cutting-instructions.ts`
- `src/lib/services/pdf-splitter.ts`
- `src/lib/services/pdf-part-detector.ts` (evaluate usage; may be legacy)
- `src/lib/services/ocr-fallback.ts`
- `src/workers/ocr-worker.ts` (optional OCR queue)

### Metadata + naming + gating + commit
- `src/lib/smart-upload/prompts.ts`
- `src/lib/smart-upload/schema.ts`
- `src/lib/smart-upload/bootstrap.ts`
- `src/lib/smart-upload/quality-gates.ts`
- `src/lib/smart-upload/metadata-normalizer.ts`
- `src/lib/smart-upload/part-naming.ts`
- `src/lib/smart-upload/canonical-instruments.ts`
- `src/lib/smart-upload/duplicate-detection.ts`
- `src/lib/smart-upload/fallback-policy.ts`
- `src/lib/smart-upload/commit.ts`
- `src/lib/services/smart-upload-cleanup.ts`
- `src/types/smart-upload.ts`
- `prisma/schema.prisma`

### Provider + LLM layer
- `src/lib/llm/index.ts`
- `src/lib/llm/types.ts`
- `src/lib/llm/config-loader.ts`
- `src/lib/llm/providers.ts`
- `src/lib/llm/openai.ts`
- `src/lib/llm/openrouter.ts`
- `src/lib/llm/gemini.ts`
- `src/lib/llm/anthropic.ts`
- `src/lib/llm/ollama.ts`
- `src/lib/llm/ollama-cloud.ts`
- `src/lib/llm/mistral.ts`
- `src/lib/llm/groq.ts`
- `src/lib/llm/custom.ts`
- `src/lib/llm/auto-provider.ts`

### Admin settings + review APIs
- `src/app/api/admin/uploads/settings/route.ts`
- `src/app/api/admin/uploads/settings/test/route.ts`
- `src/app/api/admin/uploads/settings/reset-prompts/route.ts`
- `src/app/api/admin/uploads/models/route.ts`
- `src/app/api/admin/uploads/model-params/route.ts`
- `src/app/api/admin/uploads/providers/discover/route.ts`
- `src/app/api/admin/uploads/review/route.ts`
- `src/app/api/admin/uploads/review/[id]/preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`
- `src/app/api/admin/uploads/review/[id]/approve/route.ts`
- `src/app/api/admin/uploads/review/[id]/reject/route.ts`
- `src/app/api/admin/uploads/review/bulk-approve/route.ts`
- `src/app/(admin)/admin/uploads/settings/page.tsx`
- `src/components/admin/music/smart-upload-settings-form.tsx`
- `src/app/(admin)/admin/uploads/review/page.tsx`
