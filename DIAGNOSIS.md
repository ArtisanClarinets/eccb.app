I reviewed the latest codebase plus your CLI log. The good news: we’ve already implemented a *lot* of the “right” architecture (PDF rendering + header crops, deterministic segmentation, provider discovery endpoint, runtime config loader, commit service, auto-commit job). The bad news: the log shows **three hard blockers** that will keep Smart Upload from working with OpenRouter/Gemini reliably until they’re fixed.

Below is:

1. what your log is *actually* telling us (root causes), and
2. a **complete file-by-file checklist** of what to modify/create to finish Smart Upload end-to-end.

---

## 1) What the CLI log is telling us (root causes)

### A) OpenRouter: `401 Unauthorized — Missing Authentication header`

You are making OpenRouter calls without a valid `Authorization: Bearer <key>` header.

In your codebase, this is happening because **masked/placeholder secret values are being sent back to the server and saved**, especially `__UNSET__` / `__CLEAR__`. Those values are *truthy*, so the OpenRouter adapter builds a request, but the key is invalid → OpenRouter responds like there’s no auth.

**Fix:** stop ever writing `__UNSET__`, `__SET__`, `__CLEAR__` into DB; treat them as UI-only placeholders.

---

### B) Gemini: `404 Not Found`

This one is extremely clear from your current code:

* `/api/admin/uploads/models` returns Gemini model IDs like:
  `models/gemini-2.5-flash`
* Your Gemini adapter calls:
  `POST {baseUrl}/models/${model}:generateContent`
* So it becomes:
  `.../models/models/gemini-2.5-flash:generateContent` → **404**

**Fix:** normalize Gemini model IDs to **strip the `models/` prefix** everywhere (models API, settings save, runtime, adapter).

---

### C) `Unknown job type: smartupload.process`

You have **two BullMQ workers listening on the same `SMART_UPLOAD` queue**:

* `smart-upload-processor-worker.ts` handles `smartupload.process` + `smartupload.autoCommit`
* `smart-upload-worker.ts` handles only `smartupload.secondPass`

So sometimes the second-pass worker grabs a `smartupload.process` job and throws:
`Unknown job type: smartupload.process`

**Fix:** either (1) merge into a single worker router for all smart upload job names, or (2) split into two different queues.

---

## 2) Complete file-by-file guide to finish Smart Upload

I’m listing every file that must be changed/added to resolve the blockers above **and** finish the “nearly autonomous” pipeline.

---

# A) Settings + Secrets (this is the #1 blocker for OpenRouter)

### ✅ Modify: `src/app/api/admin/uploads/settings/route.ts`

**Goal:** never return/store `__UNSET__`/`__CLEAR__` as real keys.

**Update GET masking behavior**

* For secret keys:

  * If DB has a real value → return `"__SET__"`
  * If DB is empty → return `""` (NOT `"__UNSET__"`)

Right now you do:

```ts
value: setting.value ? '__SET__' : '__UNSET__'
```

Change it to:

* `__SET__` when set
* `''` when unset

**Update PUT behavior**

* If incoming value is:

  * `"__SET__"` → do not modify DB value
  * `""` → do not modify DB value unless user explicitly cleared
  * `"__CLEAR__"` → **write empty string** to DB (real clear)

---

### ✅ Modify: `src/lib/smart-upload/schema.ts`

**Goal:** make server-side merge logic safe even if UI sends placeholders.

In `mergeSettingsPreservingSecrets()`:

* Treat these values as “do not overwrite”:

  * `__SET__`
  * `__UNSET__`  ← add this
  * `***`, `******` (already)
* Treat this as “clear the secret”:

  * `__CLEAR__` → set to `''`

In `maskSecrets()`:

* Stop producing `__UNSET__` entirely; return `''` for unset.

This single change prevents OpenRouter keys from ever becoming `"__UNSET__"` in the DB.

---

### ✅ Modify: `src/components/admin/music/smart-upload-settings-form.tsx`

**Goal:** the UI must never send placeholder values as if they were real secrets.

**Fix default values**
Right now you do:

```ts
llm_openrouter_api_key: settings['llm_openrouter_api_key'] || ''
```

If settings returns `"__UNSET__"` you end up posting it back. After the server change above, you’ll get `''`, which is safe.

**Fix SecretInput**

* If value is `"__SET__"`: show “Key is set” state (already)
* If value is `""`: show empty password input
* If value is `"__UNSET__"` (legacy DB contamination): treat it as `""` and warn in UI (optional)

**Fix submit normalization**
Before building `settingsToUpdate`, normalize secrets:

