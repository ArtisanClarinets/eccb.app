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

* Update `docs/SMART_UPLOAD.md` with the updated documentation for the Smart Upload feature, including autonomy settings, provider support, and new API endpoints.
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
* Performance: sample a maximum of `MAX_SAMPLED_PAGES` (10) pages; cap LLM page conversion at 50; make these constants configurable.
* All settings, configs, and env variables for the smart upload should be configurable via the browser based UI and all settings should be stored in the database. This includes `SMART_UPLOAD_SERVICE_TOKEN` which should be configurable via the UI.
* Add a section to `README.md` explaining how to configure Smart Upload, run workers, and test locally.
* Document the new environment variables and CLI script (`scripts/update-llm-config.ts`) changes.
* In code comments annotate logic (rate limiter, segmentation, adjudication, upstream/downstream internal dependencies, expected input/output, etc.).

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
# Definition of Done
# Smart Upload Acceptance Criteria

**System:** Smart Upload
**Purpose:** Autonomous LLM-integrated music-library digitization pipeline
**Document Type:** Acceptance Criteria / Release Gate / Definition of Done
**Version:** 1.0
**Status:** Proposed Release Standard
**Primary Goal:** Convert uploaded music PDFs into correctly segmented, normalized, committed library records and individual part PDFs with no human intervention for normal cases.

---

# 1. Executive Standard

Smart Upload is **accepted as complete** only when a valid music PDF can be uploaded once and the system, by itself:

1. securely accepts the file,
2. validates and stores the original asset,
3. extracts page-level signals from text, image, and OCR-capable workflows,
4. identifies score and part boundaries correctly,
5. generates correct individual part PDFs,
6. derives normalized work-level and part-level metadata,
7. commits clean and linked database records exactly once,
8. saves all generated assets to storage correctly,
9. emits truthful progress and audit events,
10. recovers safely from retriable failure states,
11. routes ambiguous or unsafe cases to exception handling instead of silently committing bad data,
12. requires **no human review in the normal path**.

Manual review may exist, but only as an **exception workflow**, not as a required step for ordinary uploads.

---

# 2. Scope

This acceptance standard applies to the full Smart Upload workflow:

* upload intake
* auth, permissions, CSRF, rate limiting
* original file storage
* queueing and background processing
* text extraction
* image rendering
* OCR fallback
* LLM vision / document reasoning
* deterministic segmentation
* boundary validation
* PDF splitting
* metadata normalization
* duplicate detection
* autonomous commit
* storage persistence
* DB persistence
* retry behavior
* progress and status reporting
* audit logging
* provider configuration
* admin monitoring and exception handling
* automated tests
* production release readiness

---

# 3. Product Outcome

The system must save substantial labor during library digitization by replacing manual work in all normal cases, including:

* manual renaming of parts
* manual splitting of PDFs
* manual metadata entry
* manual identification of page ranges
* manual creation of database rows
* manual storage placement
* manual orchestration of OCR or second-pass verification
* manual triggering of “approve” for ordinary successful uploads

The system is not accepted if ordinary uploads still require human babysitting.

---

# 4. Supported Input Classes

The accepted production scope must include, at minimum:

## 4.1 Standard Input Types

* full ensemble packet PDFs
* single-part PDFs
* conductor score PDFs
* score + parts in one PDF
* multi-page parts
* single-page parts
* scanned PDFs
* born-digital PDFs with text layer
* mixed PDFs containing both image-only and text-backed pages

## 4.2 Supported Musical Use Cases

* band parts
* orchestral parts
* chamber music packets
* wind ensemble parts
* jazz ensemble packets
* conductor score + player-part sets
* common chair naming formats
* common transposition/instrument naming formats

## 4.3 Required Minimum Classification Ability

The system must correctly distinguish, where present:

* conductor score
* full score
* study score
* individual player part
* instrument family
* instrument variant
* chair / desk / part number
* movement or subsection labels when relevant to naming or grouping

