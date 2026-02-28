You are a one-shot coding agent assigned to the `eccb.app` repository. Your objective is to **implement the best possible, end-to-end solution** for the Smart Upload pipeline. The final output should be a complete set of code changes, new files, tests, and documentation that accomplish the following:

1. Eliminate the three hard blockers visible in the console logs.
2. Close all logic gaps that prevent low‑confidence uploads from splitting.
3. Make every configuration option editable via the database and UI; no hard‑coded constants should remain.
5. Use Next.js 16 (App Router) best practices, integrate with the `next-devtools` MCP for validations (run `mcp_next-devtools_*` commands as needed to inspect routes, catch build errors, and verify cache components), and ensure serverless-safe patterns.
5. All services must be hosted locally (no external SaaS dependencies) and be architected for security, performance, and observability.
6. Optimize for production performance, including background workers, rate limiting, and error handling.
7. Provide comprehensive automated tests (unit, integration, e2e) and ensure `npm run lint`/`npm run build` succeed.
8. After implementing changes, output a concise summary of modifications and instructions to verify correctness.

Below is the detailed plan that serves as your blueprint; execute every step and extend it where needed to guarantee a robust, database-driven Smart Upload system.


---

### Hard blockers (match the console log)

1. **PDF→image rendering failure**
   * Log: `Setting up fake worker failed: "No \"GlobalWorkerOptions.workerSrc\" specified."`
   * Files: `src/lib/services/pdf-renderer.ts`, `src/lib/services/pdf-part-detector.ts` (also affects preview routes `/api/admin/uploads/review/[id]/preview` and `part-preview` which call `renderPdfToImage`).
   * Root cause: in pdfjs‑dist v5, setting
     ```ts
     pdfjsLib.GlobalWorkerOptions.workerSrc = '';
     ```
     no longer disables the worker; instead PDF.js tries to load a fake worker and complains when `workerSrc` is unset.
   * Fix: remove the `workerSrc = ''` assignment and call
     ```ts
     pdfjsLib.getDocument({ data: pdfData, disableWorker: true })
     ```
     in both services. Propagate errors with `err.message`/`err.stack` to aid debugging.

2. **Vision LLM call unauthorized (401)**
   * Log snippets:
     > `Vision model extraction failed ... 401 Unauthorized`
     > `Using OCR fallback metadata ... confidence=25`
   * Occurs in `callVisionLLM()` (smart-upload) and `callVerificationLLM()` (second-pass).
   * Two independent bugs:
     a. **Auth header selection is wrong.**
        * Existing code picks the first non-empty key from openai/openrouter/custom regardless of the provider setting. If `llm_provider = 'openai'` but only `openrouter` key exists, the router key is sent to OpenAI, causing 401. Switching providers without clearing old keys similarly breaks.
        * Fix: choose the API key strictly based on `config.llm_provider` (openai→openai key, openrouter→openrouter key, anthropic→anthropic key, etc.).
     b. **Env fallback is missing.**
        * `loadLLMConfig()` comments claim environment variable fallback, but the implementation reads only from database settings. If the DB record is blank, the request is unauthenticated even if an env var is set.
        * Fix: each key field should be `dbSetting || process.env.LLM_OPENAI_API_KEY || ''` (and equivalents for other providers).

3. **Second‑pass auto‑trigger always fails (403)**
   * Log: `POST /api/admin/uploads/second-pass 403` immediately following a successful upload.
   * The upload route does:
     ```ts
     void fetch('/api/admin/uploads/second-pass', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId }) });
     ```
   * Problems:
     * Server‑to‑server fetch does **not forward cookies** so `getSession()` in the target route returns null.
     * It omits `Origin`/`Referer`, causing the CSRF check (`validateCSRF()`) to reject the request.
   * Fix options:
     * **Minimal:** forward `cookie`, `origin`, `referer` from the original request when performing the fetch (acceptable on a long‑running Node host).
     * **Better:** refactor second-pass logic into a shared service or background job and call that directly instead of performing an HTTP request; this removes the need for cookies/CSRF entirely and works in serverless environments.

