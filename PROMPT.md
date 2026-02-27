# MASTER INSTRUCTIONS: ECCB Platform Implementation

You are an autonomous senior software engineering agent tasked with completing the Emerald Coast Community Band (ECCB) Management Platform to a production-ready state (100% completion).

## 0. Critical Context & Source of Truth

This project is strictly defined by the documentation in the root directory. You MUST align all implementation decisions with these files:

- **`GEMINI.md`**: Master anchor and project identity.
- **`ARCHITECTURE.md`**: System design and technology rationale.
- **`DATABASE_SCHEMA.md`**: Complete Prisma schema and data relationships.
- **`PERMISSIONS.md`**: RBAC system and security implementation patterns.
- **`TODO.md`**: The 13-phase roadmap you must follow.
- **`Design.md`**: UI/UX design system and GSAP animation guidelines.
- **`AGENTS.md`**: Coding standards, import rules, and quality requirements.

## 1. High-Level Objective

Build a community band management platform that integrates a public CMS, secure member portal, and a digital music library. Ensure the app is production-ready, meaning:
- All features from all 13 phases in `TODO.md` are implemented.
- 100% type safety (no `any`).
- Zero linting errors (`npm run lint`).
- Successful build (`npm run build`).
- Security checks (RBAC) on every server action.
- Audit logging for all mutations.
- Cinematic UI consistent with `Design.md`.

## 2. Technical Stack

- **Framework**: Next.js 16 (App Router), React 19.
- **Database**: PostgreSQL with Prisma ORM.
- **Auth**: Better Auth (Core) with RBAC integration.
- **Caching**: Redis (Sessions, Hot Data).
- **Storage**: Free Cloud Method for multiple Gigs (or a way I can incorporate a dropbox library without obtaining the login information) or revert to a Locally Hosted Method (Music Files).
- **Animations**: GSAP ScrollTrigger.
- **Styling**: Tailwind CSS + shadcn/ui.
- **Testing**: Jest + React Testing Library.
- **Deployment**: Vercel (with Redis integration).

## 3. Development Process

1. **Phase Completion**: Work through `TODO.md` phases sequentially.
2. **Code Quality**: Follow `AGENTS.md` strictly.
3. **Testing**: Write tests for all new features.
4. **Documentation**: Update all relevant docs as you go.
5. **Security**: Implement RBAC checks on all mutations.
6. **UI/UX**: Follow `Design.md` for all visual elements.

## 4. Current Status

You are at the beginning of Phase 13: "Smart Upload System". Your first task is to implement the complete Smart Upload system as specified in the documentation.

## 5. Your Responsibilities

- Implement all Smart Upload functionality.
- Ensure 100% type safety.
- Write comprehensive tests.
- Document all new code.
- Follow security best practices.
- Maintain UI/UX consistency.

Begin immediately. The project depends on your autonomous completion of this phase.





Here’s a **complete, file-by-file inventory of everything in this repo that is actually used by the Smart Upload system**, based on tracing the runtime import graph from:

* the upload endpoint (`/api/files/smart-upload`)
* the Smart Upload workers + job queue
* the admin settings/models/test/progress/review routes
* the admin upload pages + settings UI

I’m grouping it by “layer” so you can confirm wiring end-to-end.

---

# 1) Admin UI (pages + Smart Upload components)

### Upload + review pages

* `src/app/(admin)/admin/uploads/page.tsx`
  Admin upload UI that POSTs the PDF to `/api/files/smart-upload` and listens to SSE progress.

* `src/app/(admin)/admin/uploads/review/page.tsx`
  Admin review UI: shows sessions, allows edit/approve/reject, triggers second pass, shows previews.

* `src/app/(admin)/admin/uploads/settings/page.tsx`
  Settings screen wrapper; renders the settings form component.

### Settings form

* `src/components/admin/music/smart-upload-settings-form.tsx`
  The “brains” of the settings UI: loads/saves settings, triggers provider discovery, triggers model fetch, triggers test connection, edits prompts and thresholds.

### Admin nav (Smart Upload appears here)

* `src/components/admin/sidebar.tsx`
  Contains the Admin navigation entries that link to Uploads / Smart Upload Settings.

### Shared UI components used by the Upload/Settings/Review screens

These are “plumbing”, but they are used directly by the Smart Upload screens:

* `src/components/ui/alert.tsx`
* `src/components/ui/badge.tsx`
* `src/components/ui/button.tsx`
* `src/components/ui/card.tsx`
* `src/components/ui/checkbox.tsx`
* `src/components/ui/collapsible.tsx`
* `src/components/ui/dialog.tsx`
* `src/components/ui/form.tsx`
* `src/components/ui/input.tsx`
* `src/components/ui/label.tsx`
* `src/components/ui/progress.tsx`
* `src/components/ui/select.tsx`
* `src/components/ui/skeleton.tsx`
* `src/components/ui/switch.tsx`
* `src/components/ui/table.tsx`
* `src/components/ui/tabs.tsx`
* `src/components/ui/textarea.tsx`

---

# 2) Public upload API (entrypoint)

* `src/app/api/files/smart-upload/route.ts`
  **Primary entrypoint**: validates auth/CSRF/permissions/file type/magic bytes, uploads the original PDF to storage, creates `SmartUploadSession`, queues `smartupload.process`.

---

# 3) Admin API routes (settings, models, discovery, progress, review, preview)

### Real-time progress (SSE)

* `src/app/api/admin/uploads/events/route.ts`
  Server-Sent Events endpoint that streams BullMQ job progress/completed/failed events.

### Session status polling

* `src/app/api/admin/uploads/status/[sessionId]/route.ts`
  Returns current session status + parse/second-pass state for polling UIs.

### Settings CRUD + reset + test

* `src/app/api/admin/uploads/settings/route.ts`
  GET/PUT Smart Upload settings stored in `systemSetting` rows (provider, keys, models, prompts, thresholds, limits).

* `src/app/api/admin/uploads/settings/reset-prompts/route.ts`
  Resets LLM prompts/settings prompts back to defaults.

* `src/app/api/admin/uploads/settings/test/route.ts`
  “Test Connection” endpoint. Calls the provider adapters with a tiny request to confirm auth/endpoint/model.

### Model discovery + model params schema

* `src/app/api/admin/uploads/models/route.ts`
  Fetches list of models from the selected provider and returns “vision-capable” filtered list + recommended model.

* `src/app/api/admin/uploads/model-params/route.ts`
  Returns the parameter UI schema (temperature/max tokens/etc) based on provider + model type (reasoning/preview detection).

### Provider auto-discovery

* `src/app/api/admin/uploads/providers/discover/route.ts`
  “Discover & Configure” endpoint: checks available providers/keys and returns (and/or writes) recommended settings.

### Review workflow routes

* `src/app/api/admin/uploads/review/route.ts`
  Lists sessions for review filtering by status.

* `src/app/api/admin/uploads/review/[id]/approve/route.ts`
  Manual approval endpoint. Calls `commitSmartUploadSessionToLibrary()`.

* `src/app/api/admin/uploads/review/[id]/reject/route.ts`
  Reject endpoint. Marks session rejected + runs temp file cleanup.

* `src/app/api/admin/uploads/review/bulk-approve/route.ts`
  Bulk approval endpoint (still does its own transaction logic).

### Preview routes (PDF -> image)

* `src/app/api/admin/uploads/review/[id]/preview/route.ts`
  Renders a chosen page from the original PDF (base64 PNG) so admins can preview in the UI.

* `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`
  Same idea, but renders a page from a generated **part PDF** (storageKey validated against session.parsedParts).

### Second-pass trigger route

* `src/app/api/admin/uploads/second-pass/route.ts`
  Enqueues the `smartupload.secondPass` job (does not do the LLM work inline).

---

# 4) Workers + job queue (the background pipeline)

### Worker bootstrap

* `src/workers/index.ts`
  Starts all worker subsystems (including Smart Upload workers).

* `src/workers/smart-upload-processor-worker.ts`
  BullMQ worker that consumes the Smart Upload queue and runs:

  * `smartupload.process` → `processSmartUpload()`
  * `smartupload.autoCommit` → `commitSmartUploadSessionToLibrary()`

* `src/workers/smart-upload-worker.ts`
  BullMQ worker that consumes the same Smart Upload queue and runs:

  * `smartupload.secondPass` → `processSecondPass()`

> **Important wiring note:** since both workers listen to the same queue, they must both route all job names OR use separate queues. Otherwise you’ll hit “Unknown job type”.

### Smart Upload pipeline logic