* If secret value is `"__SET__"` → omit from payload (best), OR leave it and rely on server merge.
* If secret value is `"__CLEAR__"` → send as `"__CLEAR__"` (server translates to empty)
* If secret value is `""` → omit (so you don’t accidentally wipe a key)

---

### ✅ Modify: `src/lib/llm/config-loader.ts`

**Goal:** protect runtime even if DB already contains poison values.

When reading secrets from DB, sanitize:

* If value starts with `"__"` → treat as empty `''`

This prevents accidental “Bearer **UNSET**”.

---

### ✅ Add (recommended): `scripts/fix-llm-secrets.ts`

**Goal:** cleanup existing DB damage once and forever.

One-time migration script that:

* replaces `__UNSET__` / `__CLEAR__` with `''` for all llm_*_api_key keys

---

# B) Gemini 404 fix (model ID normalization)

### ✅ Modify: `src/app/api/admin/uploads/models/route.ts`

**Fix `fetchGeminiModels()`**
Right now:

* `id = model.name` (ex: `models/gemini-2.5-flash`)
  Change to:
* `id = model.name.replace(/^models\//, '')` (ex: `gemini-2.5-flash`)
* `name` can remain pretty or same as `id`

Also update your Gemini price table keys:

* currently `GEMINI_PRICES` uses `models/...` keys
* either change those keys to stripped form, or look up both forms.

This prevents you from ever saving `models/...` into settings again.

---

### ✅ Modify: `src/lib/llm/gemini.ts`

**Hardening:** allow either style anyway (defense-in-depth).
Before building URL:

* `const normalizedModel = model.replace(/^models\//, '')`

Then call:

* `POST {baseUrl}/models/${normalizedModel}:generateContent`

This alone fixes the 404s you’re seeing.

---

### ✅ Modify: `src/app/api/admin/uploads/settings/test/route.ts`

Normalize model the same way before calling Gemini.

---

### ✅ Add (recommended): `scripts/fix-gemini-model-ids.ts`

One-time migration for DB:

* if `llm_vision_model` or `llm_verification_model` begins with `models/` and provider is gemini → strip it.

---

# C) BullMQ “Unknown job type” fix (queue/worker topology)

### ✅ Modify: `src/workers/smart-upload-worker.ts`

### ✅ Modify: `src/workers/smart-upload-processor-worker.ts`

### ✅ Modify: `src/workers/index.ts`

You must stop running two workers on the same queue with partial handlers.

**Best fix (recommended): merge into one worker router**
Create a single Smart Upload worker that routes:

* `smartupload.process` → `processSmartUpload(job)`
* `smartupload.secondPass` → `runSecondPass(job)`
* `smartupload.autoCommit` → `commitSmartUploadSessionToLibrary(...)`

Implementation options:

1. Move the second-pass logic into `smart-upload-processor-worker.ts` and delete `smart-upload-worker.ts`, OR
2. Keep both files but only start **one** of them, OR
3. Keep both but make both route *all* names (redundant but safe)

Then in `src/workers/index.ts` start only the unified worker.

---



# D) PDF Rendering failures (your log is hiding the real error)

### ✅ Modify: `src/lib/services/pdf-renderer.ts`

Right now you log:

```ts
logger.warn(..., { idx, err })
```

…but `err` stringifies to `{}` in your logger, so you can’t see the real reason.

Change both render batch catch blocks to:

```ts
const message = err instanceof Error ? err.message : String(err);
logger.warn('...', { idx, error: message });
```

**Also add a retry strategy per page**
For pages that fail:

* retry with `scale: 1` and/or `maxWidth: 800`
* retry with `format: 'jpeg'` (sometimes pdfjs/canvas memory behaves better)

**Add render stats**
Return alongside images:

* `failedPages: number[]`
* `placeholderCount`

Then in the worker, if placeholder ratio is too high, skip “send 67 images to header-label LLM”.

---

# E) Header-label segmentation batching (you can’t send 67 images)

### ✅ Modify: `src/workers/smart-upload-processor.ts`

Right now you do a single header-label LLM call with `imageCount=67`.

That will fail or be extremely unreliable across providers even when auth works.

**Fix: batch it**

* Batch size: 6–10 images per call (depending on provider)
* For each batch:

  * build a prompt containing only those `Page N` labels
  * parse the returned JSON array
  * append into a global `pageHeaders[]`

**Also: only OCR pages you need**
Use `extractPdfPageHeaders()` results:

* If a page already has usable `headerText`, don’t header-OCR it.
* Only render+OCR pages where header text is empty.

That reduces cost and massively improves success rate.

---

# F) Text-layer detection threshold is too strict