---

# 5. Provider Baseline

This acceptance standard assumes the system supports major multimodal / structured-output provider classes that are capable of image or document understanding and schema-constrained output. Official docs currently show support for multimodal input and/or structured outputs across OpenAI, Anthropic, Gemini, and OpenRouter; Gemini also documents document processing workflows. ([OpenAI Platform][1])

The production system **must** support these provider classes as first-class runtime options:

* OpenAI
* Anthropic
* Gemini
* OpenRouter
* local/self-hosted Ollama
* Ollama Cloud
* custom OpenAI-compatible endpoints

For acceptance, provider support means more than “the dropdown exists.” It means:

* configuration works,
* secrets are handled safely,
* connectivity can be verified,
* supported models can be discovered or configured,
* request and response handling are correct,
* structured output validation is enforced,
* fallback behavior is defined,
* provider-specific quirks do not break the ingest pipeline.

---

# 6. Key Definitions

## 6.1 Normal Case

A valid music PDF whose contents are sufficiently legible and structured for the system to determine part boundaries and metadata with confidence above configured thresholds.

## 6.2 Exception Case

A file that is corrupt, ambiguous, unsupported, severely degraded, contradictory, or below confidence thresholds such that autonomous commit would be unsafe.

## 6.3 Autonomous Commit

A successful end-to-end ingest where the system writes final library records and generated part assets without waiting for human approval.

## 6.4 Idempotent Commit

A commit behavior in which retries, duplicate job delivery, or client retry of upload requests do not create harmful duplicate records or duplicate part assets.

## 6.5 Canonical Metadata

Normalized metadata used by the library as the stable source of truth, regardless of how labels appear in the source PDF.

---

# 7. Non-Negotiable Release Principle

The system must prefer:

1. **deterministic parsing first** where reliable,
2. **LLM-assisted interpretation second** where needed,
3. **OCR fallback automatically** where text extraction is insufficient,
4. **second-pass verification automatically** where ambiguity remains,
5. **exception routing instead of unsafe commit** when confidence remains too low.

The system must never silently guess and commit low-confidence results as if they were correct.

---

# 8. Definition of Done

Smart Upload is **Done** only when all of the following are true:

1. Ordinary valid uploads complete end-to-end with no human intervention.
2. Each intended part becomes the correct individual PDF.
3. Work-level and part-level metadata are normalized and saved properly.
4. DB records are correct, linked, and transactionally safe.
5. Retries do not create duplicates.
6. Worker crashes and provider failures are survivable or fail cleanly.
7. OCR and second-pass flows are automatic and policy-driven.
8. Exception cases are routed visibly and safely.
9. Status, logs, metrics, and audit trails are truthful.
10. End-to-end tests prove the autonomous path works.

If any one of these is false, the system is **not done**.

---

# 9. Functional Acceptance Criteria

# 9.1 Intake and Upload Acceptance

## 9.1.1 Upload Security

The upload endpoint must:

* require authentication,
* require correct upload permission,
* enforce CSRF where applicable,
* enforce rate limiting,
* reject unsupported content types,
* validate magic bytes,
* reject malformed or truncated PDFs,
* reject files above configured size limits,
* reject files above configured page-count policy where applicable,
* return stable machine-readable errors for rejected requests.

## 9.1.2 Durable Intake

Before queueing background work, the system must:

* store the original uploaded file durably,
* create exactly one upload session,
* bind the session to the authenticated actor,
* persist enough metadata to resume or audit later,
* generate a stable upload/session identifier,
* record original filename and upload timestamp,
* record source storage key,
* enqueue the first processing job only after durable session creation succeeds.

## 9.1.3 Idempotent Client Retry

If the client retries the upload request because of timeout, refresh, or network interruption:

* the system must not create duplicate committed library records,
* the system must not lose the original session linkage,
* duplicate detection policy must either:

  * resume the same session,
  * reject as duplicate,
  * or create a separately traceable new session with no harmful duplicate commit risk.

---

# 9.2 Queue and Orchestration Acceptance

## 9.2.1 Deterministic Job Ownership

For every job type:

* there must be one canonical job definition,
* the queue name must be known,
* the worker owner must be known,
* the worker must either:

  * handle every job type on the queue,
  * or separate job types by queue.

No accepted design may allow a worker to consume a job it cannot process correctly.

## 9.2.2 Required Job Types

At minimum, the orchestration layer must support:

* upload processing
* OCR fallback processing
* second-pass verification
* autonomous commit
* cleanup
* retry / repair-safe replay where designed

## 9.2.3 Retry Policy

Each job type must define:

* retryable failure classes,
* terminal failure classes,
* max retry count,
* backoff behavior,
* idempotency requirements,
* progress reporting expectations.

## 9.2.4 Job Truthfulness

A job may be marked complete only if its intended side effects were successfully performed and validated.

A job may not be treated as successful simply because no exception was thrown.

---

# 9.3 Processing Pipeline Acceptance

## 9.3.1 Stage A — Session Load

The processing worker must:

* load the session successfully,
* verify original storage object existence,
* verify session is in a processable state,
* prevent illegal duplicate processing where needed,
* record processing start time.

## 9.3.2 Stage B — PDF Analysis

The system must:

* inspect the original PDF,
* count pages correctly,
* detect text-layer presence,
* render page images as needed,
* extract per-page text where available,
* generate header crops or similar page-region signals where configured,
* persist enough intermediate data to support verification and debugging.

## 9.3.3 Stage C — Extraction Strategy Selection

The system must choose the correct strategy automatically:

* text-first when text layer is strong,
* OCR-enabled when text layer is absent or weak,
* vision-assisted when page semantics require image understanding,
* second-pass verification when first-pass confidence is below threshold,
* exception routing when safe automation is not possible.

The system must not require a human to decide which path to run in ordinary cases.

## 9.3.4 Stage D — Structured Understanding

The system must produce structured outputs that include, where derivable:

### Work-level

* title
* composer
* arranger
* publisher or source collection if present
* movement/work grouping if relevant
* whether the packet contains score, parts, or both
* confidence
* warnings
* extraction provenance

### Part-level

* instrument label
* canonical instrument
* instrument family
* transposition where relevant
* chair / part number
* whether the page group is a score or playable part
* page start
* page end
* display name
* normalized filename stem
* confidence
* extraction provenance

## 9.3.5 Structured Output Validity

Any LLM-produced structured result must:

* conform to a schema,
* be validated before use,
* be rejected or repaired if malformed,
* never be committed directly without validation,
* never be trusted solely because the provider returned HTTP 200.

---

# 9.4 Segmentation and Boundary Acceptance

## 9.4.1 Boundary Determination

The system must determine part boundaries using:

* deterministic rules where possible,
* text-layer signals where possible,
* OCR signals where needed,
* vision/header reasoning where needed,
* second-pass verification where ambiguity remains.

## 9.4.2 Boundary Validity Rules

Final cutting instructions must satisfy all of the following:

* every page belongs to either:

  * a defined part,
  * a defined score,
  * or an explicit leftover/unclassified state,
* no out-of-range page numbers,
* no negative indexes,
* no impossible page overlaps unless explicitly intended,
* no silent page loss,
* no unsignaled gap between classified pages where policy forbids it.

## 9.4.3 Multi-Part Packet Handling

The system must correctly handle:

* single part followed by another part,
* score followed by parts,
* parts followed by score,
* repeated instrument names,
* multiple chairs of same instrument,
* page-turn continuation without repeated title,
* cover sheets,
* blank separator pages,
* page number resets inside a combined packet,
* packets that include duplicates for rehearsal or replacement.

---

# 9.5 PDF Split Acceptance

