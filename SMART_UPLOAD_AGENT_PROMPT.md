# Autonomous Coding Agent Prompt — Smart Music Upload System Overhaul
## Project: Emerald Coast Community Band (eccb.app)

---

## MISSION STATEMENT

You are tasked with completely overhauling the Smart Music Upload system in this Next.js 15 (App Router), TypeScript, Tailwind, Prisma/MySQL application. The system uploads sheet music PDFs, uses LLM vision models to extract metadata and generate "cutting instructions" (per-part page ranges), splits the PDFs into individual instrument parts, applies full metadata, and routes them through a human review queue before committing to the music library.

Read this entire prompt before beginning. Implement every section in the order specified. Do **NOT** skip steps. Do **NOT** create documentation markdown files unless explicitly instructed. All changes must be production-quality, type-safe TypeScript, follow the project's code style (`2-space indent, single quotes, trailing commas, 100 char line width`), and use the `cn()` utility from `src/lib/utils.ts` for conditional Tailwind classes.

---

## 0. ORIENTATION — READ THESE FILES FIRST

Before writing a single line of code, read the following files completely to understand the existing implementation:

| File | Purpose |
|------|---------|
| `src/app/(admin)/admin/uploads/page.tsx` | Smart Upload UI (590 lines) |
| `src/app/(admin)/admin/uploads/settings/page.tsx` | Settings page (server component) |
| `src/components/admin/music/smart-upload-settings-form.tsx` | Settings form (735 lines) |
| `src/app/api/files/smart-upload/route.ts` | Main upload API (680 lines) |
| `src/app/(admin)/admin/uploads/review/page.tsx` | Review UI (740 lines) |
| `src/app/api/admin/uploads/review/[id]/approve/route.ts` | Approve + import logic (492 lines) |
| `src/app/api/admin/uploads/review/route.ts` | List review sessions |
| `src/app/api/admin/uploads/review/[id]/preview/route.ts` | PDF preview endpoint |
| `src/app/api/admin/uploads/review/bulk-approve/route.ts` | Bulk approve endpoint |
| `src/app/api/admin/uploads/settings/route.ts` | Settings PUT endpoint |
| `src/app/api/admin/uploads/settings/test/route.ts` | Connection test endpoint |
| `src/lib/services/pdf-renderer.ts` | PDF→image rendering |
| `src/lib/services/pdf-splitter.ts` | PDF page-range splitting |
| `src/lib/services/pdf-part-detector.ts` | LLM part detection |
| `prisma/schema.prisma` | Full DB schema |
| `docs/SMART_UPLOAD.md` | Existing documentation |

Also read `src/lib/auth/permission-constants.ts`, `src/lib/rate-limit.ts`, `src/lib/csrf.ts`, `src/lib/logger.ts`, `src/lib/services/storage.ts`, and `src/lib/db.ts`.

---

## 1. NEW API ROUTE — `/api/admin/uploads/models`

### Purpose
Allow the settings form to dynamically query the configured LLM provider for a list of available models. Returns models sorted cheapest-first (ascending by price per token where available; otherwise alphabetical).

### File to Create
`src/app/api/admin/uploads/models/route.ts`

### Behaviour

**`GET /api/admin/uploads/models?provider=<provider>&apiKey=<key>&endpoint=<url>`**

- Requires valid session + `SYSTEM_CONFIG` permission.
- Accepts query params: `provider` (ollama|openai|anthropic|gemini|openrouter|custom), `apiKey`, `endpoint`.
- For each supported provider, hit the appropriate "list models" endpoint:

  | Provider | Endpoint | Auth |
  |----------|----------|------|
  | `ollama` | `{endpoint}/api/tags` | none |
  | `openai` | `https://api.openai.com/v1/models` | `Authorization: Bearer {apiKey}` |
  | `anthropic` | The Anthropic API does NOT have a public list-models endpoint. Return the hard-coded vision-capable model list: `["claude-opus-4-5", "claude-sonnet-4-5", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"]`. Mark all of them as vision-capable. |
  | `gemini` | `https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}` | query param `key` |
  | `openrouter` | `https://openrouter.ai/api/v1/models` | `Authorization: Bearer {apiKey}` |
  | `custom` | `{endpoint}/models` | `Authorization: Bearer {apiKey}` if key present |

- **Vision-model filtering**: After fetching the model list, filter to models that are known/advertised to support image/vision inputs:
  - `ollama`: include any model whose `name` contains any of: `vision`, `vl`, `llava`, `bakllava`, `moondream`, `cogvlm`, `minicpm-v`, `qwen2-vl`, `qwen2.5-vl`, `gemma3`, `llama3.2-vision`, `mistral`, `phi3-vision`, `internvl`, `pixtral`. If no vision models are identified, return all models with a `WARN: Unable to filter by vision capability` flag in the response.
  - `openai`: include models whose `id` contains any of: `gpt-4o`, `gpt-4-turbo`, `gpt-4-vision`. Use the `openai` npm package if it is already installed; otherwise do a raw `fetch`.
  - `gemini`: include models where `supportedGenerationMethods` includes `generateContent` AND where `name` does NOT contain `embed` or `aqa`. The Gemini list already returns all vision-capable generation models — filter out embedding/AQA models only.
  - `openrouter`: filter models where `architecture.modality` equals `text+image->text` OR where `id` contains `vision` or `vl`. If the field is absent, include all models.
  - `custom`: return all models unfiltered.

- **Sorting**: Sort results cheapest-first using the following logic (in priority order):
  1. If the provider returns pricing data (OpenRouter returns `pricing.prompt` per token — use this), sort ascending by `pricing.prompt` (cheapest first). Models with null/zero price come first (treat as free).
  2. If no pricing data, sort alphabetically by model id/name.
  - For OpenAI, use a hard-coded approximate price table:
    ```
    gpt-4o-mini: 0.00000015
    gpt-4o: 0.0000025
    gpt-4-turbo: 0.00001
    gpt-4-vision-preview: 0.00001
    ```
  - For Gemini, use a hard-coded approximate price table:
    ```
    gemini-2.0-flash: 0.00000010
    gemini-2.5-flash-preview: 0.00000015
    gemini-1.5-flash: 0.00000035
    gemini-2.5-pro-preview: 0.00000125
    gemini-1.5-pro: 0.00000175
    ```

- **Response shape**:
  ```typescript
  {
    models: Array<{
      id: string;          // Model identifier to use in API calls
      name: string;        // Human-readable display name (may equal id)
      isVision: boolean;   // Whether this model supports image input
      pricePerToken: number | null;  // Input price per token in USD, null if unknown
      priceDisplay: string; // e.g., "$0.00025 / 1K tokens" or "Free" or "Unknown"
      providerNote?: string; // e.g., "Rate limit: 15 RPM (Google AI Studio free tier)"
    }>;
    totalCount: number;
    filteredForVision: boolean;
    warning?: string;
  }
  ```