### ✅ Modify: `src/lib/services/pdf-text-extractor.ts`

You currently require:

```ts
hasTextLayer = coverage >= 0.6
```

Your log shows `coverage="15%"` and then `hasTextLayer=false`.

For music PDFs, “header-only text” is common; 15% can still be useful.

Change semantics to return:

* `hasAnyText = pagesWithText > 0`
* `hasStrongTextLayer = coverage >= 0.6` (keep if you want)
  …and in the worker:
* attempt deterministic segmentation when `hasAnyText === true`, but weight confidence accordingly.

---

# G) Make provider config “actually autonomous” (finish the promise)

### ✅ Modify: `src/app/api/admin/uploads/providers/discover/route.ts`

Right now it **detects** available providers but doesn’t fully auto-configure.

Upgrade it to optionally return:

* `recommendedProvider`
* `recommendedVisionModel`
* `recommendedVerificationModel`
* `recommendedEndpoint`

And optionally:

* write those into DB settings (if user clicks “Apply”)

---

### ✅ Modify: `src/lib/llm/providers.ts`

Add structured metadata to support:

* “free tier preferred”
* “vision capable”
* default endpoints that are correct for runtime adapters

---

### ✅ Add (recommended): `src/lib/llm/auto-provider.ts`

Implement `provider=auto` resolution:

* prefer Ollama local if reachable + has vision model
* else Gemini (free tier)
* else OpenRouter free model
* else fallback to paid keys if available

Wire into:

* `src/lib/llm/config-loader.ts`

---

# H) Third-pass adjudicator (you added config keys, but not the logic)

### ✅ Modify: `src/workers/smart-upload-worker.ts` (or unified worker)

Add adjudicator pass when:

* second-pass confidence < threshold (ex: <85), OR
* first/second disagree on critical fields (title/composer/instrument mapping), OR
* segmentation confidence is low

Use:

* `llm_adjudicator_model`
* `llm_adjudicator_prompt` (already in settings keys)
* `DEFAULT_ADJUDICATOR_SYSTEM_PROMPT`

Write back:

* adjudicated metadata
* final confidence
* requiresHumanReview flag
* store raw adjudicator output for audit

---

# I) Status + UX finishing (so it feels “automated”)

### ✅ Modify: `src/app/api/files/smart-upload/route.ts`

Right now sessions start as `PENDING_REVIEW`. That’s fine for the DB enum, but it makes UX confusing.

At minimum:

* set `parseStatus = PROCESSING` at creation (string field you already have)
* update it to `PARSED`, `FAILED`, etc.

---

### ✅ Modify: `src/workers/smart-upload-processor.ts`

On failure:

* update session:

  * `parseStatus = FAILED`
  * store failure reason in `secondPassRaw` or add `errorMessage` field (recommended)

---

### ✅ Modify: `src/app/(admin)/admin/uploads/review/page.tsx`

Make the review list filter by:

* `status=PENDING_REVIEW`
* AND `parseStatus != PROCESSING` (so uploads don’t “flash” into review while still running)

---

# J) Ollama Cloud + more providers (if you still want the full provider matrix)

### ✅ Add: `src/lib/llm/ollama-cloud.ts`

Implement:

* list tags: `GET https://ollama.com/api/tags`
* chat: `POST https://ollama.com/api/chat`
* bearer token: `Authorization: Bearer ...`

### ✅ Modify: `src/lib/llm/providers.ts`

Add provider `ollama_cloud` with default endpoint + notes.

### ✅ Modify: `src/lib/smart-upload/schema.ts`

Add `ollama_cloud` to provider enum + api key field.

### ✅ Modify: `src/app/api/admin/uploads/models/route.ts`

Add `fetchOllamaCloudModels()`.

---

## The “do this first” order (to get you unblocked fastest)

1. **Fix secret masking/merging** (`settings/route.ts`, `schema.ts`, `settings-form.tsx`, `config-loader.ts`)
2. **Fix Gemini model ID normalization** (`models/route.ts`, `gemini.ts`, migrate stored values)
3. **Fix BullMQ queue worker conflict** (unify worker router; stop “unknown job type”)
4. **Batch header-label OCR** (never send 67 images; OCR only missing-text pages)
5. Improve PDF rendering diagnostics + retries (so you can actually see why pages fail)

After those 5, OpenRouter + Gemini should both run end-to-end again, and then you can harden autonomy (adjudicator + auto-provider + better segmentation).

---

If you want, I can also produce a **single “patch plan”** that lists exact edits (function-by-function) for the three main blockers (secrets, Gemini IDs, worker routing) so you can implement them with minimal guesswork.