4. **Second‑pass JSON bug & workflow gap (low‑confidence splits never occur)**
   * In `second-pass/route.ts` the code does
     ```ts
     JSON.parse(smartSession.extractedMetadata as string)
     ```
     even though `extractedMetadata`, `parsedParts`, and `cuttingInstructions` are `Json?` columns in Prisma. At runtime they are objects/arrays, so parsing them as strings can crash or behave unpredictably.
   * Additionally, the handling of `routingDecision === 'no_parse_second_pass'` is wrong:
     * low confidence uploads set `no_parse_second_pass` and skip the initial split.
     * second-pass code only re-splits if `parseStatus === 'PARSED'` already, which never happens in this scenario, so the parts are never created.
   * Fixes:
     * Treat the fields as JSON values directly (`as ParsedPartRecord[]`, etc.) with null guards; never call `JSON.parse` on them.
     * After second-pass returns cutting instructions, if `parseStatus !== 'PARSED'` perform the initial split, upload parts, and set `parseStatus = 'PARSED'` (i.e. split on the second pass when the first skip occurred).

5. **Provider request format mismatch**
   * Settings UI lists providers `anthropic` and `gemini` but the request bodies sent in both calls are shaped for OpenAI chat‑completions. Anthropic expects `input`/`model` etc, Gemini has its own schema. Sending the wrong shape will cause the call to fail even with the correct key.
   * Fix: implement provider‑specific request formatting or, better yet, refactor the LLM invocation into an adapter (see later). This ensures the UI offerings are not misleading.

---

### A) Inventory: every file that is part of Smart Upload

#### Database / schema

* `prisma/schema.prisma`
* `prisma/migrations/20260221192207_smart_upload_staging/migration.sql`
* `prisma/migrations/20260223125420_expand_smart_upload_and_music_parts/migration.sql`
* `prisma/migrations/20260224023951_stand_features/migration.sql`
* `prisma/seed.ts`

#### API routes (Smart Upload + admin review/settings)

* `src/app/api/files/smart-upload/route.ts`
* `src/app/api/admin/uploads/second-pass/route.ts`
* `src/app/api/admin/uploads/review/route.ts`
* `src/app/api/admin/uploads/review/[id]/preview/route.ts`
* `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`
* `src/app/api/admin/uploads/review/[id]/approve/route.ts`
* `src/app/api/admin/uploads/review/[id]/reject/route.ts`
* `src/app/api/admin/uploads/review/bulk-approve/route.ts`
* `src/app/api/admin/uploads/settings/route.ts`
* `src/app/api/admin/uploads/settings/test/route.ts`
* `src/app/api/admin/uploads/models/route.ts`
* `src/app/api/admin/uploads/model-params/route.ts`

#### UI pages / components (admin)

* `src/app/(admin)/admin/layout.tsx` (role gate)
* `src/app/(admin)/admin/uploads/page.tsx` (upload UI)
* `src/app/(admin)/admin/uploads/review/page.tsx` (review UI)
* `src/app/(admin)/admin/uploads/settings/page.tsx` (settings page wrapper)
* `src/components/admin/music/smart-upload-settings-form.tsx` (settings form)

#### Services / shared logic used by pipeline

* `src/lib/services/pdf-renderer.ts`
* `src/lib/services/pdf-splitter.ts`
* `src/lib/services/pdf-part-detector.ts` (present, but not actually used by the main pipeline)
* `src/lib/services/ocr-fallback.ts`
* `src/lib/services/smart-upload-cleanup.ts`
* `src/lib/services/storage.ts`
* `src/lib/csrf.ts`
* `src/lib/env.ts`
* `src/lib/rate-limit.ts`
* `src/types/smart-upload.ts`

#### Tests / docs (Smart Upload)

* `src/app/api/files/smart-upload/__tests__/mocks.ts`
* `src/app/api/files/smart-upload/__tests__/route.test.ts`
* `src/app/api/files/smart-upload/__tests__/smart-upload-services.test.ts`
* `src/app/api/admin/uploads/review/[id]/approve/__tests__/route.test.ts`
* `src/app/api/admin/uploads/review/[id]/reject/__tests__/route.test.ts`
* `docs/SMART_UPLOAD.md`

---

### B) Your log’s failures: exact root causes + exact fixes

**B1) “No GlobalWorkerOptions.workerSrc specified” (PDF rendering fails for every page)**

*Symptom (your log):* repeated per-page render failures + warning `Failed to render page to image`.