- Add a per-model `providerNote` for known rate limits:
  - Gemini `gemini-1.5-pro` and `gemini-2.5-pro-preview` on free tier: `"Rate limit: 2 RPM (free tier) / 1,000 RPM (paid)"`
  - Gemini `gemini-2.0-flash` and `gemini-2.5-flash-preview` on free tier: `"Rate limit: 15 RPM (free tier) / 4,000 RPM (paid)"`
  - OpenAI Tier 1: `"Rate limit: 500 RPM (Tier 1)"`
  - OpenRouter free models (price === 0): `"Rate limit: 20 RPM (free tier)"`

- Return `400` with `{ error: string }` if provider or endpoint is missing/malformed.
- Return `502` if the upstream provider API call fails, with the upstream error message.
- Wrap everything in try/catch with proper error logging via `logger`.

---

## 2. NEW API ROUTE — `/api/admin/uploads/model-params`

### Purpose
For a given provider + model, return the list of API parameters that the model accepts and that the user is allowed to adjust in the smart upload call. This lets the UI display only valid parameters.

### File to Create
`src/app/api/admin/uploads/model-params/route.ts`

### Behaviour

**`GET /api/admin/uploads/model-params?provider=<provider>&model=<modelId>&apiKey=<key>&endpoint=<url>`**

- Requires valid session + `SYSTEM_CONFIG` permission.
- Per-provider + per-model, return the set of generation parameters the user may adjust. Use hard-coded knowledge (provider API docs). Do NOT attempt to query a "model params" endpoint that doesn't exist.

**Return shape**:
```typescript
{
  params: Array<{
    name: string;          // e.g., "temperature"
    label: string;         // Human-readable label: "Temperature"
    type: 'number' | 'integer' | 'boolean' | 'string' | 'enum';
    min?: number;
    max?: number;
    step?: number;
    default: unknown;
    description: string;
    options?: Array<{ value: string; label: string }>; // for enum type
    apiParamName: string;  // Exact key to pass in the API call body
  }>;
}
```

**Hard-coded parameter sets**:

For ALL OpenAI-compatible providers (openai, openrouter, custom, gemini-via-openai-proxy):
```
temperature: number, 0.0–2.0, step 0.01, default 0.2, description "Controls randomness. Lower = more deterministic."
max_tokens: integer, 256–4096, step 1, default 1024, description "Maximum tokens in the response."
top_p: number, 0.0–1.0, step 0.01, default 1.0, description "Nucleus sampling threshold."
frequency_penalty: number, -2.0–2.0, step 0.01, default 0.0, description "Reduces repetition of token sequences."
presence_penalty: number, -2.0–2.0, step 0.01, default 0.0, description "Reduces repetition of topics."
seed: integer, 0–2147483647, default null (optional), description "Fixed seed for reproducibility."
```

For Anthropic (native `/v1/messages`):
```
temperature: number, 0.0–1.0, step 0.01, default 0.2
max_tokens: integer, 1–4096, step 1, default 1024
top_p: number, 0.0–1.0, step 0.01, default 1.0
top_k: integer, 0–500, step 1, default 40, description "Only sample from top K tokens."
```

For Ollama native:
```
temperature: number, 0.0–2.0, step 0.01, default 0.2
num_predict: integer, -1–4096, step 1, default 256, description "Max tokens to generate. -1 = infinite."
top_k: integer, 0–100, step 1, default 40
top_p: number, 0.0–1.0, step 0.01, default 0.9
repeat_penalty: number, 0.0–2.0, step 0.01, default 1.1, description "Penalise repeated tokens."
num_ctx: integer, 512–131072, step 512, default 4096, description "Context window size (tokens)."
seed: integer, 0–2147483647, default null
```

For Gemini native (`generativelanguage.googleapis.com`):
```
temperature: number, 0.0–2.0, step 0.01, default 0.2
maxOutputTokens: integer, 1–8192, step 1, default 1024
topP: number, 0.0–1.0, step 0.01, default 0.95
topK: integer, 1–64, step 1, default 40
```

- Model-specific overrides:
  - Gemini `gemini-2.5-pro-preview` and `gemini-2.5-flash-preview`: `maxOutputTokens` max is 65536.
  - OpenAI `o1`, `o1-mini`, `o3`, `o3-mini` reasoning models: remove `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`; add `reasoning_effort: enum [low, medium, high], default medium`.

---

## 3. DATABASE MIGRATION — Expanded `SmartUploadSession` + `MusicPart` + `MusicFile`

### 3a. New fields on `SmartUploadSession`

Add these fields to the `SmartUploadSession` Prisma model:

```prisma
parsedParts       Json?     // Array of { storageKey, instrument, section, partName, partNumber, pageStart, pageEnd, fileSize, fileName }
parseStatus       String?   // "NOT_PARSED" | "PARSING" | "PARSED" | "PARSE_FAILED"
secondPassStatus  String?   // "NOT_NEEDED" | "QUEUED" | "IN_PROGRESS" | "COMPLETE" | "FAILED"
secondPassResult  Json?     // Verified metadata from the second pass LLM
autoApproved      Boolean   @default(false)
cuttingInstructions Json?   // Raw cutting instructions JSON from the first-pass LLM
llmProvider       String?   // Which provider was used for this session
llmVisionModel    String?   // Which vision model was used
llmVerifyModel    String?   // Which verification model was used
llmModelParams    Json?     // Which model params were passed (copy of settings at upload time)
tempFiles         Json?     // Array of storageKeys for temp files to purge after commit
firstPassRaw      String?   @db.LongText  // Raw LLM JSON response (for debugging)
secondPassRaw     String?   @db.LongText
```

### 3b. New fields on `MusicPart`

Add these fields to the `MusicPart` Prisma model to enable granular search + filtering:

```prisma
section         String?   // Section label: "Woodwinds" | "Brass" | "Percussion" | "Strings" | "Keyboard" | "Vocals" | "Other"
partNumber      Int?      // Numeric part number within the instrument (e.g., 1 for "1st Clarinet")
partLabel       String?   // Full label like "1st Bb Clarinet", "2nd Bb Clarinet"
transposition   String?   // Transposition key: "Bb", "Eb", "F", "C" etc.
pageCount       Int?      // Number of pages in this part's PDF
storageKey      String?   // Direct storage key for the part PDF (separate from MusicFile.storageKey)
```

### 3c. New fields on `MusicPiece`

Add to `MusicPiece`:
```prisma
ensembleType    String?   // "Concert Band", "Jazz Ensemble", "Orchestra", "Chamber", "Solo", "Other"
keySignature    String?   // e.g., "Bb Major", "G Minor"
timeSignature   String?   // e.g., "4/4", "3/4", "6/8"
tempo           String?   // e.g., "Allegro", "120 BPM"
```

### 3d. New fields on `MusicFile`

Add to `MusicFile`:
```prisma
pageCount       Int?      // Total pages in this PDF
partLabel       String?   // e.g., "1st Bb Clarinet" — populated during smart upload
instrumentName  String?   // Denormalised instrument name for quick display
section         String?   // Denormalised section label
partNumber      Int?      // Denormalised part number
```

### 3e. Generate and apply migration

After modifying `prisma/schema.prisma`, run:
```bash
npx prisma migrate dev --name expand_smart_upload_and_music_parts
```

Then regenerate the Prisma client:
```bash
npx prisma generate
```

---

## 4. SETTINGS FORM OVERHAUL (`src/components/admin/music/smart-upload-settings-form.tsx`)

