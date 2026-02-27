You are an autonomous coding agent with full access to the `eccb.app` repository.  
Your mission is to **finish, harden and extend the Smart‑Upload subsystem** so that it becomes a completely autonomous, production‑grade feature for ingesting PDF sheet‑music and producing individual part PDFs.

The code already contains most of the pipeline; your job is to audit it, plug the remaining gaps, add missing features, update configuration, extend tests and documentation, and ship the whole thing end‑to‑end.  
When you are done the workspace must:

* compile without TypeScript errors,
* lint with zero error/warning,
* run `npm run test` with all tests passing,
* build and run without runtime errors,
* the UI pages and API endpoints must behave correctly,
* local development instructions must be up‑to‑date,
* documentation must describe the system and how to configure it.

---

### 1. **Provider wiring & configuration**

* Update `src/lib/smart-upload/schema.ts`:
  * include `'ollama-cloud'`, `'mistral'`, `'ollama'` (local), `'kimi'`, and `'groq'` in the provider enum.
  * update `getApiKeyFieldForProvider`, `providerRequiresApiKey`/`providerRequiresEndpoint` accordingly.
* Ensure `src/lib/llm/providers.ts` contains metadata for every provider you will support (including defaultVisionModel, defaultVerificationModel, apiKey labels/placeholders, docsUrl).  
* Modify the settings form (`smart-upload-settings-form.tsx`) so that the provider dropdown, API key field, and endpoint field adapt to the extended provider list.  
* Add any new API‑key fields to the form validation schema and to `SMART_UPLOAD_SETTING_KEYS`.
* Update `src/app/api/admin/uploads/models/route.ts` and `model-params/route.ts` to handle parameter schemas for the new providers (mistral/groq/…); add reasoning flags where appropriate.
* Update `/test` route to exercise connectivity for every provider, including new ones (construct correct URLs/headers).
* Enhance `providers/discover/route.ts` to optionally detect and configure the new providers if environment variables or default endpoints are present.
* Update `scripts/update-llm-config.ts` to write the new provider keys and endpoints to the database.
* Audit and, if needed, extend `LLM_PROVIDERS` in the UI to drive the provider dropdown.
* Add unit tests for each new provider’s configuration paths (schema validation, endpoint selection, test route).

---

### 2. **LLM runtime configuration**

* In `src/lib/llm/config-loader.ts` add keys for `ollamaCloudApiKey`, `mistralApiKey`, `groqApiKey`; read from DB and env.  
* Ensure the `LLMRuntimeConfig` type covers all new keys.  
* `runtimeToAdapterConfig()` must pass only the relevant key for the chosen provider.
* Add tests verifying `loadSmartUploadRuntimeConfig()` returns sensible defaults for every provider combination.

---

### 3. **Adapters**

* Review every adapter file under `src/lib/llm` (`openai.ts`, `anthropic.ts`, `gemini.ts`, `openrouter.ts`, `ollama.ts`, `ollama-cloud.ts`, `mistral.ts`, `groq.ts`, `custom.ts`) and make sure:
  * they implement `buildRequest` and `parseResponse` according to `LLMAdapter`.
  * they support labeledInputs (used by verification).
  * they normalise endpoints (Ollama `/v1` etc.).
* Add missing adapters if any, or correct behaviours (Groq may not have vision; gracefully fall back).
* Write unit tests for each adapter covering request construction, response parsing, retry behaviour and error handling.

---

### 4. **Pipeline & workers**

* **`smart-upload-processor.ts`**:
  * confirm sampling logic, deterministic segmentation, header‑label pass and fallback all function.
  * ensure `deterministicConfidence` is used to bump confidence.
  * after extraction use `validateAndNormalizeInstructions()` with `oneIndexed`, detect gaps, and auto‑fill.
  * routingDecision logic must use `llmConfig.autoApproveThreshold`, `skipParseThreshold`.
  * if `!validation.isValid || confidence < skipParseThreshold` set `secondPassStatus='QUEUED'`.
  * when `llmConfig.enableFullyAutonomousMode && confidence >= autonomousApprovalThreshold && secondPassStatus==='NOT_NEEDED'` queue `smartupload.autoCommit`.
  * set `autoApproved` correctly.
  * store `firstPassRaw` for audit.
  * log all key steps.
  * add defensive checks and error logging.