*Root cause:* repo uses `pdfjs-dist@^5.4.624`. In v5, setting:

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc = '';
```

does **not** behave as “server-side fake worker” anymore; it can produce the exact error you saw.

**MODIFY**

1. `src/lib/services/pdf-renderer.ts`:
   * **Remove** the `GlobalWorkerOptions.workerSrc = ''` line entirely.
   * **Change** getDocument call to:
     ```ts
     pdfjsLib.getDocument({ data: pdfData, disableWorker: true })
     ```
2. `src/lib/services/pdf-part-detector.ts`:
   * Same fix: remove `workerSrc=''`, add `disableWorker:true`.

✅ This fix is already included in your patch zip for those two files.

---

### C) Smart Upload correctness gaps (it might “run” but still be wrong for sheet music)

1. **Page indexing off-by-one errors.**
   * LLMs typically return 1-based page numbers (humans count 1, 2, 3).
   * PDF libraries (pdf-lib, pdfjs) often use 0-based indices.
   * *Risk:* The system might cut pages `[1, 3]` when it meant `[0, 2]`, losing the first page and including an extra one.
   * *Fix:* Explicitly instruct the LLM to use 0-indexed or 1-indexed, and normalize in `src/lib/services/cutting-instructions.ts`.

2. **Filename collisions.**
   * If a score has two parts named "Percussion" (e.g. Percussion 1 and Percussion 2, but labeled ambiguously), the splitter might generate `Percussion.pdf` twice, overwriting the first.
   * *Fix:* Append `_p{start}-{end}` or a unique ID to filenames in `pdf-splitter.ts`.

3. **Combined parts handling.**
   * "Flute 1 & 2" on the same staff. The LLM might try to split them or treat them as one.
   * *Fix:* Ensure the schema allows `partName: "Flute 1 & 2"` and doesn't force artificial separation if they are on the same physical page.

### D) Smart Upload Settings is currently unsafe and incomplete

1. **Secrets handling.**
   * The settings form likely loads existing values. If the API returns the raw API key to populate the input field, that's a security leak.
   * *Fix:* API should return `******` or `__SET__` for keys. The form should only send the key if it's being changed.

2. **Hardcoded models.**
   * The code likely hardcodes `gpt-4-turbo` or similar.
   * *Fix:* Add a "Model Name" field to settings so admins can switch to `gpt-4o` or `claude-3-5-sonnet` without code changes.

3. **Rate limit configuration.**
   * No setting for "Max pages per minute" or "Max concurrent requests".
   * *Fix:* Add `llm_rate_limit` to settings.

### E) Review + approval workflow issues (quality and reliability)

1. **"Blind" approval.**
   * The admin sees metadata but not the resulting PDF parts. They click "Approve" hoping the LLM got the page ranges right.
   * *Fix:* Add a PDF preview to the Review modal that shows the specific pages selected for a part when hovering/clicking that part.

2. **No "Edit Split" capability.**
   * If the LLM misses a page, the admin has to Reject and re-upload.
   * *Fix:* Add a UI to manually adjust `pageStart` / `pageEnd` for parsed parts before approval.

### F) Enterprise-grade pipeline requirements (NY Phil / Berlin Phil caliber)

1. **Background Workers (BullMQ).**
   * Current `void fetch(...)` is fragile. If the server restarts, the job is lost.
   * *Requirement:* Move the entire pipeline (render -> vision -> split -> verify) into a durable job queue.

2. **Provider Adapters.**
   * `src/lib/llm/openai.ts`, `src/lib/llm/anthropic.ts`, etc.
   * Standardize input/output so switching providers is config-only.

3. **Progress Reporting.**
   * Users see a spinner. They should see "Rendering PDF...", "Analyzing pages 1-10...", "Splitting files...".

### G) Exhaustive “what to modify/create” checklist

* [ ] `src/lib/services/pdf-renderer.ts`: Fix workerSrc bug.
* [ ] `src/app/api/files/smart-upload/route.ts`: Fix Auth headers, add env fallback.
* [ ] `src/app/api/admin/uploads/second-pass/route.ts`: Fix JSON casting, fix split logic.
* [ ] `src/lib/services/cutting-instructions.ts`: Create validation/normalization logic.
* [ ] `src/components/admin/music/smart-upload-settings-form.tsx`: Add model selector, mask secrets.
* [ ] `src/app/api/admin/uploads/settings/route.ts`: Secure the GET/PUT logic.

### H) One concrete “sanity check” you should do right now (to be objective about the 401)

* **Log the API Key length/prefix.**
* In `callVisionLLM`, add:
  ```ts
  console.log('DEBUG: Using provider:', config.provider);
  console.log('DEBUG: Key prefix:', apiKey?.substring(0, 3), 'Length:', apiKey?.length);
  ```
* If it prints `sk-...` for OpenAI or `sk-ant...` for Anthropic, you know the config is loading. If it's undefined or empty string, the DB/Env fallback is definitely the culprit.

---

### Plan structure and implementation steps

The rest of this document details how to address the above hard blockers *and* corrective/UX/enterprise improvements. Each numbered step below references specific files and includes granular actions.

1. **Patch PDF rendering (B1 above).**
   * Modify `src/lib/services/pdf-renderer.ts` and `src/lib/services/pdf-part-detector.ts` as described above. Remove workerSrc lines and add `disableWorker: true`. Add error logging.
   * Ensure preview endpoints using `renderPdfToImage` (review preview routes) function correctly after this change.

2. **Fix Vision LLM authentication (B2a/b above).**
   * In both `src/app/api/files/smart-upload/route.ts` and `src/app/api/admin/uploads/second-pass/route.ts`:
     * Update `loadLLMConfig()` to read database settings with `|| process.env... || ''` fallback for every key field.
     * Replace the generic header builder with provider-specific logic; choose the key based on `config.llm_provider` and ignore unrelated keys.
     * Add comments reminding that OpenRouter keys must not be sent to OpenAI, and vice versa.
   * Extend tests:
     * Add cases ensuring the correct header is produced for each provider and that env vars are used when DB values are blank.

3. **Correct auto‑trigger for second pass (B3).**
   * **Option A (short‑term):** modify the fetch call in `src/app/api/files/smart-upload/route.ts` to include `cookie`, `origin`, and `referer` from the incoming request. Add a unit test mocking a request that verifies cookies are forwarded and the target endpoint returns 200.
   * **Option B (long‑term):** implement a new `SmartUploadSecondPass` job in your queue system and call `addSmartUploadSecondPassJob(sessionId)` instead of fetch. Refactor `second-pass/route.ts` to be a simple HTTP trigger that only enqueues the job (or remove the route entirely if not needed). Update review UI to trigger the job as well.
   * Remove reliance on CSRF/session in the worker path or support a service account token for internal calls.

4. **Fix JSON handling & split workflow (B4 above).**
   * In `src/app/api/admin/uploads/second-pass/route.ts`:
     * Cast `smartSession.extractedMetadata`, `smartSession.parsedParts`, `smartSession.cuttingInstructions` to the appropriate TypeScript types. Add `if (!something) { return res.status(400).json({ error: 'missing data' }); }` guards.
     * After obtaining new `cuttingInstructions` from the LLM, check `if (smartSession.parseStatus !== 'PARSED')` and, if so, run the same splitting logic used by the first pass to create parts and update `parseStatus`.
   * Add unit tests mimicking a low‑confidence session; the second‑pass handler should create parts and set status correctly.

5. **Provider-specific formatting and adapter strategy.**
   * Create `src/lib/llm/types.ts` and provider modules as described earlier in the plan. Each module should know how to translate a generic `VisionRequest` into the appropriate HTTP payload and endpoint for OpenAI, OpenRouter, Anthropic, Gemini, Ollama, etc.
   * Refactor both route files to call a single helper (e.g. `llm.callVisionModel(config, images, prompt)`) rather than repeating `fetch` logic. This ensures Anthropic/Gemini are supported out of the box and makes future providers easy to add.
   * Add tests that assert the correct body shape is generated for each provider when invoking `llm.callVisionModel`.

6. **Enhance type definitions and cutting‑instructions validation.**
   * Update `src/types/smart-upload.ts` per earlier plan.
   * Implement new service `src/lib/services/cutting-instructions.ts` with normalization/validation functions and export them for use in both route handlers. These functions should:
     * Accept raw instructions from the LLM and the document's total page count.
     * Correct common mistakes (convert 1‑indexed to 0‑indexed, clamp ranges, split overlapping segments).
     * Return a sanitized list or throw an error that the route can catch.
   * Insert calls to these helpers in the first‑pass (smart-upload) and second‑pass handlers before any splitting occurs.
   * Add unit tests covering the edge cases described (gaps, overlaps, 1‑indexed input, duplicate part names).

7. **Prevent filename collisions.**
   * Modify both route files where `partStorageKey` is built. Append either the page range (`__p${start}-${end}`) or a sequential index to ensure uniqueness.
   * Update any code/UI that uses `ParsedPartRecord.fileName` to include the suffix when displaying or downloading part PDFs.

8. **Settings UI security and completeness (100 % DB‑driven).**
   * All constants and behavior must come from the database; **no hard‑coded values in source**. Any value an admin might ever want to change must be stored in `SystemSetting` and exposed in the UI. This includes:
     * LLM provider, endpoints, and API keys
     * model names for vision and verification passes
     * confidence thresholds and auto‑approve thresholds
     * rate limits (RPM, concurrent jobs)
     * sampling parameters (max pages, page‑selection heuristics)
     * JSON parameter blobs (`vision_model_params`, `verification_model_params`)
     * file‑size limits, allowed MIME types, etc.
   * Change `settings/page.tsx` to return only booleans such as `llm_openai_api_key_set` and non‑secret values; no secret is ever rendered on the client.
   * Change settings API to never return actual keys. On PUT, ignore absent key fields, treat `"__CLEAR__"` as clear instruction, and reject `"***"` placeholder values (to avoid accidentally overwriting secrets). Persist all new settings added above and validate JSON for parameter fields.
   * Update `smart-upload-settings-form.tsx` with full form controls for every setting stored in the database—including advanced sections for rate limit, thresholds, sampling rules, and model params—and implement secret input semantics (empty when saved, ability to clear).
   * Seed every setting in `prisma/seed.ts` with sane defaults so that a fresh database has working configuration.
   * Audit the codebase for any remaining constants (e.g. `MAX_PDF_PAGES_FOR_LLM`, hard‑coded provider list) and replace them with calls to the DB settings service with fallback values; write tests to ensure no defaults remain in code.
   * Add UI validation and help text so the administrator understands the effect of each setting; include a “Restore defaults” button that resets DB values to the seeded defaults.

9. **Sampling and page limits.**
   * Add `pdf-page-sampler.ts` with heuristics for selecting representative pages (first, last, those around detected boundaries or with new instrument names). Use pdfjs text extraction to inform choices.
   * Change both route handlers to call the sampler instead of blindly rendering up to `MAX_PDF_PAGES_FOR_LLM`. Adjust the LLM prompt accordingly.

10. **Job queue & background processing.**
    * Follow the earlier roadmap for converting the inline pipeline into queued jobs. Create job definitions, queue helpers, and a `smart-upload-worker.ts` that executes the five pipeline steps.
    * Change the upload route to enqueue a job and immediately return the session ID. Change the second-pass route to enqueue a second‑pass job. Optionally allow the review UI to enqueue jobs as well.
    * Add status and events endpoints so the UI can display real‑time progress.

11. **Split editor & re-split endpoint.**
    * Build the React component and supporting API route (`update-cutting`) outlined earlier. Add UI integration and tests.

12. **Quality reporting, OMR, and enterprise features.**
    * Add structured `steps` to the Prisma schema and record detailed metrics and errors during processing.
    * Implement real OCR fallback with a new `ocr` service and optionally OMR improvements.
    * Add ensemble template validation and instrumentation reports.
    * Add auto‑approve import logic if desired.

13. **Review/approval fixes.**
    * Block approval of multi‑part sessions with no parsed parts, or require explicit user confirmation. Update bulk‑approve accordingly and show warnings in the UI.
    * Ensure second-pass auto‑approve can also auto‑import (optional service/worker).

14. **Tests.**
    * Add comprehensive unit and integration tests as detailed previously, covering all new logic and guardrails.

---

### Verification

1. **Build & lint**: `npm run lint` and `npm run build` should pass.
2. **Unit tests**: run `npx vitest` – all new and existing tests must succeed.
3. **Manual testing**:
   * Upload a multipage PDF; confirm progress updates, proper split, and no worker errors.
   * Verify that low‑confidence uploads split after second pass.
   * Change provider/keys in settings; ensure wrong key no longer used and env fallback works.
   * Confirm second‑pass job runs when triggered by the upload route and from UI; check logs for forwarded cookies or jobs.
   * Attempt to save settings with `***` or blank—keys should be preserved or cleared appropriately.
   * Test Anthropic/Gemini providers by mocking adapter responses to ensure payload format is correct.
4. **Security check**: inspect network tab of settings page; no secret should be sent to client except as “•••••” indicator.
5. **Regression audit**: run audit logs for previous failing cases (pdf rendering, unauthorized LLM) to ensure they no longer occur.

---

### Decisions

- **Job queue vs header forwarding** – prefer job queue for long‑term reliability; implement header forwarding as a short‑term patch if schedule demands.
- **Provider adapter** – will serve both current fixes and future extension; it’s a one‑time refactor.
- **Schema changes** – convert ad‑hoc status strings to enums/JSON; requires migration and careful backward compatibility.
- **Secret storage** – postpone full KMS encryption to a Later phase; initial fix is to stop exposing secrets and optionally support environment‑only mode.
- **Split editor scope** – initial version is a simple boundary dragger; future enhancements may include part‑name auto‑suggestion.