The settings form must be restructured as a **stepped wizard with 3 discrete steps**:

### Step 1 — API Keys & Provider

Only when the user has entered their API key (or confirmed no key needed for Ollama) should they be able to proceed. The provider selection card stays exactly as-is with the existing conditional fields for each provider. Add a prominent `Next: Select Models →` button that is **disabled** until:
- If provider requires an API key (`requiresApiKey === true`): the relevant key field is non-empty.
- If provider is `ollama`: endpoint field must be a valid URL.
- If provider is `custom`: base URL must be non-empty.

Make the "Step 1" / "Step 2" / "Step 3" indicator a simple numbered step indicator at the top of the card stack (not a full stepper library — use plain Tailwind).

### Step 2 — Model Selection (Dynamic)

When the user reaches Step 2, **automatically trigger a fetch** to `GET /api/admin/uploads/models` with the current provider, API key, and endpoint. Show a loading spinner in the model dropdown while fetching.

Replace the plain `<Input>` for model name with a **`<Select>`** (use existing Radix `Select` component) that is populated dynamically from the API response. Each `<SelectItem>` should display:
- Model ID (bold)
- Price display (right-aligned, muted, e.g. `Free` or `$0.00025/1K`)
- Provider note if present (small text below model ID, e.g. `Rate limit: 15 RPM`)
- A `[Vision]` badge (small green badge) if `isVision === true`

If there is a fetch error, show a red inline error banner with the message and a "Retry" button. Also show a "Can't find your model? Type it manually" toggle that replaces the Select with a plain Input for that field.

Do this for **both** the Vision Model selector and the Verification Model selector. They are independent fetches (same provider, different purpose — present the same model list for both; the user may choose the same or different models).

Sort models cheapest-first exactly as the API returns them (the API already sorts). Do not re-sort on the client.

### Step 2 — Model Parameters (Dynamic, beneath model selectors)

After a model is selected in either dropdown, fire a secondary request to `GET /api/admin/uploads/model-params` for that model, then render the returned parameters as a **collapsible card titled "Model Parameters (Advanced)"** beneath the model cards. Default it to collapsed.

Inside this collapsible, render each parameter from the API response as an appropriate form control:
- `number` → `<Input type="number" min={min} max={max} step={step} />`
- `integer` → `<Input type="number" min={min} max={max} step={step} />`
- `boolean` → `<Switch />`
- `enum` → `<Select>` with the `options` array
- `string` → `<Input type="text" />`

Each control must show:
- The `label` as `<FormLabel>`
- The `description` as `<FormDescription>` with the default value noted: `Default: {default}`
- Min/max shown as `FormDescription` footnote for number/integer types

Store the param values in a `model_vision_params` and `model_verification_params` key in the settings (serialised as JSON string) alongside the existing settings keys. Add these to `SETTING_KEYS` in the settings page server component and the API route's settings handler.

Add `llm_vision_model_params` and `llm_verification_model_params` to the Zod schema as `z.string().optional()` (they store JSON).

### Step 3 — Advanced Prompts

This step contains the existing Advanced → Custom System Prompts collapsible, plus confidence threshold and two-pass settings.

**CRITICAL CHANGE**: For the `llm_vision_system_prompt` textarea:
- Set the `placeholder` prop to the **full text of `DEFAULT_VISION_SYSTEM_PROMPT`** (copy it verbatim from `src/app/api/files/smart-upload/route.ts`).
- Add a `<FormDescription>` that reads:
  > **Guidance:** Your prompt must instruct the LLM to return a single JSON object. The JSON **MUST** include a `cuttingInstructions` array that specifies, for each identified part, its `instrument`, `partName`, `section`, `transposition`, `partNumber` (integer), and `pageRange` (0-indexed `[start, end]` inclusive). It must also include `confidenceScore` (1–100) and all standard metadata fields (`title`, `composer`, `publisher`, `fileType`, `isMultiPart`, `parts`). Avoid injecting content from the PDF directly into this static prompt text — pass it only via the image and user message to prevent prompt injection.

For the `llm_verification_system_prompt` textarea:
- Set the `placeholder` to the **full text of `DEFAULT_VERIFICATION_SYSTEM_PROMPT`** (copy verbatim).
- Add a `<FormDescription>` that reads:
  > **Guidance:** Your verification prompt should instruct the second-pass LLM to: (1) compare the parsed part PDFs (provided as images) against the original full score, (2) confirm instrument labels, part names, and page boundaries are correct, (3) return a corrected JSON with the same `cuttingInstructions` schema, and (4) set `verificationConfidence` (1–100) based on how confident it is that the parsing was correct. Return `corrections: null` if no changes are needed.

### Additional settings panel changes

Add these new settings fields in Step 3 after the confidence threshold:

1. **Rate Limit (Requests per Minute)** — `llm_rate_limit_rpm`:
   - `<Input type="number" min={1} max={3600} />`
   - Default: `15`
   - Description: `"Maximum API calls per minute to the LLM provider. Google Gemini free tier allows 15 RPM for Flash models and 2 RPM for Pro models. Set lower if you're hitting rate limit errors."`

2. **Auto-Approve Threshold (%)** — `llm_auto_approve_threshold`:
   - `<Input type="number" min={1} max={100} />`
   - Default: `95`
   - Description: `"Uploads with confidence score ≥ this value are automatically parsed and sent directly to the review queue without triggering the second-pass model. Must be ≥ confidence threshold."`

3. **Second-Pass Trigger Threshold (%)** — Already exists as `llm_confidence_threshold`.
   - Update the description to: `"Uploads with confidence score below this value trigger the second-pass verification model. Uploads below 60% are NOT auto-parsed and are sent directly to the second-pass LLM for full re-analysis. Default: 90."`

4. **Skip Parse Below (%)** — `llm_skip_parse_threshold`:
   - `<Input type="number" min={1} max={100} />`
   - Default: `60`
   - Description: `"Uploads with confidence score strictly below this value will NOT have their PDFs parsed automatically. They will be sent directly to the second-pass LLM for re-analysis before any splitting occurs."`

Add all four new keys to `SETTING_KEYS` in the server settings page and the settings PUT/GET API handler.

---

## 5. COMPLETE REBUILD — LLM EXTRACTION PIPELINE (`src/app/api/files/smart-upload/route.ts`)

This is the most complex section. Completely rewrite the extraction pipeline.

### 5a. `LLMConfig` — add new fields

Add to `LLMConfig`:
```typescript
rateLimit: number;           // RPM ceiling
autoApproveThreshold: number; // >= this → auto-parse + send to review
skipParseThreshold: number;   // < this → do NOT auto-parse
visionModelParams: Record<string, unknown>; // Additional params for vision call
verificationModelParams: Record<string, unknown>; // Additional params for verify call
```

Load them in `loadLLMConfig()`:
```typescript
rateLimit: Number(dbSettings['llm_rate_limit_rpm'] ?? 15),
autoApproveThreshold: Number(dbSettings['llm_auto_approve_threshold'] ?? 95),
skipParseThreshold: Number(dbSettings['llm_skip_parse_threshold'] ?? 60),
visionModelParams: (() => {
  try { return JSON.parse(dbSettings['llm_vision_model_params'] || '{}'); } catch { return {}; }
})(),
verificationModelParams: (() => {
  try { return JSON.parse(dbSettings['llm_verification_model_params'] || '{}'); } catch { return {}; }
})(),
```