## 9.5.1 Output Generation

For every accepted final boundary group, the system must:

* generate an individual PDF,
* verify it opens correctly,
* verify it contains at least one page,
* verify its page range matches the final instructions,
* upload it to storage,
* capture the resulting storage key,
* associate the generated asset with the session.

## 9.5.2 Output Naming

Every generated output file must have:

* deterministic naming,
* canonical instrument naming,
* canonical chair naming,
* valid filesystem-safe slug,
* stable extension,
* no disallowed characters,
* no ambiguous placeholder names in accepted autonomous commits.

## 9.5.3 Output Integrity

The system is not accepted if it can produce part PDFs that:

* are empty,
* contain the wrong pages,
* contain pages from the wrong part,
* are mislabeled as the wrong instrument,
* omit required pages,
* duplicate unintended pages,
* or cannot be opened by standard PDF readers.

---

# 9.6 Metadata Normalization Acceptance

## 9.6.1 Canonical Instrument Mapping

The system must normalize equivalent labels to a canonical form.

Examples of equivalence classes that must normalize consistently include, where relevant:

* Bb Clarinet / B♭ Clarinet / Clarinet in Bb / Clarinet in B-flat
* 1st Clarinet / First Clarinet / Clarinet 1 / Clarinet I
* Bass Clarinet / B. Cl. / Bs. Cl. where confidence supports the mapping
* Conductor / Full Score / Score where correct context supports the mapping

## 9.6.2 Required Normalization Rules

The normalization layer must address:

* unicode variants
* accidental notation variants
* roman numeral vs arabic numeral chair labels
* abbreviations
* punctuation variants
* whitespace noise
* capitalization noise
* common OCR substitutions
* common publisher formatting differences

## 9.6.3 Provenance Preservation

The system must preserve both:

* normalized value,
* raw extracted value,

for later troubleshooting or model improvement where useful.

---

# 9.7 Duplicate Detection Acceptance

## 9.7.1 Session-Level Duplicate Safety

The system must not create harmful duplicate results if:

* the client retries,
* the worker retries,
* the queue redelivers,
* the process restarts mid-commit,
* the same original file is uploaded again accidentally.

## 9.7.2 Library-Level Duplicate Policy

The system must define and enforce policy for:

* same original PDF uploaded twice,
* same work uploaded from slightly different filenames,
* same part names inside the same upload,
* same piece with revised metadata,
* same storage object referenced by retried commit,
* conflicting existing records in the library.

## 9.7.3 Required Behavior

For each duplicate class, the system must do one of the following explicitly:

* merge safely,
* reject safely,
* version safely,
* create a new distinct entity safely,
* or route to exception handling.

Silent duplicate pollution is not acceptable.

---

# 9.8 Autonomous Commit Acceptance

## 9.8.1 Commit Preconditions

The system may auto-commit only when all commit preconditions pass, including:

* session exists,
* original file exists,
* generated part assets exist,
* final structured metadata is valid,
* confidence thresholds are met,
* no unresolved validation errors remain,
* duplicate policy outcome is resolved,
* session is in a commit-eligible state.

## 9.8.2 Transactionality

Commit must be transactional across the DB operations that define library truth. If the transaction fails:

* no partial library state may remain,
* session must reflect failure or retry state truthfully,
* generated storage assets may remain temporarily only if cleanup policy and traceability are preserved.

## 9.8.3 Idempotency

If commit is retried:

* no duplicate music-piece records,
* no duplicate part rows,
* no duplicate file rows,
* no duplicate linkage rows,
* no session corruption.

## 9.8.4 Post-Commit

After successful commit, the system must:

* mark session completed,
* link all created records,
* persist final confidence and provenance as designed,
* record audit events,
* clean temporary artifacts according to policy,
* preserve enough state to support support/debugging.

---

# 9.9 Exception Workflow Acceptance

## 9.9.1 Exception Triggers

