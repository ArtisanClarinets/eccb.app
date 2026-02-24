# SMART_UPLOAD_INTEGRATION_PROMPT.md

> **Goal:** Implement the **Smart Upload** feature end-to-end in the ECCB Platform in a **single cohesive sweep** (schema → API → workers → UI → tests → docs), with a provider-agnostic AI layer supporting:
>
> - **Local / self-hosted LLMs** via **OpenAI-compatible** endpoints (Ollama, vLLM, TGI, LM Studio, etc.)
> - **OpenRouter** (OpenAI-compatible)
> - **OpenAI**
> - **Anthropic**
> - **Gemini**
> - **KiloCode Gateway** (OpenAI-compatible base URL)
> - **OpenCode-style provider abstraction** by supporting gateway-style + OpenAI-compatible routing
> - “All major providers” via either (A) first-class adapters or (B) OpenAI-compatible gateways (Together, Groq, Fireworks, Perplexity, Mistral, DeepSeek, Cohere, etc.)

---

## 0) Repo Context (what exists today)

This repo is a **Next.js App Router** app with:
- Prisma (MariaDB)
- BullMQ + Redis background jobs + worker process (`npm run start:workers`)
- Storage abstraction: LOCAL filesystem or S3-compatible (`src/lib/services/storage.ts`)
- Existing music library + uploads:
  - Admin server actions: `src/app/(admin)/admin/music/actions.ts`
  - Public/member routes around download: `src/app/api/files/[...key]/route.ts`
  - Secure upload API: `src/app/api/files/upload/route.ts`
  - Music service: `src/lib/services/music.service.ts`
- Permissions and guards:
  - `src/lib/auth/permission-constants.ts`
  - `src/lib/auth/permissions.ts` / `src/lib/auth/guards.ts`
- Caching helpers: `src/lib/cache.ts`
- Admin job monitoring API: `src/app/api/admin/jobs/route.ts`
- Worker entrypoint: `src/workers/index.ts`

Smart Upload must integrate cleanly into **all** of these patterns.

---

## 1) Feature Definition

### 1.1 What “Smart Upload” does
Allow a librarian/admin to drag-and-drop **multiple files** (PDFs + audio, optionally images) and have the system:

1. Validate and store raw uploads (LOCAL/S3).
2. Extract text:
   - PDF text extraction first
   - OCR fallback if needed
3. Use an LLM to extract structured metadata:
   - Title, subtitle, composer, arranger, publisher, catalog number, difficulty, duration, notes
4. Detect whether the upload represents:
   - a full score
   - conductor score
   - one or more parts
   - a “packet” PDF that contains multiple parts
5. Split packet PDFs into per-part files (when applicable).
6. Produce a “proposal” UI for review:
   - editable extracted metadata
   - editable instrument/part mapping
7. On approval, ingest into the existing music library:
   - create/update `MusicPiece`
   - create `MusicFile` records for each artifact
   - create `MusicPart` links for instrument mapping
8. Provide progress + error visibility:
   - UI progress timeline
   - Retry per-step and DLQ support
   - Admin job monitor sees smart upload queues

### 1.2 Non-goals (initial release)
- Cloud provider ingestion (Google Drive/OneDrive/Dropbox) unless explicitly requested for Smart Upload.
- Automatic member assignments.
- Automatic licensing compliance checks beyond standard file validation.

---

## 2) Success Criteria / Definition of Done (DoD)

### Functional
- A librarian with the right permission can:
  - start a Smart Upload batch
  - upload multiple files
  - watch progress update
  - review extracted metadata + part mapping
  - approve and ingest into music library
- Files appear in the existing music piece UI and are downloadable through existing authorization rules.

### Engineering
- Works with BOTH LOCAL and S3 storage drivers.
- Job pipeline runs in workers (`npm run start:workers`) with health endpoint reflecting smart upload worker status.
- Lint + unit tests + build pass:
  - `npm run lint`
  - `npm run test:run`
  - `npm run build`