### 5b. `CuttingInstruction` and updated `ExtractedMetadata` types

```typescript
interface CuttingInstruction {
  instrument: string;
  partName: string;          // e.g. "1st Bb Clarinet"
  section: string;           // e.g. "Woodwinds"
  transposition: string;     // e.g. "Bb", "Eb", "C", "F"
  partNumber: number;        // 1-indexed within the instrument (1st/2nd/3rd)
  pageRange: [number, number]; // 0-indexed start and end page, inclusive
}

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;       // Primary instrument / ensemble description
  partNumber?: string;       // Legacy single-part number
  confidenceScore: number;   // 1–100
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
  parts?: Array<{            // Legacy parts array (kept for backward compat)
    instrument: string;
    partName: string;
  }>;
  cuttingInstructions?: CuttingInstruction[]; // NEW — primary split data
  verificationConfidence?: number;            // Set by second-pass model
  corrections?: string | null;               // Set by second-pass model
}
```

### 5c. Updated JSON schema for LLM output

```typescript
const metadataJsonSchema = {
  type: 'object',
  required: ['title', 'confidenceScore'],
  properties: {
    title: { type: 'string' },
    composer: { type: 'string' },
    publisher: { type: 'string' },
    instrument: { type: 'string' },
    partNumber: { type: 'string' },
    confidenceScore: { type: 'number', minimum: 1, maximum: 100 },
    fileType: {
      type: 'string',
      enum: ['FULL_SCORE', 'CONDUCTOR_SCORE', 'PART', 'CONDENSED_SCORE'],
    },
    isMultiPart: { type: 'boolean' },
    ensembleType: { type: 'string' },
    keySignature: { type: 'string' },
    timeSignature: { type: 'string' },
    tempo: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          instrument: { type: 'string' },
          partName: { type: 'string' },
        },
      },
    },
    cuttingInstructions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['instrument', 'partName', 'section', 'transposition', 'partNumber', 'pageRange'],
        properties: {
          instrument: { type: 'string' },
          partName: { type: 'string' },
          section: { type: 'string' },
          transposition: { type: 'string' },
          partNumber: { type: 'number' },
          pageRange: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
        },
      },
    },
  },
};
```

### 5d. Updated `DEFAULT_VISION_SYSTEM_PROMPT`

Replace the existing prompt with:

```
You are an expert music librarian and sheet music analyst with deep knowledge of wind band and orchestral score layouts.

Your task: analyse EVERY PAGE of the provided sheet music PDF (all pages are provided as images) and extract complete metadata AND cutting instructions.

METADATA TO EXTRACT:
- title: Full title of the piece
- composer: Composer full name (exactly as printed)
- publisher: Publisher name (if visible)
- instrument: Primary instrument or ensemble description
- fileType: One of FULL_SCORE | CONDUCTOR_SCORE | PART | CONDENSED_SCORE
- isMultiPart: true if this document contains multiple instrument parts
- ensembleType: e.g. "Concert Band", "Jazz Ensemble", "Orchestra", "Chamber", "Solo"
- keySignature: e.g. "Bb Major", "G Minor" (concert pitch)
- timeSignature: e.g. "4/4", "3/4"
- tempo: e.g. "Allegro moderato", "J=120"
- confidenceScore: 1–100 reflecting overall extraction accuracy

CUTTING INSTRUCTIONS (most important output):
For each distinct instrument part found anywhere in the document, provide a cuttingInstruction entry:
- instrument: Instrument name (e.g., "Bb Clarinet", "Alto Saxophone", "Bb Trumpet")
- partName: Full label as printed (e.g., "1st Bb Clarinet", "2nd Alto Saxophone")
- section: Instrument family section — one of: "Woodwinds" | "Brass" | "Percussion" | "Strings" | "Keyboard" | "Vocals" | "Other"
- transposition: Transposition of the instrument's written pitch — one of: "Bb" | "Eb" | "F" | "C" | "D" | "G" | "A"
- partNumber: Integer part number within the instrument (1st part = 1, 2nd part = 2, etc.)
- pageRange: [startPage, endPage] as 0-indexed integers (first page = 0), INCLUSIVE. Multi-page parts must span all their pages.

CRITICAL RULES:
1. Every page of the document must appear in exactly one cuttingInstruction's pageRange.
2. If the score itself (conductor score) is present, include it as instrument="SCORE", section="Score", transposition="C", partNumber=1.
3. Never assign the same physical page to two different parts.
4. If a part spans non-contiguous pages (rare), create two separate cuttingInstruction entries with the same instrument+partName but sequential integers appended to partName (e.g., "1st Bb Clarinet (p.1)", "1st Bb Clarinet (p.2)").
5. For combined parts on a single page (e.g., "1st & 2nd Trombone" on one page), create one cuttingInstruction with partName "1st & 2nd Trombone" and note in instrument that it is combined.
6. Reduce confidenceScore below 80 if any page is illegible, watermarked, or you cannot identify the instrument.
7. Reduce confidenceScore below 60 if you cannot reliably determine page range boundaries between parts.
8. Output ONLY valid JSON — no surrounding text, no markdown code fences.
```

### 5e. Updated `DEFAULT_VERIFICATION_SYSTEM_PROMPT`

```
You are a music sheet expert performing quality assurance on PDF splitting operations.

You will receive:
1. Images of the COMPLETE original PDF (all pages)
2. Images of each PARSED PART PDF (randomly sampled — not all parts)
3. The proposed cuttingInstructions JSON from the first-pass analysis

Your task:
- Verify that each sampled part PDF contains ONLY the pages that belong to that instrument part.
- Check that no pages are missing from any part.
- Confirm instrument names and part labels are correct.
- Verify the section classification is correct.
- Verify the transposition key is correct.

OUTPUT FORMAT (valid JSON only):
{
  "verificationConfidence": <1–100>,
  "corrections": <null | string describing what was wrong>,
  "cuttingInstructions": [ ...corrected array if changes needed... ],
  "confirmedParts": [ ...partNames that were verified correct... ]
}

Set verificationConfidence >= 90 only if all sampled parts look correct.
Set corrections to null if no issues were found.
If cuttingInstructions needs no changes, return the original array unchanged.
```

### 5f. Rate-limiting wrapper

Create a module-level rate limiter that enforces the `llmConfig.rateLimit` RPM ceiling. Implement a **token bucket** algorithm:

```typescript
// Rate limiter state (module-level singleton, survives request-to-request in Node.js/Next.js)
const llmRateLimiter = {
  tokens: 15,          // Starts full
  maxTokens: 15,
  lastRefillTime: Date.now(),
  refillIntervalMs: 60_000, // 1 minute

  async consume(): Promise<void> {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const refilled = (elapsed / this.refillIntervalMs) * this.maxTokens;
    this.tokens = Math.min(this.maxTokens, this.tokens + refilled);
    this.lastRefillTime = now;

    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.maxTokens) * this.refillIntervalMs;
      logger.info('LLM rate limit: waiting', { waitMs: Math.round(waitMs) });
      await new Promise(res => setTimeout(res, waitMs + 50)); // +50ms buffer
      this.tokens = 1;
    }

    this.tokens -= 1;
  },

  setLimit(rpm: number) {
    this.maxTokens = rpm;
    this.tokens = Math.min(this.tokens, rpm);
    this.refillIntervalMs = 60_000;
  },
};
```