The system must route to exception handling when any of the following occurs:

* corrupt or unreadable PDF,
* storage fetch failure,
* OCR failure with no safe fallback,
* provider failure with no safe retry path,
* schema-invalid LLM output after repair attempts,
* contradictory boundary outputs,
* confidence below threshold,
* ambiguous part naming,
* impossible page grouping,
* duplicate conflict unresolved,
* commit preconditions fail,
* commit transaction fails repeatedly,
* output asset validation fails.

## 9.9.2 Exception State Requirements

An exception session must have:

* stable state,
* readable summary,
* machine-readable error code,
* failure stage,
* retryability flag,
* audit trail,
* visibility in admin monitoring.

## 9.9.3 Safety Rule

Exception sessions must **not** be auto-committed.

---

# 10. Provider-Specific Acceptance Criteria

# 10.1 Common Provider Criteria

Every provider integration must satisfy all of the following:

* provider value is supported in schema,
* config loader reads it correctly,
* admin UI can select and save it,
* secret handling is correct,
* connection test works,
* model discovery works or explicit model configuration is supported,
* structured-output path is defined,
* image/document input path is defined,
* timeout/retry behavior is defined,
* malformed output handling is defined,
* provider-specific parameter schema is defined,
* logging redacts secrets,
* capability mismatch is surfaced clearly.

---

# 10.2 OpenAI Acceptance

OpenAI support is accepted only if the system can:

* validate OpenAI configuration,
* discover or accept vision-capable models,
* send image-aware requests correctly,
* receive structured outputs safely,
* handle model-specific parameter support safely,
* distinguish auth failures, endpoint failures, and malformed output failures clearly. Official OpenAI docs show vision/image input and structured-output capabilities in the current API docs. ([OpenAI Platform][1])

---

# 10.3 Anthropic Acceptance

Anthropic support is accepted only if the system can:

* validate Anthropic keys and endpoint behavior,
* send image-aware requests correctly,
* handle Anthropic-specific headers and request formatting,
* validate structured outputs or strict schema-constrained responses where used,
* handle provider-specific error semantics cleanly. Anthropic documents image understanding and recommends structured outputs when guaranteed JSON conformance is needed. ([Claude API Docs][2])

---

# 10.4 Gemini Acceptance

Gemini support is accepted only if the system can:

* process image inputs,
* support structured output validation,
* support document-oriented workflows for PDF reasoning where used,
* distinguish model classes and preview limitations safely,
* avoid relying on unsupported parameter combinations. Google documents image input, structured outputs, and document processing for Gemini. ([Google AI for Developers][3])

---

# 10.5 OpenRouter Acceptance

OpenRouter support is accepted only if the system can:

* validate OpenRouter auth and endpoint routing,
* discover or accept compatible multimodal models,
* distinguish between router-layer issues and upstream model/provider issues,
* enforce structured-output validation,
* detect unsupported features on specific routed models safely. OpenRouter documents multimodal input and structured outputs for compatible models. ([OpenRouter][4])

---

# 10.6 Ollama / Ollama Cloud Acceptance

Ollama-class support is accepted only if the system can:

* connect to local or cloud endpoints,
* discover installed or available models where supported,
* distinguish native endpoint behavior from OpenAI-compatible behavior where applicable,
* avoid assuming unsupported JSON/vision capabilities,
* handle local model availability failures,
* degrade gracefully when model capacity is insufficient.

---

# 10.7 Custom OpenAI-Compatible Endpoint Acceptance

Custom provider support is accepted only if the system can:

* validate endpoint URL,
* validate auth mode,
* test a compatible health/model endpoint,
* document required API contract,
* fail safely when the endpoint is not truly OpenAI-compatible,
* apply strict schema validation before using returned structured data.

---

# 11. OCR Acceptance Criteria

# 11.1 Automatic OCR Invocation

OCR must run automatically when any of the following is true:

* text layer is absent,
* text layer coverage is below threshold,
* header extraction coverage is below threshold,
* confidence in segmentation is below threshold,
* image-only or scan-heavy PDF is detected,
* text is clearly corrupted or unusable.

## 11.2 OCR Integration

OCR output must feed back into the same Smart Upload session and be reusable by:

* metadata extraction,
* part-boundary detection,
* second-pass verification,
* exception diagnostics.

## 11.3 OCR Quality Safeguards

OCR must support:

* page-level confidence where available,
* partial-page/header-region OCR where configured,
* retry or alternative mode where policy allows,
* failure classification.

## 11.4 OCR Non-Acceptance Conditions

The system is not accepted if OCR exists but:

* is not automatically triggered,
* is not integrated into main pipeline decisions,
* requires a human to initiate it for normal scanned PDFs,
* or cannot influence final segmentation outcomes.

---

# 12. State Model Acceptance Criteria

A single canonical state model must be enforced across DB, API, workers, UI, and tests.

## 12.1 Required State Families

At minimum:

### Session Lifecycle

* uploaded
* queued
* processing
* awaiting_ocr
* awaiting_second_pass
* ready_to_commit
* committing
* completed
* needs_review
* failed
* rejected

### OCR Lifecycle

* not_needed
* queued
* processing
* completed
* failed

### Second-Pass Lifecycle

* not_needed
* queued
* processing
* completed
* failed

### Commit Lifecycle

* not_started
* queued
* processing
* completed
* failed

## 12.2 State Integrity Requirements

* all written states must be valid,
* all transitions must be legal,
* impossible combinations must be blocked,
* null vs enum-value drift is not allowed,
* UI labels must derive from canonical states,
* API responses must not invent alternate spellings.

The system is not accepted if multiple parts of the system represent the same state differently.

---

# 13. Security Acceptance Criteria

# 13.1 Auth and Permissions

All Smart Upload routes must enforce the correct current permission model consistently.

Acceptance fails if:

* any route uses legacy permission names that no longer align with current policy,
* preview or review endpoints are weaker than upload endpoints,
* session ownership or admin privileges are inconsistently enforced.

# 13.2 Secret Handling

The system must:

* store provider secrets safely,
* mask secrets in UI,
* preserve secrets correctly during partial settings updates,
* never return full secrets to client,
* never log secrets,
* separate provider-specific keys correctly.

# 13.3 Storage Safety

The system must:

* validate requested preview assets,
* prevent arbitrary file access,
* prevent path traversal or storage-key abuse,
* bind previews to session-scoped allowed assets,
* use signed URLs or equivalent controls correctly.

# 13.4 Input Safety

The system must:

* reject unsafe file types,
* reject malformed PDF payloads,
* protect against oversized inputs,
* enforce content validation before expensive processing,
* enforce rate limiting on expensive routes.

---

# 14. Observability Acceptance Criteria

# 14.1 Logging

The system must emit structured logs for:

* upload accepted
* session created
* job enqueued
* processing started
* OCR triggered
* second pass triggered
* segmentation produced
* part PDFs generated
* commit started
* commit completed
* exception triggered
* failure details
* cleanup completed

## 14.2 Correlation

Every log, progress event, and audit event must be correlatable by:

* session ID
* job ID
* actor ID where relevant
* timestamp
* stage

## 14.3 Metrics

Production acceptance requires metrics for:

* upload volume
* success rate
* exception rate
* OCR trigger rate
* second-pass trigger rate
* auto-commit rate
* average processing duration
* average pages per upload
* duplicate detection count
* provider failure count
* commit retry count

## 14.4 Audit

The system must record auditable events for:

* accepted upload
* provider selection/config use where appropriate
* autonomous commit
* exception routing
* manual review actions
* rejection
* cleanup

---

# 15. Performance and Capacity Acceptance Criteria

# 15.1 Route Behavior