- All new env vars are validated in `src/lib/env.ts` and templated in `env.example` + `src/lib/setup/env-manager.ts`.
- All new DB migrations are created and Prisma client generated.
- No unsafe “LLM follows instructions from PDFs” behavior (prompt injection mitigations).

---

## 3) Architecture Overview

### 3.1 Core objects
- **SmartUploadBatch**: top-level, owned by user; status + timestamps + summary
- **SmartUploadItem**: each uploaded file; per-step status, errors, derived artifacts
- **SmartUploadProposal** (optional): normalized extracted metadata + mapping

### 3.2 Job pipeline
BullMQ jobs per item (and batch orchestration):
- `smartUpload.extractText`
- `smartUpload.llmExtractMetadata`
- `smartUpload.classifyAndPlanSplit`
- `smartUpload.splitPdf` (if needed)
- `smartUpload.ingest` (on approval)
- `smartUpload.cleanup` (cancel/failure)

All jobs must be idempotent and safe to retry.

### 3.3 AI provider abstraction
Implement `src/lib/ai/*` as the single interface used by workers/services.

Provider selection rules:
- `AI_PROVIDER=openai|anthropic|gemini|openrouter|openai_compat`
- `OPENAI_COMPAT_BASE_URL` supports local and gateway providers.
- `OPENROUTER_API_KEY` routes via OpenAI-compatible adapter with required headers.
- `KILO_API_KEY` routes via OpenAI-compatible adapter with Kilo base URL.
- Add a `CUSTOM_AI_BASE_URL` + `CUSTOM_AI_HEADERS_JSON` escape hatch.

---

## 4) Security Requirements (hard constraints)

- All Smart Upload endpoints require:
  - Authentication
  - Permission check (new permission(s))
  - CSRF validation for mutating requests
  - Rate limiting where appropriate (uploads + polling)
- File validation:
  - MIME allowlist (PDF, MP3/WAV, optionally images)
  - Magic-byte validation (reuse `validateFileMagicBytes`)
  - Max size per file and per batch
- Prompt injection:
  - Treat extracted text as untrusted.
  - Prompts must explicitly instruct model to ignore instructions within the document.
  - Structured output enforced with Zod validation and retry/repair.

---

## 5) Exact File-Level Work Plan

> Implement in this order to keep the build green at each step.

### 5.1 Prisma schema & migrations
**Update**
- `prisma/schema.prisma`

**Add/Modify**
- Add tables:
  - `SmartUploadBatch`
  - `SmartUploadItem`
  - (Optional) `SmartUploadArtifact` if you want derived files separate from original item
- Extend `MusicFile` with:
  - `contentHash` (unique-ish for dedupe)
  - `extractedMetadata` JSON (optional)
  - `ocrText` (optional, or move into SmartUploadItem)
  - `source` / `originalUploadId` (optional)
- Add enums:
  - `SmartUploadStatus`
  - `SmartUploadStep`

**Generate**
- `prisma/migrations/<timestamp>_smart_upload/*`

**Update**
- `prisma/seed.ts` to create new permissions if you store them in DB seed.

### 5.2 Permissions
**Update**
- `src/lib/auth/permission-constants.ts`
  - Add:
    - `MUSIC_SMART_UPLOAD`
    - `MUSIC_SMART_UPLOAD_APPROVE` (if approval required)
- `PERMISSIONS.md` to document.