Update `callVisionLLM` and `verifyMetadata` to call `await llmRateLimiter.consume()` before each API call, and call `llmRateLimiter.setLimit(llmConfig.rateLimit)` at the start of `POST`.

### 5g. Updated `callVisionLLM` — ALL pages, not just page 1

Change `convertPdfToImage` signature to `convertAllPdfPagesToImages`:

```typescript
async function convertAllPdfPagesToImages(pdfBuffer: Buffer, config: LLMConfig): Promise<string[]>
```

- Call `renderPdfToImage` for each page (0-indexed). Use `pageIndex` parameter.
- For providers with rate limits ≤ 15 RPM (e.g. Gemini free tier): bundle ALL page images into a **single LLM call** with one image per `content` item in the `user` message. Most vision models accept multiple images in a single call — this avoids hitting rate limits by keeping it to 1 API call per PDF regardless of page count.
- For Ollama: send all images in a single `messages[1].content` array (Ollama supports multiple image objects in one turn).
- For OpenAI/compatible: send all images as separate `image_url` objects in the `content` array of the user message.
- For Anthropic: send all images as separate `image` content items in the user turn.
- Cap at 50 pages maximum. If the PDF has > 50 pages, log a warning and send only the first 50 pages. Add a note to the user message: `"Note: Only the first 50 pages were provided due to size limits."`.

**Anthropic-specific message format** (the Anthropic API uses a different format than OpenAI):
```typescript
if (config.provider === 'anthropic') {
  requestBody = {
    model: config.visionModel,
    max_tokens: config.verificationModelParams?.max_tokens ?? 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        ...imageBase64Array.map(b64 => ({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: b64 },
        })),
        { type: 'text', text: 'Extract the metadata and cutting instructions from this sheet music. Return JSON.' },
      ],
    }],
    ...anthropicParams,
  };
}
```

**Gemini native format** (not via OpenAI proxy — use `generateContent` endpoint):
```typescript
if (config.provider === 'gemini') {
  const geminiEndpoint = `${config.ollamaEndpoint}/models/${config.visionModel}:generateContent?key=${config.openaiApiKey}`;
  requestBody = {
    contents: [{
      parts: [
        ...imageBase64Array.map(b64 => ({
          inlineData: { mimeType: 'image/png', data: b64 },
        })),
        { text: 'Extract the metadata and cutting instructions from this sheet music. Return JSON.' },
      ],
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: config.visionModelParams?.temperature ?? 0.2,
      maxOutputTokens: config.visionModelParams?.maxOutputTokens ?? 2048,
    },
  };
  // Gemini response shape: data.candidates[0].content.parts[0].text
}
```

Merge `config.visionModelParams` into the request body, excluding any top-level reserved keys (`model`, `messages`, `stream`, `format`, `system`, `contents`, `systemInstruction`).

### 5h. Routing logic based on confidence score

After first-pass LLM extraction, implement the following routing with clear logging:

```typescript
const confidence = extractedMetadata.confidenceScore;
const { skipParseThreshold, confidenceThreshold, autoApproveThreshold } = llmConfig;

// Determine routing
let routingDecision: 'auto_parse_auto_approve' | 'auto_parse_second_pass' | 'no_parse_second_pass';

if (confidence >= autoApproveThreshold) {           // e.g. >= 95
  routingDecision = 'auto_parse_auto_approve';
} else if (confidence >= skipParseThreshold) {      // e.g. >= 60 and < 95
  routingDecision = 'auto_parse_second_pass';
} else {                                             // < 60
  routingDecision = 'no_parse_second_pass';
}

logger.info('Smart upload routing decision', {
  sessionId,
  confidence,
  skipParseThreshold,
  confidenceThreshold,
  autoApproveThreshold,
  routingDecision,
});
```

For **`no_parse_second_pass`** (confidence < 60%):
- Do NOT call the PDF splitter.
- Set `parseStatus = 'NOT_PARSED'`.
- Set `secondPassStatus = 'QUEUED'` in the DB record.
- The second-pass LLM will be triggered asynchronously by a separate API route (see Section 7).

For **`auto_parse_second_pass`** (60% ≤ confidence < autoApproveThreshold):
- Proceed with PDF splitting (Section 6).
- Set `parseStatus = 'PARSED'` on success, `'PARSE_FAILED'` on error.
- Set `secondPassStatus = 'QUEUED'`.
- Second pass triggered asynchronously.

For **`auto_parse_auto_approve`** (confidence ≥ autoApproveThreshold):
- Proceed with PDF splitting.
- Set `parseStatus = 'PARSED'`.
- Set `secondPassStatus = 'NOT_NEEDED'`.
- Set `autoApproved = true`.
- Do NOT trigger second pass.

The API response should include `routingDecision` and `parseStatus` so the UI can display the appropriate message.

### 5i. Update API response

The response from `POST /api/files/smart-upload` should now include:
```typescript
{
  success: true;
  session: {
    id: string;
    fileName: string;
    confidenceScore: number;
    status: 'PENDING_REVIEW';
    parseStatus: string;
    secondPassStatus: string;
    autoApproved: boolean;
    routingDecision: string;
    createdAt: Date;
  };
  extractedMetadata: ExtractedMetadata;
  cuttingInstructions: CuttingInstruction[];
  parsedParts: Array<{
    partName: string;
    instrument: string;
    section: string;
    storageKey: string;
    fileName: string;
    fileSize: number;
    pageCount: number;
  }>;
  message: string;
}
```

---

## 6. PDF SPLITTING — COMPLETE OVERHAUL

### 6a. `src/lib/services/pdf-splitter.ts` — Ensure multi-page part combination

Read the file first. Ensure the following:

1. The `splitPdfByPageRanges` function (or equivalent) accepts `CuttingInstruction[]` (not just page range arrays) and returns one PDF buffer per instruction.
2. For each `CuttingInstruction`, extract ALL pages in `[pageRange[0], pageRange[1]]` (inclusive, 0-indexed) and concatenate them into a **single multi-page PDF**. Do NOT split multi-page parts into single pages. Each part PDF must contain all its pages in order.
3. Use the `pdf-lib` package (check if installed — if not, install it: `npm install pdf-lib`). If `pdfjs-dist` or another PDF library is already in use, keep using it but ensure page ranges work correctly.
4. The function signature should be:
   ```typescript
   export async function splitPdfByCuttingInstructions(
     pdfBuffer: Buffer,
     instructions: CuttingInstruction[]
   ): Promise<Array<{
     instruction: CuttingInstruction;
     buffer: Buffer;
     pageCount: number;
     fileName: string;
   }>>
   ```
5. Each output PDF's filename should be: `{originalBaseName} - {instruction.partName}.pdf` (sanitise to filesystem-safe characters: replace `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` with `_`).
6. Log each split with page counts.
7. If a page index in `pageRange` is out of bounds for the PDF, log a warning and clamp to the last page. Do not throw.