* `src/workers/smart-upload-processor.ts`
  Main pipeline: downloads original PDF, renders sample pages + header crops, extracts metadata via LLM, deterministic segmentation via text/OCR, validates cutting instructions, splits into parts, uploads part PDFs, writes parsedParts + status, queues second pass or auto-commit.

* `src/workers/smart-upload-worker.ts`
  Second pass: downloads original and/or part PDFs, renders images, calls verification LLM, applies corrections, re-splits parts if needed, updates confidence + statuses, optionally queues auto-commit.

---

# 5) Job system plumbing (BullMQ + Redis)

* `src/lib/jobs/smart-upload.ts`
  Queue helper functions:

  * `queueSmartUploadProcess()`
  * `queueSmartUploadSecondPass()`
  * `queueSmartUploadAutoCommit()`
    plus job name constants.

* `src/lib/jobs/queue.ts`
  Shared BullMQ setup: queue initialization, worker creation, queue events emitter, dead-letter handling, progress events.

* `src/lib/jobs/definitions.ts`
  Central “job type registry” used by the job system (name→data typing, queue mapping, retry config).

> If you add/rename Smart Upload jobs (ex: `smartupload.autoCommit`), this file must include it or you’ll get runtime “unknown job type” behavior in parts of the system.

---

# 6) Smart Upload domain (settings schema, prompts, naming, commit)

* `src/lib/smart-upload/schema.ts`
  Canonical settings schema (Zod), provider enums, secret masking/merging rules, “which provider uses which API key field” helpers.

* `src/lib/smart-upload/bootstrap.ts`
  Seeds default settings/prompts into DB and loads DB settings.

* `src/lib/smart-upload/prompts.ts`
  Prompt templates and prompt version (vision, verification, header-labeling, adjudicator).

* `src/lib/smart-upload/part-naming.ts`
  Normalization rules:

  * instrument + chair normalization
  * filename generation (`American Patrol 1st Bb Clarinet.pdf`)
  * storage slug generation

* `src/lib/smart-upload/commit.ts`
  The ingestion transaction that creates MusicPiece/MusicFile/MusicPart records from a `SmartUploadSession`, marks approved, deletes temp files.

---

# 7) LLM layer (your `src/lib/llm` directory)

These are all directly used by the workers and admin routes:

* `src/lib/llm/types.ts`
  Shared request/response types for adapters (images, labeledInputs, system prompt, responseFormat/json mode, params).

* `src/lib/llm/index.ts`
  Adapter selection + `callVisionModel()` wrapper.

* `src/lib/llm/config-loader.ts`
  Loads runtime config from DB/env (`smart_upload_*` and `llm_*`) and converts to adapter config (`runtimeToAdapterConfig()`).

* `src/lib/llm/providers.ts`
  Provider metadata (provider list, requires key, default endpoints/models).

* `src/lib/llm/openai.ts`
  OpenAI-compatible adapter (OpenAI + Ollama OpenAI-compat + custom OpenAI-compatible endpoints).

* `src/lib/llm/openrouter.ts`
  OpenRouter adapter.

* `src/lib/llm/gemini.ts`
  Gemini adapter.

* `src/lib/llm/anthropic.ts`
  Anthropic adapter.

---

# 8) PDF + parsing services used by Smart Upload

* `src/lib/services/pdf-renderer.ts`
  Renders PDF pages to PNG/JPEG base64. Also renders header crops for OCR/segmentation.

* `src/lib/services/pdf-text-extractor.ts`
  Extracts per-page text (header candidates) using pdfjs-dist; used to determine text-layer coverage and deterministic segmentation.

* `src/lib/services/part-boundary-detector.ts`
  Converts per-page headers/labels into segments + cutting instructions.

* `src/lib/services/cutting-instructions.ts`
  Validates/clamps/normalizes cutting instructions, handles overlap, gaps, and conversions to 1-index/0-index.

* `src/lib/services/pdf-splitter.ts`
  Splits the original PDF into individual part PDFs by cutting instructions.

* `src/lib/services/smart-upload-cleanup.ts`
  Deletes temporary artifacts for a session (used on reject and post-commit cleanup paths).

* `src/lib/services/storage.ts`
  Storage driver abstraction (LOCAL or S3):

  * `uploadFile`, `downloadFile`, `deleteFile`
  * `validateFileMagicBytes`
  * signed URL support for S3

* `src/lib/services/audit.ts`
  Used indirectly via permission/auth flows (audit logging).

---