### 5.3 Env + setup tooling
**Update**
- `src/lib/env.ts` add validated env vars:
  - `SMART_UPLOAD_ENABLED`
  - `SMART_UPLOAD_MAX_FILES`
  - `SMART_UPLOAD_MAX_TOTAL_BYTES`
  - `SMART_UPLOAD_OCR_MODE`
  - `AI_PROVIDER`
  - `AI_MODEL`
  - `AI_TEMPERATURE`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GEMINI_API_KEY`
  - `OPENROUTER_API_KEY`
  - `OPENAI_COMPAT_BASE_URL`
  - `OPENAI_COMPAT_API_KEY`
  - `CUSTOM_AI_BASE_URL` (optional)
  - `CUSTOM_AI_HEADERS_JSON` (optional)
- `env.example`
- `src/lib/setup/env-manager.ts`

### 5.4 Dependencies
**Update**
- `package.json` (and lockfile) to add:
  - AI SDKs (choose one approach):
    - Option A: official SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) + HTTP for openai-compat
    - Option B: a unified SDK approach if you prefer
  - PDF tools: `pdf-lib` (splitting), `pdf-parse` or `pdfjs-dist` (text extraction)
  - OCR approach:
    - Prefer system binaries invoked via `child_process` (tesseract/ocrmypdf/poppler) OR a node OCR lib
  - Optional: `p-limit` for concurrency control inside workers

### 5.5 AI layer (new)
**Create**
- `src/lib/ai/types.ts`
- `src/lib/ai/provider-registry.ts`
- `src/lib/ai/index.ts`
- `src/lib/ai/structured-output.ts`
- `src/lib/ai/prompts/music-metadata.ts`
- `src/lib/ai/prompts/part-classification.ts`

**Create providers**
- `src/lib/ai/providers/openai.ts`
- `src/lib/ai/providers/anthropic.ts`
- `src/lib/ai/providers/gemini.ts`
- `src/lib/ai/providers/openai-compatible.ts`
- `src/lib/ai/providers/openrouter.ts` (thin wrapper)
- `src/lib/ai/providers/kilo.ts` (thin wrapper)
- `src/lib/ai/providers/custom.ts` (thin wrapper)

**Hard requirement:** Smart Upload code must **never** call OpenAI/Anthropic/Gemini directly; it must only call `src/lib/ai/index.ts`.

### 5.6 Smart Upload service layer (new)
**Create**
- `src/lib/services/smart-upload/smart-upload.types.ts`
- `src/lib/services/smart-upload/smart-upload.service.ts`
- `src/lib/services/smart-upload/text-extraction.ts`
- `src/lib/services/smart-upload/pdf-splitter.ts`
- `src/lib/services/smart-upload/content-hash.ts`
- `src/lib/services/smart-upload/instrument-mapper.ts`
- `src/lib/services/smart-upload/validators.ts`

**Update**
- `src/lib/services/music.service.ts` to add an ingestion helper that Smart Upload uses (avoid duplicating logic from server actions).

### 5.7 Job queue + workers
**Update**
- `src/lib/jobs/definitions.ts`
  - add job names + typed payloads
- `src/lib/jobs/queue.ts`
  - register a new queue name (e.g. `SMART_UPLOAD`)
  - expose stats + DLQ support for it
- `src/workers/index.ts`
  - start/stop smart upload worker
  - add to health endpoint status
- **Create**
  - `src/workers/smart-upload-worker.ts`

**Update**
- `src/app/api/admin/jobs/route.ts`
  - extend zod enums to include `SMART_UPLOAD`
  - ensure job status endpoints work

### 5.8 API routes
**Create**
- `src/app/api/music/smart-upload/route.ts`
  - `POST`: create batch + enqueue first jobs
  - `GET`: list batches for current user (optional)
- `src/app/api/music/smart-upload/[batchId]/route.ts`
  - `GET`: fetch batch + items + status + proposal
  - `PATCH`: update proposal fields (optional)
- `src/app/api/music/smart-upload/[batchId]/approve/route.ts`
  - `POST`: approve proposal → enqueue ingestion
- `src/app/api/music/smart-upload/[batchId]/cancel/route.ts`
  - `POST`: cancel + cleanup

**Decide** whether file uploads for Smart Upload:
- Option A: reuse `src/app/api/files/upload/route.ts` and attach `batchId`/`itemId`
- Option B: create a dedicated upload route under smart upload
Either way, enforce magic byte + size + permission + CSRF.

### 5.9 Admin UI
**Create pages**
- `src/app/(admin)/admin/music/smart-upload/page.tsx`
- `src/app/(admin)/admin/music/smart-upload/[batchId]/page.tsx`

**Create components**
- `src/components/admin/music/smart-upload/smart-upload-dropzone.tsx`
- `src/components/admin/music/smart-upload/smart-upload-progress.tsx`
- `src/components/admin/music/smart-upload/smart-upload-review-form.tsx`
- `src/components/admin/music/smart-upload/part-mapping-editor.tsx`

**Create hook**
- `src/hooks/use-smart-upload.ts`

**Update navigation**
- `src/components/admin/sidebar.tsx` add Smart Upload link

### 5.10 Server actions (optional but recommended)
If the admin area prefers server actions:
- Create `src/app/(admin)/admin/music/smart-upload/actions.ts`
or extend `src/app/(admin)/admin/music/actions.ts` with Smart Upload actions.

### 5.11 Tests
**Create**
- `src/lib/services/smart-upload/__tests__/smart-upload.service.test.ts`
- `src/lib/ai/__tests__/provider-registry.test.ts`
- `src/workers/__tests__/smart-upload-worker.test.ts`
- `src/app/api/music/smart-upload/__tests__/route.test.ts` (if you test route handlers)

### 5.12 Docs
**Create**
- `docs/SMART_UPLOAD_INTEGRATION_PROMPT.md` (this file)
- `docs/SMART_UPLOAD.md`
- `docs/AI_PROVIDERS.md`

**Update**
- `README.md`

---

## 6) Implementation Details (must follow)

### 6.1 SmartUpload statuses (example)
- Batch:
  - `CREATED` → `UPLOADING` → `PROCESSING` → `NEEDS_REVIEW` → `APPROVED` → `INGESTING` → `COMPLETE`
  - failure states: `FAILED`, `CANCELLED`
- Item steps:
  - `VALIDATED` → `TEXT_EXTRACTED` → `METADATA_EXTRACTED` → `SPLIT_PLANNED` → `SPLIT_COMPLETE`

### 6.2 Text extraction strategy
1. Attempt PDF text extraction (fast).
2. If extracted text is too short or low quality:
   - OCR fallback (based on env `SMART_UPLOAD_OCR_MODE`)
3. Persist text in DB (item table) for audit + re-runs.

### 6.3 Splitting strategy
- If LLM indicates the PDF contains multiple parts:
  - Create a split plan:
    - pages [start..end] → instrument label
  - Use `pdf-lib` to generate per-part PDFs
  - Store derived PDFs in storage with deterministic keys
  - Create DB records for artifacts

### 6.4 LLM structured extraction
- Always request JSON output conforming to Zod schema.
- Implement:
  - `tryParseJson` + “repair” for common errors
  - retry with “return only JSON” instruction
- Use deterministic settings where possible (`temperature=0`).

### 6.5 Instrument mapping
- Map extracted instrument names to existing `Instrument` rows:
  - normalize (`toLowerCase`, strip punctuation)
  - fuzzy matching (simple edit distance or prefix)
- Provide UI to correct mapping.

### 6.6 Ingestion
- Must use existing services:
  - create or update `MusicPiece`
  - create `MusicFile`
  - create `MusicPart` where relevant
- Must trigger:
  - `auditLog`
  - cache invalidation (`invalidateMusicCache`, etc.)

---

## 7) Autonomous Agent Execution Strategy

> The point of this prompt is to let an autonomous coding agent do the whole implementation with subagents in parallel.

### 7.1 Tooling allowed (use freely)
Use every tool available in the agent environment, including but not limited to:
- shell commands: `rg`, `find`, `npm`, `prisma`, `tsx`, `vitest`
- Next.js devtools (if available)
- Prisma MCP server (`prisma mcp`) for migrations/status/studio
- Any IDE automation / refactor tools
- “Desktop-Commander” MCP tools if running in KiloCode
- Web browsing for official provider docs (do not guess API details)

### 7.2 Work splitting into subagents

#### Conductor / Integrator (main agent)
**Responsibilities**
- Own the final branch/PR.
- Create the feature flag plumbing and ensure build stays green.
- Merge subagent outputs, resolve conflicts, and run full test suite.
- Ensure documentation is complete and consistent.

**Prompt**
- “You are the Conductor. Coordinate all subagents. Ensure every item in §5 is implemented and integrated. Keep the repo green at each phase. Run lint/test/build. Verify Smart Upload end-to-end locally.”

---

## 8) Subagent Prompts (copy/paste to dispatch)

### Subagent A — Schema & Prisma
**Goal**
- Implement Smart Upload DB schema + migrations.
- Extend MusicFile with content hash + metadata support.

**Constraints**
- Preserve existing relations and cascading behaviors.
- Follow Prisma naming conventions already used.

**Files**
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `prisma/seed.ts` (if needed)

**Deliverables**
- Migration created and `prisma generate` succeeds.
- Provide a short schema summary and how to query batch/item.

**Prompt to send**
- “Add SmartUploadBatch + SmartUploadItem models and required enums. Extend MusicFile with contentHash and extractedMetadata. Generate migration. Ensure `npm run db:generate` works.”

---

### Subagent B — AI Provider Layer
**Goal**
- Implement `src/lib/ai/*` with providers:
  - openai, anthropic, gemini
  - openai-compatible (for local, OpenRouter, Kilo, custom gateways)
- Implement prompt templates + structured parsing.

**Constraints**
- Single interface in `src/lib/ai/index.ts`
- Zod-validated JSON output
- Timeouts + retries + logging (use `src/lib/logger`)

**Files**
- `src/lib/ai/**`
- `src/lib/env.ts` additions needed for AI vars (coordinate with Env subagent)

**Deliverables**
- Unit tests for provider registry + JSON parsing.
- Example calls: `extractMusicMetadata(text)`.

**Prompt to send**
- “Create an AI abstraction in `src/lib/ai`. Add providers for OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints. Implement robust structured JSON parsing with Zod. Add prompts for music metadata and part classification.”

---

### Subagent C — OCR + PDF Tooling
**Goal**
- Implement extraction and splitting utilities:
  - `text-extraction.ts` with PDF parse + OCR fallback
  - `pdf-splitter.ts` to split into per-part files

**Constraints**
- Works on Node in worker process
- Avoid huge memory spikes (stream where possible)
- Deterministic output file naming (hash-based)

**Files**
- `src/lib/services/smart-upload/text-extraction.ts`
- `src/lib/services/smart-upload/pdf-splitter.ts`
- `package.json` (deps)
- optional `scripts/deploy-setup.sh` if using system binaries

**Deliverables**
- Utility functions + tests for splitting logic.
- Clear error messages and safe fallbacks.

**Prompt to send**
- “Implement PDF text extraction with OCR fallback and PDF splitting utilities. Use `pdf-lib` for splitting and a reasonable text extraction library. Add unit tests.”

---

### Subagent D — Queue + Worker Integration
**Goal**
- Add Smart Upload queue + jobs in BullMQ.
- Create `smart-upload-worker.ts` and integrate into `src/workers/index.ts`.
- Update admin job monitor enums.

**Constraints**
- Idempotent jobs
- Proper retry/backoff
- Write progress to DB and BullMQ progress

**Files**
- `src/lib/jobs/definitions.ts`
- `src/lib/jobs/queue.ts`
- `src/workers/smart-upload-worker.ts`
- `src/workers/index.ts`
- `src/app/api/admin/jobs/route.ts`

**Prompt to send**
- “Add Smart Upload job types and a new queue. Implement a Smart Upload worker that runs extraction → LLM → split planning → split execution, updating DB statuses. Wire into worker index and admin jobs route.”

---

### Subagent E — Smart Upload Service Layer
**Goal**
- Implement the DB-backed orchestration and ingestion logic.

**Constraints**
- Uses `MusicLibraryService` for ingestion
- Uses storage service for files
- Uses AI abstraction only (never direct SDK usage)

**Files**
- `src/lib/services/smart-upload/*`
- `src/lib/services/music.service.ts` (ingestion helper)
- `src/lib/services/storage.ts` (if needed)

**Prompt to send**
- “Create Smart Upload service layer with batch/item lifecycle management, hashing, validation, and ingestion into music library. Ensure cache invalidation and audit logs occur.”

---

### Subagent F — API Routes
**Goal**
- Create API endpoints for Smart Upload lifecycle and polling.

**Constraints**
- Auth + permission + CSRF + rate limiting
- Consistent error shapes + logging
- Avoid leaking provider keys or LLM raw prompts in responses

**Files**
- `src/app/api/music/smart-upload/**`

**Prompt to send**
- “Implement Smart Upload API routes: create batch, fetch status, approve, cancel. Enforce auth, permissions, CSRF, and rate limits. Return progress suitable for UI polling.”

---

### Subagent G — Admin UI + Hooks
**Goal**
- Implement Smart Upload UI pages + components + hooks.

**Constraints**
- Follow existing admin UI patterns and Tailwind/Radix usage.
- Poll status and render a step timeline.
- Editable review form.

**Files**
- `src/app/(admin)/admin/music/smart-upload/**`
- `src/components/admin/music/smart-upload/**`
- `src/hooks/use-smart-upload.ts`
- `src/components/admin/sidebar.tsx`

**Prompt to send**
- “Create Smart Upload pages and components: dropzone, progress timeline, review form, part mapping editor. Add nav link in admin sidebar. Implement `use-smart-upload` hook.”

---

### Subagent H — Env + Setup Manager
**Goal**
- Add all env vars + validation + template generation.

**Constraints**
- Every new env var must be:
  - validated in `src/lib/env.ts`
  - present in `env.example`
  - included in `src/lib/setup/env-manager.ts`

**Prompt to send**
- “Add Smart Upload + AI provider env vars and validation. Update env.example and env-manager. Keep backward compatible defaults for dev.”

---

### Subagent I — Tests + QA
**Goal**
- Add tests covering:
  - provider registry selection
  - JSON parsing/repair
  - smart upload lifecycle (mock AI + OCR)
  - worker job success/failure paths

**Constraints**
- Use Vitest patterns in repo.
- Mock network calls.

**Prompt to send**
- “Add Vitest unit tests for AI provider registry, smart upload service lifecycle, and smart upload worker job processing. Ensure tests run under `npm run test:run`.”

---

### Subagent J — Docs
**Goal**
- Document:
  - how to run smart upload
  - how to configure providers (local/openrouter/openai/anthropic/gemini/kilo)
  - operational failure modes and retries

**Files**
- `docs/SMART_UPLOAD.md`
- `docs/AI_PROVIDERS.md`
- `README.md`

**Prompt to send**
- “Write operator/developer docs for Smart Upload and AI providers configuration. Include example .env snippets and troubleshooting steps.”

---

## 9) Integration Checklist (Conductor must verify)

- [ ] `SMART_UPLOAD_ENABLED` feature flag gates UI + API
- [ ] Permission checks enforced for:
  - batch create
  - file upload
  - approve/ingest
  - cancel
- [ ] DB migrations applied cleanly
- [ ] Worker starts and health endpoint includes smart upload worker
- [ ] Admin job monitor lists SMART_UPLOAD queue
- [ ] UI pages accessible from admin sidebar
- [ ] At least one happy-path e2e manual test:
  - upload 2 PDFs → metadata extracted → approve → piece created with files
- [ ] Lint/test/build all pass

---

## 10) Command Script (Conductor)

```bash
# install + generate
npm install
npm run db:generate

# migrate local
npm run db:migrate

# run tests + lint
npm run lint
npm run test:run

# run app + workers
npm run dev
npm run start:workers
```

---

## 11) Notes on Provider Compatibility

### OpenAI-compatible endpoints (critical)
Support configuring:
- `OPENAI_COMPAT_BASE_URL`
- `OPENAI_COMPAT_API_KEY` (optional for local)
- model name via `AI_MODEL`

This single adapter enables:
- Local/self-hosted: Ollama/vLLM/TGI/LM Studio
- OpenRouter
- KiloCode Gateway
- Many other providers with OpenAI-compatible REST APIs

### First-class providers
Still provide first-class adapters for:
- OpenAI
- Anthropic
- Gemini

So we can support their best features and reduce subtle API mismatch issues.

---

## 12) Deliverable

Implement the full Smart Upload feature per this prompt. The final result must be ready for production deployment behind a feature flag, with full provider coverage, job processing, admin UI integration, and tests.