* **`smart-upload-worker.ts`**:
  * fix bug: treat `extractedMetadata` as JSON object not string (already patched).
  * sampling of parsed parts must push labelledImages including part/page labels.
  * build `verificationPrompt` correctly for spot‑checking and fallback.
  * call `callVerificationLLM` with correct adapter config.
  * implement `detectDisagreements` and `callAdjudicatorLLM`.
  * update session via `finalizeSmartUploadSession()` which should:
    * update metadata, confidence, llm fields, adjudication data, cuttingInstructions, parsedParts, tempFiles.
    * set `autoApproved` on legacy threshold.
    * if fully autonomous and finalConfidence ≥ autonomousApprovalThreshold and !requiresHumanReview queue `autoCommit`.
  * on errors set `secondPassStatus='FAILED'` and store error in `secondPassRaw`.
  * ensure rate limiter dynamic re‑configuration works.
* Add comprehensive unit tests for both processors:
  * simulate original PDF buffer with minimal dummy pages.
  * stub `renderPdfPageBatch`, `renderPdfHeaderCropBatch`, `extractPdfPageHeaders`, `detectPartBoundaries`, `callVisionModel`, `splitPdfByCuttingInstructions`, `uploadFile`, `downloadFile`.
  * verify DB updates, job queueing, and correct field values for:
    * high‑confidence path (auto‑approve + optional auto‑commit).
    * low‑confidence path → queue second pass with status transitions.
    * second‑pass scenarios with/without parsedParts, disagreements, adjudication requiring human review, final auto‑commit.
    * failure recovery (LLM error, segmentation error).
* Add integration tests that run the processor and second‑pass worker functions with in‑memory Prisma (using SQLite) to exercise real splitting, commit, and cleanup flows.

---

### 5. **Domain & services**

* Write tests for:
  * `schema.ts`: every validation path, secrets masking, merging, provider-specific rules, new providers.
  * `bootstrap.ts`: seeding defaults and migrations; test forceReset and isConfigured.
  * `prompts.ts`: builder functions, default records, promptsNeedReset.
  * `part-naming.ts`: normalization and filename/slug builders with numerous edge cases.
  * `commit.ts`: commit transaction creating composer/publisher/piece/file/parts; test override logic, auto‑commit cleaning, duplicate detection, approval status.
  * `pdf-renderer`, `pdf-text-extractor`, `part-boundary-detector`, `cutting-instructions`, `pdf-splitter`: create unit tests for segmentation, validation, splitting (including overlapping/gaps/gap‑fixing logic).
  * `smart-upload-cleanup.ts`: deletion logic preserving committed keys.
* Add tests for `storage.ts` covering both LOCAL and S3 modes (use temporary directories and stub S3 client).  
* Add tests for rate-limiter, csrf and auth/permission utilities as needed.

---

### 6. **API & routes**

* Add/extend route tests:
  * **upload route** – POST with valid/invalid file, size limit, MIME type, magic bytes, permissions, rate limit, CSRF.
  * **status** – GET returns correct session object including new fields.
  * **events** – simulate SSE events and verify client receives progress/completed/failed messages.
  * **settings** – existing tests already cover; ensure new provider support and autonomy flags.
  * **settings/reset-prompts** and **settings/test** – add failure and success cases for new providers.
  * **model-params** – test param lists for all providers including reasoning/enums.
  * **providers/discover** – fake network responses and verify returned JSON and DB writes.
  * **second-pass enqueue** – permission, rate-limit, service token, status eligibility, DB update.
  * **review list** – return correct stats and transformed session.
  * **approve** – with and without overrides, invalid sessions, already committed.
  * **reject** – cleanup invoked, statuses updated.
  * **bulk-approve** – handles missing metadata, multi‑session transactions, errors.
  * **preview / part-preview** – page bounds, auth, storage key validation.
* Add tests for `settings/model-params` and `settings/providers/discover` to cover error cases (missing provider/model/API key).
* Verify OPTIONS responses set correct CORS headers.

---

### 7. **Database & migrations**

* If you add any new columns (e.g. for failure reasons or new settings), create a Prisma migration and update seed.
* Ensure `SmartUploadSession` schema contains:
  * `requiresHumanReview`, `adjudicatorStatus/Result/Raw`, `finalConfidence`, `llmPromptVersion` (already present).
* Update `prisma/seed.ts` to seed `smart_upload_enable_autonomous_mode` and `smart_upload_autonomous_approval_threshold` defaults.
* Run `npx prisma generate` and add a test verifying the new fields exist.

---

### 8. **UI**