The upload route must return promptly after durable intake and enqueue. It must not block on full processing.

# 15.2 Worker Behavior

Workers must:

* operate within defined memory limits,
* define timeouts,
* define concurrency,
* avoid unbounded PDF rendering,
* avoid unbounded OCR fan-out,
* avoid queue starvation.

# 15.3 Practical Performance Standard

The team must define environment-specific SLOs before production release, including:

* maximum accepted file size,
* maximum accepted page count,
* target P50 and P95 processing time,
* target success rate for normal uploads,
* retry rate thresholds,
* queue depth alert thresholds.

The system is not accepted if performance is unknown or unmanaged.

---

# 16. Admin and Operations Acceptance Criteria

The admin UI is accepted only as a **monitoring and exception tool**, not as required glue.

## 16.1 Upload UI

Must:

* submit files successfully,
* show truthful session status,
* show progress,
* show final outcome,
* surface machine-readable errors in human-usable form.

## 16.2 Review UI

Must:

* show exception sessions,
* support safe manual actions,
* never be required for ordinary successful uploads,
* display previews safely,
* show provenance and confidence.

## 16.3 Settings UI

Must:

* reflect current runtime truth,
* support provider switching safely,
* preserve masked secrets correctly,
* test provider connection correctly,
* show capability limitations clearly.

---

# 17. Edge-Case Acceptance Matrix

The system must be tested and accepted against the following edge-case families.

# 17.1 File and Transport Edge Cases

* zero-byte file
* truncated upload
* network interruption during upload
* duplicate client submission
* unsupported MIME type
* renamed non-PDF file with `.pdf`
* encrypted PDF
* corrupted PDF xref table
* extremely large PDF
* excessive page count
* file stored successfully but queue enqueue fails
* queue enqueue succeeds but client response is lost

# 17.2 Content Structure Edge Cases

* cover page before parts
* score first, then parts
* parts first, then score
* blank separator pages
* duplicate cover sheets
* repeated headers on every page
* no repeated headers after first page
* mixed orientation pages
* scanned pages mixed with digital pages
* pages with cropped or missing margins
* dark or low-contrast scans
* skewed scans
* handwritten markings
* stamps / library markings
* publisher watermarks
* rotated pages
* duplex scan artifacts
* missing page numbers
* repeated page numbers
* movement changes inside one packet
* instrument changes mid-packet
* multiple copies of same part for stands
* percussion packets with multiple instruments
* piano/conductor reduction pages mixed with player parts

# 17.3 Metadata Ambiguity Edge Cases

* title on cover only
* title split across lines
* composer missing
* arranger present but composer absent
* ambiguous abbreviations
* OCR confusion between numerals and letters
* clarinet chair labels as roman numerals
* transposition embedded in subtitle
* inconsistent instrument label across pages
* score mislabeled as part by raw text
* same part name appearing twice with different page ranges

# 17.4 Provider and Model Edge Cases

* invalid API key
* expired API key
* endpoint timeout
* model not found
* provider returns 200 with malformed JSON
* provider returns partial structured output
* provider supports images but not strict schema
* provider supports schema but chosen model does not
* provider rate limit
* provider intermittent 5xx
* model downgraded or deprecated
* local model missing vision capability
* OpenAI-compatible endpoint that is not actually compatible
* router provider returns upstream capability mismatch

# 17.5 Queue and Worker Edge Cases

* job delivered twice
* worker crash mid-render
* worker crash after split but before commit
* worker crash after commit but before status update
* queue backlog
* queue event stream interruption
* wrong worker consumes wrong job
* retry during partial artifact presence
* dead-letter overflow or silent failure

# 17.6 Storage and DB Edge Cases

* original upload stored but later unavailable
* part PDF upload failure
* signed URL generation failure
* DB transaction deadlock
* unique-constraint collision on commit
* existing library record conflict
* cleanup failure after successful commit
* orphaned storage assets after failed commit
* DB success but event publication failure
* storage success but DB rollback