### 6b. Call site in `route.ts`

In `POST`, after routing logic decides to parse:

```typescript
if (routingDecision !== 'no_parse_second_pass') {
  const instructions = extractedMetadata.cuttingInstructions ?? [];

  if (instructions.length > 0) {
    try {
      const splitParts = await splitPdfByCuttingInstructions(buffer, instructions);
      
      const parsedPartsData: ParsedPartRecord[] = [];
      const tempStorageKeys: string[] = [];

      for (const part of splitParts) {
        // Rate-limit storage uploads if needed (usually not rate-limited, but be safe)
        const safePartName = part.instruction.partName.replace(/[^a-zA-Z0-9\-_ ]/g, '_');
        const partStorageKey = `smart-upload/${sessionId}/parts/${safePartName}.pdf`;
        
        await uploadFile(partStorageKey, part.buffer, {
          contentType: 'application/pdf',
          metadata: {
            sessionId,
            instrument: part.instruction.instrument,
            partName: part.instruction.partName,
            section: part.instruction.section,
            originalUploadId: sessionId,
          },
        });
        
        tempStorageKeys.push(partStorageKey);

        parsedPartsData.push({
          partName: part.instruction.partName,
          instrument: part.instruction.instrument,
          section: part.instruction.section,
          transposition: part.instruction.transposition,
          partNumber: part.instruction.partNumber,
          storageKey: partStorageKey,
          fileName: part.fileName,
          fileSize: part.buffer.length,
          pageCount: part.pageCount,
          pageRange: part.instruction.pageRange,
        });
      }

      parseStatus = 'PARSED';
      // tempStorageKeys holds all split parts — they are NOT in the final DB,
      // but stored temporarily for the second pass and review.
      // The original file's storageKey is SEPARATE and is what gets committed.
    } catch (splitErr) {
      logger.error('PDF splitting failed', { error: splitErr, sessionId });
      parseStatus = 'PARSE_FAILED';
      parsedPartsData = [];
      tempStorageKeys = [];
    }
  }
}
```

Store `parsedPartsData` (as JSON) in `SmartUploadSession.parsedParts` and `tempStorageKeys` (as JSON) in `SmartUploadSession.tempFiles`.

---

## 7. NEW API ROUTE — `/api/admin/uploads/second-pass`

### Purpose
Triggered server-side (or via a background job) to run the second-pass LLM verification on sessions with `secondPassStatus = 'QUEUED'`. This can also be triggered manually from the review UI.

### File to Create
`src/app/api/admin/uploads/second-pass/route.ts`

### `POST /api/admin/uploads/second-pass`

**Request body**: `{ sessionId: string }`

**Behaviour**:
1. Require valid session + `MUSIC_UPLOAD` OR `SYSTEM_CONFIG` permission.
2. Find the `SmartUploadSession` where `uploadSessionId === sessionId` AND `secondPassStatus` is either `'QUEUED'` or `'FAILED'`.
3. Set `secondPassStatus = 'IN_PROGRESS'` immediately (update DB before making LLM calls).
4. Load `LLMConfig` from DB.
5. Download the original PDF from `uploadSession.storageKey`.
6. Convert ALL pages to images via `convertAllPdfPagesToImages`.
7. If `parseStatus === 'PARSED'` AND `parsedParts` is non-empty:
   - Randomly select up to 3 parsed part PDFs from `parsedParts` for spot-checking.
   - Download each selected part's PDF from its `storageKey`.
   - Convert each to images.
   - Build the verification prompt that includes:
     a. All original PDF page images.
     b. For each sampled part: a section heading `"=== PART: {partName} ==="` followed by that part's page images.
     c. The proposed `cuttingInstructions` JSON from `uploadSession.cuttingInstructions`.
8. If `parseStatus !== 'PARSED'` (no parts split yet):
   - Re-run the full vision extraction on all pages using the verification model.
   - This is a full "second opinion" first-pass using a potentially different model.
9. Call `await llmRateLimiter.consume()` before the LLM call.
10. Parse the second-pass response. Update `SmartUploadSession`:
    - `secondPassResult` = the parsed JSON from the second pass
    - `secondPassRaw` = raw response string
    - `secondPassStatus = 'COMPLETE'`
    - If the second pass returned corrected `cuttingInstructions`, update `extractedMetadata.cuttingInstructions` AND if `parseStatus === 'PARSED'` re-run the PDF splitting with the corrected instructions (repeat Section 6 logic — upload new parts, update `parsedParts` and `tempFiles`).
    - If `verificationConfidence >= 90` AND the original `routingDecision` was `'auto_parse_second_pass'` AND `parseStatus === 'PARSED'`:
      - The session can now be auto-approved. Set `autoApproved = true`. (It still stays in `PENDING_REVIEW` — a human can see it with its auto-approved flag and confirm quickly.)
11. Return `{ success: true, sessionId, secondPassStatus: 'COMPLETE', verificationConfidence }`.
12. On error, set `secondPassStatus = 'FAILED'` and return `500`.

**ALSO** — after saving the `SmartUploadSession` in the **main** `POST /api/files/smart-upload` handler, if `secondPassStatus === 'QUEUED'`, trigger the second-pass asynchronously using `void fetch('/api/admin/uploads/second-pass', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sessionId }) })`. This is a "fire and forget" — do NOT await it in the request handler. The main response to the client does not wait for the second pass to complete.

---

## 8. UPDATED APPROVE ROUTE (`src/app/api/admin/uploads/review/[id]/approve/route.ts`)

### Changes required:

1. **Use `cuttingInstructions` from `SmartUploadSession.cuttingInstructions`** (not re-deriving from `extractedMetadata.parts`). The parsed parts are in `SmartUploadSession.parsedParts`.

2. **Use pre-split parts from `parsedParts`** instead of re-splitting at approval time:
   - If `parsedParts` is non-empty (stored as JSON array), iterate over it to create `MusicFile` and `MusicPart` records.
   - For each entry in `parsedParts`, create a `MusicFile` with the `storageKey` pointing to the already-split part PDF.
   - Set the new `MusicFile` fields: `partLabel`, `instrumentName`, `section`, `partNumber`, `pageCount`.
   - Set `MusicPart` fields: `section`, `partNumber`, `partLabel`, `transposition`, `pageCount`, `storageKey`.
   - The `storageKey` on `MusicFile` for a split part should be the part's storageKey from `parsedParts`.

3. **If `parsedParts` is empty** (parse failed or skipped), fall back to creating a single `MusicFile` pointing to the original PDF, as the current code does.

4. **`MusicPiece` new fields**: populate `ensembleType`, `keySignature`, `timeSignature`, `tempo` from `extractedMetadata` (now included in the schema).

5. **Cleanup on approval**: After the DB transaction commits successfully, delete ALL `storageKey` entries from `SmartUploadSession.tempFiles` using `deleteFile(storageKey)` (or the equivalent storage deletion function in `src/lib/services/storage.ts`). Do NOT delete:
   - The original upload file at `uploadSession.storageKey`
   - Any `storageKey` from `MusicFile` records just created (the part files that are now committed)
   - Any database records
   Only delete temp files that are in `tempFiles` but NOT in the final `parsedParts` storageKeys.
   
   **IMPORTANT**: Identify the storage deletion function in `src/lib/services/storage.ts` and use it. If none exists, add `export async function deleteFile(storageKey: string): Promise<void>` to that service.