* **Settings page** – ensure all fields appear, validation and JSON parsing works, prompts editable, test connection/back‑button/detect provider works. Add client tests verifying:
  * provider dropdown adapts, API key mask/unmask behaviour.
  * model list fetch and recommended model badge.
  * toggling `llm_two_pass_enabled`, autonomy settings.
  * reset prompts button resets values and updates form.
  * test connection button displays success/failure.
* **Upload page** – ensure drag‑drop, file list, progress bars, SSE status mapping, start button, error handling, clear finished. Add tests for state transitions and SSE subscription logic.
* **Review page** – ensure table shows new columns (parse/second‑pass badges, routingDecision, autoApproved, requiresHumanReview). Add filters for status, bulk‑action checkboxes, details dialog, approve/reject workflows.
* Add tests for the dialog that previews PDF pages, part previews, and editing metadata.
* Ensure upload and review UI reflect autonomy (e.g., show “auto‑approved” badge when appropriate).
* Add screen‑reader accessible labels and ARIA attributes as necessary.

---

### 9. **Services & utilities**

* Add tests for `applyRateLimit` and `validateCSRF` usage in new routes.
* Ensure `auth/guards` and `permissions` are used correctly by every route. Add unit tests if coverage missing.
* Add tests for `storage.validateFileMagicBytes`.
* Add or update any helper utilities described in notepad.

---

### 10. **Documentation**

* Update `PROMPT.md` with the complete file inventory and the new autonomous mode details, provider wiring hotspots and guidance (copy from user prompt).
* Add or update `SMART_UPLOAD_ACTION_PLAN.md`, `SMART_UPLOAD_API_CONFIGURATION.md`, and any docs under `docs/` (e.g. `SMART_UPLOAD_FORM_WIRING.md`) with the new thresholds, autonomy, provider support, migration instructions, and sample API usage.
* Add a section to `README.md` explaining how to configure Smart Upload, run workers, and test locally.
* Document the new environment variables and CLI script (`scripts/update-llm-config.ts`) changes.
* In code comments annotate any non‑obvious logic (rate limiter, segmentation, adjudication).

---

### 11. **Scripts & tooling**

* Update `scripts/update-llm-config.ts` to write the new provider keys (`ollama_cloud`, `mistral`, `groq`) and the autonomy settings. Add tests for this script.
* Add a task or documentation snippet to start the job workers (`node src/workers/index.ts` or via `npm run dev`).
* Ensure `package.json` scripts include any new commands (`lint`, `test`, `dev`, `workers`).

---

### 12. **Setup & verification instructions**

In your final notes include exact commands and the environment required to:

```bash
git clone ... && cd eccb.app
npm ci
export REDIS_URL=redis://localhost:6379
export LOCAL_STORAGE_PATH=./storage
# provider env vars for manual testing, e.g. LLM_OPENAI_API_KEY=...
npx prisma migrate dev --name smart-upload-complete
npm run db:generate
npm run seed
npm run lint      # should produce no warnings
npm run test      # all tests pass
npm run dev       # start server
# optionally: node src/workers/index.ts or `npm run workers` if added
```

Use the UI to upload a sample multi‑part PDF, watch SSE events, review in the queue, approve, and verify parts appear in the music library. Test second‑pass flows, adjudication, and full autonomous mode by toggling settings.

---

### 13. **Edge cases & performance**

* Race conditions: ensure only one worker processes a session at once; status checks and queue logic handle attempts gracefully.
* Rate limiting: update token bucket when DB settings change; add tests for dynamic update.
* Security: storage key validation for part previews; CSRF tokens required except for service‑token calls; ensure `SMART_UPLOAD_SERVICE_TOKEN` is respected.
* Logging: add contextual logs for every major action; include sessionId, jobId, partsCreated, confidence, errors.
* Performance: sample a maximum of `MAX_SAMPLED_PAGES` (8) pages; cap LLM page conversion at 50; make these constants configurable if needed.

---

### 14. **Logging / notepad**

Maintain a running notepad of every modification you make:

* file path
* brief description of change
* new tests added
* any hard‑coded values replaced or removed
* new migrations created
* documentation updates
* edge cases handled

Append that notepad to your final output so reviewers can verify your work.

---

When you have completed all of the above, your final output should consist of:

1. **The notepad** – a chronological list of all changes with context.
2. **A confirmation** that the repo compiles and tests pass.
3. **Instructions** for running the system locally and verifying the new autonomous Smart Upload.

Perform all coding, testing, and documentation edits in one continuous autonomous run – do not wait for manual intervention. When everything is in place, print the notepad and a success message; then exit.

Good luck.