The system is not accepted unless each edge-case family has an explicit expected outcome and test coverage commensurate with its risk.

---

# 18. Testing Exit Criteria

# 18.1 Unit Tests Required

Must cover at minimum:

* settings schema validation
* provider-to-secret mapping
* provider-to-endpoint mapping
* state transition validation
* metadata normalization
* filename generation
* boundary validation
* duplicate detection logic
* commit precondition checks

# 18.2 Integration Tests Required

Must cover at minimum:

* upload route acceptance/rejection
* settings save/load/masked secret preservation
* provider connection test route
* model discovery route
* worker processing flow
* OCR orchestration
* second-pass orchestration
* commit transaction behavior
* preview safety
* exception routing

# 18.3 End-to-End Tests Required

Must include at minimum:

## E2E-01 Happy Path, Text-Layer PDF

* upload succeeds
* processing completes
* boundaries are correct
* part PDFs are generated
* metadata is normalized
* auto-commit completes
* DB rows are correct
* assets are linked
* session ends completed

## E2E-02 Happy Path, Scanned PDF Requiring OCR

* OCR triggers automatically
* OCR output influences boundary detection
* part PDFs are correct
* metadata is acceptable
* auto-commit completes safely

## E2E-03 Ambiguous Packet Requiring Second Pass

* second pass triggers automatically
* second pass either resolves safely or routes to exception
* no unsafe auto-commit occurs

## E2E-04 Provider Failure

* failure is classified
* retry occurs if configured
* terminal state is visible if retries exhausted
* no partial commit corruption

## E2E-05 Duplicate/Retry Safety

* upload retry or job retry does not create duplicate records or assets

## E2E-06 Crash Recovery

* worker restart or crash mid-pipeline does not corrupt final state

## E2E-07 Existing Library Conflict

* duplicate policy is enforced safely
* no silent pollution occurs

No production release is accepted without end-to-end autonomous ingest proof.

---

# 19. Production Readiness Gate

The system may be released to production only when all of the following are true:

## 19.1 Functional Gate

Normal uploads complete autonomously.

## 19.2 Data Gate

Outputs are normalized, linked, and correct.

## 19.3 Safety Gate

No lost-job, unsafe-commit, or duplicate-commit defect remains open.

## 19.4 Security Gate

Permissions, secrets, file access, and route protections are correct.

## 19.5 Reliability Gate

Retries, failures, and crash recovery behave safely.

## 19.6 Observability Gate

Operators can diagnose failures without reading raw unstructured logs only.

## 19.7 Testing Gate

Unit, integration, and required end-to-end tests pass.

## 19.8 Operational Gate

Deployment wiring, workers, queues, storage, migrations, and seed/config behavior are aligned with runtime.

If any one gate fails, release must be blocked.

---

# 20. Explicit Non-Acceptance Conditions

Smart Upload must be considered **not accepted** if any of the following remain true:

* ordinary uploads still require manual approval,
* OCR exists but is not automatically orchestrated,
* queue routing can lose or skip jobs,
* worker retries can duplicate records or files,
* state values drift across DB/API/UI/workers,
* provider support is inconsistent across schema/UI/runtime,
* metadata normalization is inconsistent,
* part PDFs cannot be trusted without routine human checking,
* commit is not transactionally safe,
* failure modes are not visible,
* duplicate policy is undefined,
* end-to-end autonomous tests do not exist.

---

# 21. Final Acceptance Statement

Smart Upload is accepted only when it functions as a **complete, automated enterprise workflow** for music-library digitization:

* secure,
* autonomous in ordinary cases,
* exception-safe in ambiguous cases,
* provider-flexible,
* schema-validated,
* idempotent,
* observable,
* transactionally correct,
* operationally supportable,
* and proven by end-to-end tests.

Anything less is not “done”; it is only a partial implementation.