6. The `approveSchema` should be extended with optional fields:
   ```typescript
   ensembleType: z.string().optional(),
   keySignature: z.string().optional(),
   timeSignature: z.string().optional(),
   tempo: z.string().optional(),
   ```

---

## 9. REVIEW PAGE OVERHAUL (`src/app/(admin)/admin/uploads/review/page.tsx`)

### 9a. Status routing display

Add a new column "Processing Status" to the review table (between "Confidence" and "Uploaded") that shows:

- `parseStatus === 'PARSED'` → green badge "Parts Split"
- `parseStatus === 'PARSE_FAILED'` → red badge "Split Failed"
- `parseStatus === 'NOT_PARSED'` → yellow badge "Not Parsed"
- `secondPassStatus === 'QUEUED'` → blue spinning badge "2nd Pass Queued"
- `secondPassStatus === 'IN_PROGRESS'` → blue spinning badge "2nd Pass Running"
- `secondPassStatus === 'COMPLETE'` → green badge "2nd Pass ✓"
- `secondPassStatus === 'FAILED'` → red badge "2nd Pass ✗"
- `autoApproved === true` → small green "Auto ✓" badge alongside other badges

Add a "Trigger 2nd Pass" button in the Actions column for sessions where `secondPassStatus === 'QUEUED'` or `'FAILED'`. Clicking it calls `POST /api/admin/uploads/second-pass` with the session ID, shows a loading spinner, and refreshes sessions on completion.

### 9b. Improved PDF preview in the review dialog

Replace the single static `<img>` preview with a **multi-page PDF viewer**:

1. Change the preview API (`GET /api/admin/uploads/review/[id]/preview`) to accept an optional `?page=N` query parameter (0-indexed). Read that file — if the endpoint does not currently support pagination, update it.
2. In the review dialog, load the **first page** immediately on open. Show navigation controls:
   - `← Prev` and `Next →` buttons to switch pages (disabled at boundaries).
   - A page counter: `Page 2 / 12`.
   - A **zoom control**: `−` / `+` buttons that scale the preview image using CSS `transform: scale(...)`. Supported scales: 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×. Default: 1×.
   - A full-screen toggle button (uses the `Maximize2` Lucide icon) that expands the preview to a modal overlay at full viewport height.
3. When `parsedParts` is non-empty, add a **"Parts Preview" tab** alongside the "Original PDF" tab, using a simple tab switcher (use the `<Tabs>` component from `@/components/ui/tabs` if available, or implement a basic one with Tailwind). In the Parts Preview tab:
   - Show a grid of parts (one card per part).
   - Each card: part name, instrument, section, page count, page range.
   - Clicking a part card loads that part's PDF preview (fetch from a new endpoint — see 9c).
   - Use the same page navigation + zoom controls as the original preview.

### 9c. New preview endpoint for parsed parts

Create `src/app/api/admin/uploads/review/[id]/part-preview/route.ts`:

**`GET /api/admin/uploads/review/[id]/part-preview?partStorageKey=<key>&page=<page>`**

- Require valid session + `music:read` permission.
- Decode `partStorageKey` (URL-encoded).
- Download the part PDF from storage.
- Render the requested page to a PNG image using `renderPdfToImage`.
- Return `{ imageBase64: string, totalPages: number }`.
- Return `404` if the part storage key does not belong to the session (verify by checking `parsedParts` JSON in the session).

### 9d. Update the review list API

Update `GET /api/admin/uploads/review/route.ts` to include `parsedParts`, `parseStatus`, `secondPassStatus`, `autoApproved`, and `cuttingInstructions` in the session objects returned. Currently, check what fields are selected and expand the Prisma `select` accordingly.

### 9e. Update the review dialog to show extracted metadata fields

Inside the metadata edit form in the review dialog, add fields for the new `MusicPiece` fields:
- `ensembleType` → `<Input>` labelled "Ensemble Type"
- `keySignature` → `<Input>` labelled "Key Signature"
- `timeSignature` → `<Input>` labelled "Time Signature"
- `tempo` → `<Input>` labelled "Tempo"

Also update `editedMetadata` state type to include these fields, and pass them to the approve request body.

### 9f. Add a "Parsed Parts" section in the review dialog

Below the metadata form, show a table of the parsed parts (from `session.parsedParts`):

| Part Name | Instrument | Section | Transposition | Pages | Page Range | Size |
|-----------|-----------|---------|--------------|-------|-----------|------|

If `parsedParts` is empty and `parseStatus` is `'NOT_PARSED'` or `'PARSE_FAILED'`, show a yellow warning:
> "No parts were automatically split from this PDF. On approval, the original PDF will be stored as a single file. You can manually trigger splitting after running the second-pass analysis."

---

## 10. UPLOAD PAGE UPDATES (`src/app/(admin)/admin/uploads/page.tsx`)

### Changes required:

1. **Display routing decision** in `UploadItemRow` when phase is `'done'`:
   - Current: shows `Title — Composer`, Instrument, Confidence, "Review →" link.
   - Add below confidence: a status line based on `routingDecision`:
     - `'auto_parse_auto_approve'` → green text: `"High confidence — parts split, ready for review"`
     - `'auto_parse_second_pass'` → blue text: `"Parts split — 2nd pass verification running in background"`
     - `'no_parse_second_pass'` → yellow text: `"Low confidence — sent to 2nd pass analysis before splitting"`
   - Show the number of parts found: `"X parts detected"` if `parsedParts.length > 0`.

2. **Extend `UploadResult` type**:
   ```typescript
   interface UploadResult {
     sessionId: string;
     fileName: string;
     confidenceScore: number;
     title: string;
     composer?: string;
     instrument?: string;
     routingDecision: string;
     parseStatus: string;
     secondPassStatus: string;
     partsCount: number;
   }
   ```

3. **Update `processUpload`**: map the new response fields from `body.session` and `body.parsedParts.length` into the `UploadResult`.

4. **Rate limit display**: Before the "Start AI Processing" button, add a subtle info line: `"Tip: Processing speed depends on your LLM provider's rate limit. Check LLM Settings for details."` (only shown when items.length > 0).

---

## 11. PREVIEW ENDPOINT UPDATE (`src/app/api/admin/uploads/review/[id]/preview/route.ts`)

Read this file first. Update it to:

1. Accept a `?page=N` query parameter (default: 0).
2. Download the PDF from `uploadSession.storageKey`.
3. Get the total page count from the PDF (use `pdf-lib`'s `PDFDocument.load(buffer).getPageCount()` or the existing pdf library already in use).
4. Render the requested page using `renderPdfToImage(buffer, { pageIndex: N, quality: 85, maxWidth: 1200, format: 'png' })`.
5. Return `{ imageBase64: string, totalPages: number }`.

---

## 12. CLEANUP UTILITY — Force-delete temp files after rejection or expiry

Create `src/lib/services/smart-upload-cleanup.ts`:

```typescript
/**
 * Delete all temporary files associated with a SmartUploadSession.
 * Safe to call on reject OR on re-processing.
 * Does NOT delete:
 *   - The original upload file (storageKey on SmartUploadSession)
 *   - Any MusicFile storageKeys that have already been committed to the DB
 */
export async function cleanupSmartUploadTempFiles(sessionId: string): Promise<void>
```

- Fetch the `SmartUploadSession` by `uploadSessionId`.
- Parse `tempFiles` JSON array from the session.
- Cross-reference with `parsedParts` to get the storageKeys of split parts.
- Determine which tempFiles are NOT yet in any committed `MusicFile` record.
- Delete those files using `deleteFile(storageKey)`.
- Update `SmartUploadSession.tempFiles` to the empty array `[]`.
- Log all deletions.

Also call `cleanupSmartUploadTempFiles` in the **reject** route (`src/app/api/admin/uploads/review/[id]/reject/route.ts`). Read that file first and add the cleanup call after setting `status = 'REJECTED'`.

---

## 13. UPDATED `src/app/api/admin/uploads/settings/route.ts`

Read this file. Add handling for the new setting keys:
- `llm_rate_limit_rpm`
- `llm_auto_approve_threshold`
- `llm_skip_parse_threshold`
- `llm_vision_model_params`
- `llm_verification_model_params`

These should be stored/retrieved in the same way as existing settings. Ensure the GET and PUT handlers include them.

---

## 14. TYPE DEFINITIONS

Create or update `src/types/smart-upload.ts` with shared TypeScript interfaces used across the smart upload system:

```typescript
export interface CuttingInstruction {
  instrument: string;
  partName: string;
  section: 'Woodwinds' | 'Brass' | 'Percussion' | 'Strings' | 'Keyboard' | 'Vocals' | 'Other' | 'Score';
  transposition: 'Bb' | 'Eb' | 'F' | 'C' | 'D' | 'G' | 'A';
  partNumber: number;
  pageRange: [number, number];
}

export interface ParsedPartRecord {
  partName: string;
  instrument: string;
  section: string;
  transposition: string;
  partNumber: number;
  storageKey: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  pageRange: [number, number];
}

export interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
  parts?: Array<{ instrument: string; partName: string }>;
  cuttingInstructions?: CuttingInstruction[];
  verificationConfidence?: number;
  corrections?: string | null;
}

export type RoutingDecision =
  | 'auto_parse_auto_approve'
  | 'auto_parse_second_pass'
  | 'no_parse_second_pass';

export type ParseStatus = 'NOT_PARSED' | 'PARSING' | 'PARSED' | 'PARSE_FAILED';

export type SecondPassStatus =
  | 'NOT_NEEDED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED';
```

Import from this module in all files that reference these types instead of re-declaring them.

---

## 15. LINT & TYPE-CHECK

After all changes, run:
```bash
npm run lint -- --fix
npx tsc --noEmit
```

Fix ALL errors. Warnings are acceptable only if they cannot be resolved without breaking functionality. Do not add `// eslint-disable` unless absolutely necessary and justified in a comment.

---

## 16. DEPENDENCY CHECK

Run:
```bash
cat package.json
```

Verify these packages are installed; if not, install them with `npm install`:
- `pdf-lib` — for PDF splitting and page counting
- `pdfjs-dist` — already likely installed for rendering; verify

Do NOT install:
- Any new LLM SDK/client packages (use raw `fetch`)
- Any full-featured PDF viewer packages

---

## 17. VALIDATION & ERROR HANDLING REQUIREMENTS

Every new and modified API route must:

1. Validate all inputs with Zod schemas before processing.
2. Return typed error responses: `{ error: string, details?: unknown }`.
3. Use `logger.info` / `logger.warn` / `logger.error` from `src/lib/logger.ts` for all significant events.
4. Never expose stack traces or internal error details to the client response.
5. Handle the case where `pdf-lib` throws on a corrupted or password-protected PDF gracefully — catch, log, and set `parseStatus = 'PARSE_FAILED'` rather than returning 500.
6. All storage operations must be wrapped in try/catch. A storage failure during splitting should NOT fail the entire upload — the session should still be saved to the DB with `parseStatus = 'PARSE_FAILED'`.

---

## 18. IMPLEMENTATION ORDER

Implement in exactly this order to avoid broken intermediate states:

1. **Section 14** — Type definitions file first (unblocks all other work)
2. **Section 3** — Database migration (must run before any new DB fields are accessed)
3. **Section 1** — `/api/admin/uploads/models` route
4. **Section 2** — `/api/admin/uploads/model-params` route
5. **Section 13** — Update settings API route (new keys)
6. **Section 4** — Settings form overhaul (depends on models/model-params API)
7. **Section 6a** — `pdf-splitter.ts` update (unblocks Section 5)
8. **Section 5** — Main smart upload route overhaul (core algorithm)
9. **Section 7** — Second-pass route
10. **Section 11** — Preview endpoint update (needed by review page)
11. **Section 9c** — Part-preview endpoint (needed by review page)
12. **Section 8** — Approve route update
13. **Section 12** — Cleanup utility, update reject route
14. **Section 9** — Review page overhaul
15. **Section 10** — Upload page updates
16. **Section 15** — Lint and type-check pass
17. **Section 16** — Dependency check

---

## 19. DO NOT CHANGE

The following are intentionally out of scope for this task. Do not modify:

- `src/lib/auth/` — authentication system
- `src/lib/csrf.ts`
- `src/lib/rate-limit.ts` (the application-level rate limiter; the LLM rate limiter is a new separate concern)
- `prisma/migrations/` — the existing migration files (only create a new migration)
- Any of the public-facing pages (`src/app/(public)/`)
- Any event, announcement, member, or attendance features
- `src/lib/services/storage.ts` EXCEPT to add `deleteFile` if it does not already exist

---

## 20. SUCCESS CRITERIA

The task is complete when:

- [x] The settings form has a 3-step wizard: API Keys → Model Selection (dynamic from provider API) → Advanced Prompts
- [x] Model dropdowns are populated dynamically from the provider API, sorted cheapest-first
- [x] Model parameters are shown dynamically in a collapsible section beneath the model selectors
- [x] Default system prompts are shown as placeholder text in the textarea inputs with guidance
- [x] The upload API sends ALL pages (not just page 1) to the LLM in a single call
- [x] The LLM returns `cuttingInstructions` with per-part page ranges
- [x] PDFs are split into multi-page per-part PDFs using the cutting instructions
- [x] Confidence routing works correctly: < configured skip threshold → no auto-parse; < auto-approve threshold → auto-parse + queue second pass; >= auto-approve threshold → auto-parse, no second pass
- [x] The second-pass LLM route exists and is triggered asynchronously
- [x] The second pass does spot-check verification by comparing parsed part PDFs against the original
- [x] Approval stores per-part MusicFile + MusicPart records with all new granular fields
- [x] Temp/staging files are force-deleted after approval or rejection
- [x] The review page shows processing status, triggers second pass from UI, and has multi-page + zoomable preview with tabs for original vs parts
- [x] The database migration successfully applies the new fields
- [x] `npm run lint` passes with no errors
- [x] `npx tsc --noEmit` passes with no errors
