# Smart Upload Refactor Design

## problem

Smart Upload is currently unreliable and too technical for non-technical admins. The current implementation has several structural issues:

- Settings UX is overexposed and asks users to configure internals (endpoints, JSON params, thresholds) when the intended minimal inputs should be API key + model selection.
- Model selection is inconsistent: the UI still uses free-text model fields, dynamic model loading is incomplete, and provider model discovery is not consistently wired into selection/validation.
- Prompt source-of-truth is fragmented: prompts are editable in settings, but prompt text is still constructed/hardcoded in worker code paths.
- Validation is permissive and key-based rather than schema-driven across API/UI/runtime; invalid combinations can be saved and only fail during background jobs.
- Configuration remains env-fallback heavy for runtime behavior, which creates drift between settings UI, database, and worker execution.
- Review workflow does not clearly expose execution context (provider/model/prompt version used), making debugging and trust difficult.

Target outcome:

- Smart Upload becomes database-driven for feature settings and runtime behavior.
- User setup is reduced to:
  1) choose provider,
  2) enter provider API key,
  3) select a valid provider-returned model from dropdown.
- System auto-selects a recommended default model (newest non-deprecated cheapest model that meets Smart Upload capability constraints).
- System prompts are only sourced from settings fields, editable per pass, resettable to defaults, and persisted in DB.

## findings

### Branch: input_flow

Smart Upload should operate in an auto-first flow. Users should not be required to understand LLM internals. The settings page should default most values and only require credentials + model selection, with a clear recommended model preselected.

### Branch: model_selection

Provider model lists must be fetched live from provider APIs and filtered by Smart Upload capability requirements (vision/multimodal for pass 1, context size floor, non-deprecated, available). Ranking should prefer:

1. capability match,
2. non-deprecated recency,
3. lowest cost,
4. stable tiers over preview/experimental where quality risk is high.

The system should support current project providers end-to-end (ollama, openai, anthropic, gemini, openrouter, custom) and produce a deterministic recommended model for each.

### Branch: prompt_management

Prompt ownership must be centralized in DB-backed settings:

- `llm_vision_system_prompt`
- `llm_verification_system_prompt`

Workers should consume only these settings at runtime. Defaults should be represented as explicit, versioned default constants and written to DB on reset/init, not silently mixed from multiple code paths.

### Branch: validation_wiring

Validation should be strict at API/runtime/storage boundaries and user-friendly in UI:

- strict schema validation when saving settings,
- strict runtime guardrails before LLM execution,
- strict model/provider compatibility checks,
- UI guidance and warnings instead of silent acceptance.

Also required from session feedback: Smart Upload configuration should be DB-driven and API keys must not live in plaintext files for Smart Upload operation.

## recommendation

Implement the refactor in 8 workstreams with clear acceptance criteria.

### 1) Define canonical Smart Upload settings contract

Create a shared Smart Upload config schema module used by:

- `src/app/api/admin/uploads/settings/route.ts`
- `src/components/admin/music/smart-upload-settings-form.tsx`
- `src/lib/llm/config-loader.ts`
- worker preflight validation

Contract principles:

- Required core keys: provider, provider-specific API key, vision model, verification model, two prompts.
- Provider-specific rules (e.g., endpoint required for `custom`, optional for hosted providers).
- Numeric and JSON settings remain advanced but optional.
- Unknown keys rejected for Smart Upload settings writes.

Acceptance:

- A single schema package validates save/read/runtime usage.
- Invalid provider/model/key combos fail fast in API with actionable messages.

### 2) Make settings database-authoritative for Smart Upload

Runtime behavior should resolve from database settings for Smart Upload feature execution.

- Keep env fallbacks only as bootstrap safety, but not as primary operational source.
- Add startup/bootstrap script to seed missing Smart Upload settings into DB.
- Ensure prompt fields are always present in DB (non-null) after first admin save or reset.

Security hardening:

- Keep API keys masked in GET responses.
- Add optional encrypted storage path for keys (preferred using existing `APIKey` model) and deprecate plaintext `SystemSetting` key storage for secrets.

Acceptance:

- Smart Upload workers run correctly with DB-only configured settings.
- No feature logic requires `.env` edits for normal admin operation.

### 3) Refactor settings UI to minimal required inputs

Refactor `src/components/admin/music/smart-upload-settings-form.tsx` UX:

- Primary section only:
  - provider select,
  - provider API key input (only for selected provider),
  - vision model dropdown,
  - verification model dropdown,
  - prompt editors (vision + verification),
  - reset prompts button.
- Advanced section remains collapsible and optional.
- Remove endpoint/model free-text dependence for normal providers.

Model UX:

- On provider or API key change, fetch provider models from `/api/admin/uploads/models`.
- Show loading/error states and provider-specific hints.
- Auto-select recommended model if current selection is missing/invalid.

Acceptance:

- Non-technical admin can configure Smart Upload with only API key + dropdown model selection.
- No manual model string typing required for standard providers.

### 4) Upgrade provider model discovery + recommendation logic

Refactor `src/app/api/admin/uploads/models/route.ts` to return enriched model objects and recommendation metadata.

Add output fields:

- `isDeprecated`
- `supportsVision`
- `supportsStructuredOutput`
- `contextWindow`
- `priceInputPer1M` / normalized cost metric
- `releaseDate` or recency proxy
- `recommended: boolean`
- `recommendationReason`

Selection algorithm:

1. Filter to models that satisfy pass requirements (vision for pass 1, context floor).
2. Exclude deprecated/unavailable.
3. Score by capability fitness + recency + price.
4. Pick lowest-cost model above quality floor as recommended.

Provider notes:

- OpenAI/OpenRouter/Gemini/Ollama: live list APIs.
- Anthropic: maintain curated current list and metadata file with versioning timestamp.
- Custom: list endpoint if available; fallback manual list disabled with explicit warning.

Acceptance:

- API returns only valid selectable models per provider and marks one as recommended.

### 5) Remove hardcoded prompt sources from workers

Refactor:

- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`

Approach:

- Move default prompt templates into a single module (e.g., `src/lib/smart-upload/prompts.ts`) with version constants.
- On load, resolve prompts from DB settings only; if empty, write defaults into settings via explicit reset/init path.
- Build runtime prompts by token interpolation (`{{totalPages}}`, `{{sampledPages}}`) against settings value.
- Remove local hardcoded prompt strings and `_DEFAULT_*` in worker files.

Acceptance:

- All LLM calls use prompt text originating from DB-backed settings fields.
- Reset action restores prompt fields to canonical default values.

### 6) Harden settings API + add reset endpoint behavior

Refactor settings API:

- `GET /api/admin/uploads/settings`: include resolved defaults metadata and prompt version.
- `PUT /api/admin/uploads/settings`: strict schema and provider-aware validation.
- Add `POST /api/admin/uploads/settings/reset-prompts` (or equivalent action in PUT) to reset both prompt fields atomically.

Add model validation path:

- when saving model IDs, verify selected model exists in provider model list (or curated provider list where live list unavailable).

Acceptance:

- Invalid model IDs cannot be saved.
- Reset prompts updates DB and is reflected instantly in UI.

### 7) Persist execution context to improve review/debugging

Update processing persistence so each upload session stores:

- provider used,
- vision model used,
- verification model used,
- prompt hashes or prompt version IDs,
- model params snapshot.

Surface these in review endpoints/UI (`src/app/api/admin/uploads/review/route.ts`, `src/app/(admin)/admin/uploads/review/page.tsx`) so admins can understand what produced each result.

Acceptance:

- Review dialog shows provider/model and pass metadata used per session.
- Failed sessions can be diagnosed without log digging.

### 8) Update docs + migration + test matrix

Documentation updates:

- `docs/SMART_UPLOAD.md`
- replace stale guidance in `SMART_UPLOAD_CONFIG_VERIFICATION.md`, `SMART_UPLOAD_ACTION_PLAN.md`, `SMART_UPLOAD_API_CONFIGURATION.md`

Script updates:

- Repurpose `scripts/update-llm-config.ts` to:
  - sync provider/model metadata (including `https://models.dev/api.json`) into DB cache tables,
  - compute recommendation candidates per provider,
  - avoid writing secrets from plaintext env during normal operation.

Test plan:

- Unit tests for recommendation algorithm and schema validation.
- API tests for settings save, model list, prompt reset.
- Integration tests for first pass + second pass with DB prompts.
- E2E test for settings UX: provider -> key -> model dropdown -> save -> upload -> review.

Acceptance:

- All Smart Upload critical paths pass with deterministic results.
- Docs match actual implementation and admin workflow.

---

## implementation sequencing

1. Shared schema + runtime validation
2. Settings API hardening + prompt reset endpoint
3. UI minimal-input refactor + dynamic model dropdown
4. Worker prompt source unification
5. Model recommendation engine upgrade
6. Review context surfacing
7. Script/data refresh modernization
8. Tests + docs + rollout checklist

## rollout and safety checklist

- Backfill missing prompt settings in DB before deployment.
- Add migration/one-time task to preserve existing keys and masked behavior.
- Feature-flag new recommendation logic for first deploy.
- Monitor: model fetch failure rate, settings save validation errors, upload success rate, second-pass fail rate.
- Provide safe fallback: if model discovery fails, retain last-known-valid DB model and block save of unknown model IDs.