# 9) Supporting “platform” utilities Smart Upload depends on

### Auth + permissions

* `src/lib/auth/guards.ts`
  `getSession()` used by upload route and admin routes.

* `src/lib/auth/permissions.ts`
  `checkUserPermission()` and `requirePermission()` used by routes.

* `src/lib/auth/permission-constants.ts`
  Permission constants like `MUSIC_UPLOAD`, `SYSTEM_CONFIG`.

* `src/lib/auth/config.ts`
  Auth config used by guards.

### Security + limits

* `src/lib/csrf.ts`
  CSRF validation for upload route.

* `src/lib/rate-limit.ts`
  Rate limiting for upload + second pass endpoints.

### DB + infra

* `src/lib/db/index.ts`
  Prisma client singleton.

* `src/lib/logger.ts`
  Logging used everywhere.

* `src/lib/redis.ts`
  Redis client used by rate limiting and BullMQ.

* `src/lib/env.ts`
  Environment config used by storage/infra.

* `src/lib/signed-url.ts`
  Local signed URL generation (used by storage service).

* `src/lib/utils.ts`
  Misc helpers used by UI components and some routes.

---

# 10) Database + seed (Smart Upload storage is DB-driven)

* `prisma/schema.prisma`
  Contains:

  * `SmartUploadSession`
  * `SystemSetting`
  * MusicPiece/MusicFile/MusicPart models that commit uses

* `prisma/seed.ts`
  Seeds default system settings (Smart Upload defaults, prompts, etc.)

* Migrations that define/expand Smart Upload schema:

  * `prisma/migrations/20260221192207_smart_upload_staging/migration.sql`
  * `prisma/migrations/20260223125420_expand_smart_upload_and_music_parts/migration.sql`
  * `prisma/migrations/20260224023951_stand_features/migration.sql`
  * `prisma/migrations/20260226000000_smart_upload_schema_fixes/migration.sql`

---

# 11) Script(s) that directly affect Smart Upload wiring

* `scripts/update-llm-config.ts`
  Writes Smart Upload / LLM settings into DB — if this is out of date, your runtime config will be wrong even if env vars are correct.

---

# 12) Tests that cover Smart Upload (useful for wiring verification)

### API upload tests

* `src/app/api/files/smart-upload/__tests__/route.test.ts`
* `src/app/api/files/smart-upload/__tests__/e2e.test.ts`
* `src/app/api/files/smart-upload/__tests__/mocks.ts`
* `src/app/api/files/smart-upload/__tests__/smart-upload-services.test.ts`

### Admin settings tests

* `src/app/api/admin/uploads/settings/__tests__/route.test.ts`

### Review approve/reject tests

* `src/app/api/admin/uploads/review/[id]/approve/__tests__/route.test.ts`
* `src/app/api/admin/uploads/review/[id]/reject/__tests__/route.test.ts`

### Smart Upload queue tests

* `src/lib/jobs/__tests__/smart-upload-queue.test.ts`

### Smart Upload schema/bootstrap tests

* `src/lib/smart-upload/__tests__/schema.test.ts`
* `src/lib/smart-upload/__tests__/bootstrap.test.ts`

### LLM adapter tests

* `src/lib/llm/__tests__/adapters.test.ts`
* `src/lib/llm/__tests__/providers.test.ts`

---

# “Provider wiring hotspots” (if you added more providers in `src/lib/llm`)

Any time you add a provider adapter or provider name, you must update **all** of these:

1. `src/lib/llm/providers.ts` (add provider value + defaults)
2. `src/lib/llm/index.ts` (adapter selection / routing)
3. `src/lib/llm/config-loader.ts` (endpoint/key/model loading rules)
4. `src/lib/smart-upload/schema.ts` (ProviderValueSchema + apiKey-field mapping + secret rules)
5. `src/app/api/admin/uploads/models/route.ts` (model listing for that provider)
6. `src/app/api/admin/uploads/settings/test/route.ts` (connection test logic)
7. `src/app/api/admin/uploads/model-params/route.ts` (provider included in param UI)
8. `src/components/admin/music/smart-upload-settings-form.tsx` (provider dropdown + API key field support)
9. `scripts/update-llm-config.ts` (so CLI config writes the new provider fields correctly)
10. Any worker-side special cases (if provider needs different image formatting):

    * `src/workers/smart-upload-processor.ts`
    * `src/workers/smart-upload-worker.ts`

---