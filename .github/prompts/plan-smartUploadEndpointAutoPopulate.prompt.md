# Smart Upload — Complete Production Upgrade

> **Mission**: Deliver a fully-wired, token-optimised, resilient AI-powered sheet-music ingestion pipeline.  
> Every changed file is listed explicitly; every code change is provided in full or as a precise diff.  
> Run `npm run test && npm run build` after each major section to catch regressions early.

---

## 0. Context & File Map

```
src/
  app/
    api/admin/uploads/
      events/route.ts           ← SSE live-progress (NEW)
      review/
        route.ts                ← list sessions
        [id]/approve/route.ts   ← approve + import
        [id]/reject/route.ts    ← reject
        [id]/preview/route.ts   ← per-page PDF thumbnail
        [id]/part-preview/route.ts
      second-pass/route.ts      ← AI verification pass
      settings/
        route.ts                ← CRUD settings
        test/route.ts           ← connection test
    (admin)/admin/uploads/
      page.tsx                  ← drag-drop upload UI
      review/page.tsx           ← review queue UI
      settings/page.tsx         ← settings shell
  components/admin/music/
    smart-upload-settings-form.tsx  ← settings form (MAJOR CHANGES)
  lib/
    llm/
      providers.ts              ← single source of truth (NEW)
      config-loader.ts          ← shared loadLLMConfig (NEW)
      index.ts                  ← callVisionModel (PATCH)
      openai.ts                 ← (PATCH - configurable endpoint default)
      anthropic.ts              ← (PATCH - configurable endpoint)
      gemini.ts                 ← (PATCH - configurable endpoint)
      openrouter.ts             ← (PATCH)
      types.ts                  ← (PATCH - add geminiApiKey)
    services/
      pdf-renderer.ts           ← (PATCH - configurable scale)
      cutting-instructions.ts   ← (PATCH - gap splitter)
      pdf-splitter.ts           ← (PATCH - completeness check)
  workers/
    smart-upload-processor.ts   ← (MAJOR PATCH)
    smart-upload-worker.ts      ← (MAJOR PATCH)
prisma/seed.ts                  ← (PATCH - provider-aware endpoint)
env.example                     ← (PATCH - all provider docs)
docs/SMART_UPLOAD.md            ← (PATCH - table of providers)
```

---

## 1. `src/lib/llm/providers.ts` — Single Source of Truth (NEW FILE)

Create this file. Every other file imports from it — never hard-code endpoints elsewhere.

```typescript
// src/lib/llm/providers.ts
// ============================================================
// Single source of truth for LLM provider metadata.
// All default endpoints / models / capabilities live here.
// ============================================================

export const LLM_PROVIDER_VALUES = [
  'ollama',
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'custom',
] as const;

export type LLMProviderValue = typeof LLM_PROVIDER_VALUES[number];

export interface ProviderMeta {
  value: LLMProviderValue;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultEndpoint: string;
  /** Default vision-capable model for 1st pass */
  defaultVisionModel: string;
  /** Default model for 2nd verification pass */
  defaultVerificationModel: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
}

export const LLM_PROVIDERS: ProviderMeta[] = [
  {
    value: 'ollama',
    label: 'Ollama (Local / Self-hosted)',
    description: 'Free, private, runs on your server or laptop',
    requiresApiKey: false,
    defaultEndpoint: 'http://localhost:11434',
    defaultVisionModel: 'llama3.2-vision',
    defaultVerificationModel: 'qwen2.5:7b',
    apiKeyLabel: '',
    apiKeyPlaceholder: '',
    docsUrl: 'https://ollama.com',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Vision — most reliable vision models',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultVisionModel: 'gpt-4o',
    defaultVerificationModel: 'gpt-4o-mini',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet — strong reasoning and OCR accuracy',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.anthropic.com',
    defaultVisionModel: 'claude-3-5-sonnet-20241022',
    defaultVerificationModel: 'claude-3-haiku-20240307',
    apiKeyLabel: 'Anthropic API Key',
    apiKeyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/keys',
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 2.0 Flash — generous free tier for testing',
    requiresApiKey: true,
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultVisionModel: 'gemini-2.0-flash-exp',
    defaultVerificationModel: 'gemini-2.0-flash-exp',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Access 200+ models via a single API key — free tier available',
    requiresApiKey: true,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultVisionModel: 'google/gemini-2.0-flash-exp:free',
    defaultVerificationModel: 'google/gemma-3-27b-it:free',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    value: 'custom',
    label: 'Custom (OpenAI-compatible)',
    description: 'vLLM, LM Studio, Mistral, Groq, or any OpenAI-compatible API',
    requiresApiKey: false,
    defaultEndpoint: '',
    defaultVisionModel: '',
    defaultVerificationModel: '',
    apiKeyLabel: 'Custom API Key',
    apiKeyPlaceholder: 'Bearer token or API key',
    docsUrl: '',
  },
];

/** O(1) lookup — returns undefined for unknown values */
export function getProviderMeta(value: string): ProviderMeta | undefined {
  return LLM_PROVIDERS.find((p) => p.value === value);
}

/**
 * Returns the default API endpoint for the given provider.
 * Returns '' for 'custom' and unknown values.
 */
export function getDefaultEndpointForProvider(value: string): string {
  return getProviderMeta(value)?.defaultEndpoint ?? '';
}
```

---

## 2. `src/lib/llm/config-loader.ts` — Shared `loadLLMConfig()` (NEW FILE)

Eliminates the three divergent copies in `smart-upload-processor.ts`, `smart-upload-worker.ts`, and `second-pass/route.ts`. All three will import from here.

```typescript
// src/lib/llm/config-loader.ts
// ============================================================
// Canonical LLM configuration loader.
// Reads the authoritative `llm_endpoint_url` key from the DB,
// falls back to provider-specific defaults when not set.
// SECURITY: Provider keys are strictly isolated.
// ============================================================

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getDefaultEndpointForProvider } from './providers';
import type { LLMProviderValue } from './providers';

export interface LLMRuntimeConfig {
  provider: LLMProviderValue;
  endpointUrl: string;
  visionModel: string;
  verificationModel: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  customApiKey: string;
  confidenceThreshold: number;
  twoPassEnabled: boolean;
  visionSystemPrompt?: string;
  verificationSystemPrompt?: string;
  rateLimit: number;
  autoApproveThreshold: number;
  skipParseThreshold: number;
  visionModelParams: Record<string, unknown>;
  verificationModelParams: Record<string, unknown>;
}

const DB_KEYS = [
  'llm_provider',
  'llm_endpoint_url',
  // Legacy keys (still honoured as fallback)
  'llm_ollama_endpoint',
  'llm_custom_base_url',
  // API keys
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
  // Models
  'llm_vision_model',
  'llm_verification_model',
  // Behaviour
  'llm_confidence_threshold',
  'llm_two_pass_enabled',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  // Model params
  'vision_model_params',
  'verification_model_params',
  // Legacy model param keys
  'llm_vision_model_params',
  'llm_verification_model_params',
] as const;

function parseJsonParam(raw: string | undefined): Record<string, unknown> {
  try {
    if (!raw || raw.trim() === '') return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Load LLM configuration from the database with environment variable fallback.
 * Call once per job/request; cache the result if calling multiple times.
 */
export async function loadLLMConfig(): Promise<LLMRuntimeConfig> {
  let db: Record<string, string> = {};

  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...DB_KEYS] } },
      select: { key: true, value: true },
    });
    db = rows.reduce<Record<string, string>>((acc, r) => {
      if (r.value !== null && r.value !== undefined) acc[r.key] = r.value;
      return acc;
    }, {});
  } catch (err) {
    logger.warn('loadLLMConfig: DB unavailable, using env vars only', { err });
  }

  const provider = (
    db['llm_provider'] ||
    process.env.LLM_PROVIDER ||
    'ollama'
  ) as LLMProviderValue;

  // ── Endpoint resolution ──────────────────────────────────────────────────
  // Priority: explicit DB value → legacy DB key → env var → provider default
  let endpointUrl =
    db['llm_endpoint_url'] ||
    '';

  if (!endpointUrl) {
    // Legacy / provider-specific env fallbacks
    switch (provider) {
      case 'ollama':
        endpointUrl =
          process.env.LLM_OLLAMA_ENDPOINT ||
          db['llm_ollama_endpoint'] ||
          getDefaultEndpointForProvider('ollama');
        break;
      case 'custom':
        endpointUrl =
          process.env.LLM_CUSTOM_BASE_URL ||
          db['llm_custom_base_url'] ||
          '';
        break;
      case 'openai':
        endpointUrl =
          process.env.LLM_OPENAI_ENDPOINT ||
          getDefaultEndpointForProvider('openai');
        break;
      default:
        endpointUrl = getDefaultEndpointForProvider(provider);
    }
  }

  // ── Models ───────────────────────────────────────────────────────────────
  const visionModel =
    db['llm_vision_model'] ||
    process.env.LLM_VISION_MODEL ||
    'llama3.2-vision';

  const verificationModel =
    db['llm_verification_model'] ||
    process.env.LLM_VERIFICATION_MODEL ||
    'qwen2.5:7b';

  // ── Model params — prefer new keys, fall back to legacy prefixed keys ────
  const visionModelParams = parseJsonParam(
    db['vision_model_params'] || db['llm_vision_model_params']
  );
  const verificationModelParams = parseJsonParam(
    db['verification_model_params'] || db['llm_verification_model_params']
  );

  return {
    provider,
    endpointUrl,
    visionModel,
    verificationModel,
    openaiApiKey:     db['llm_openai_api_key']     || process.env.LLM_OPENAI_API_KEY     || '',
    anthropicApiKey:  db['llm_anthropic_api_key']  || process.env.LLM_ANTHROPIC_API_KEY  || '',
    openrouterApiKey: db['llm_openrouter_api_key'] || process.env.LLM_OPENROUTER_API_KEY || '',
    geminiApiKey:     db['llm_gemini_api_key']     || process.env.LLM_GEMINI_API_KEY     || '',
    customApiKey:     db['llm_custom_api_key']     || process.env.LLM_CUSTOM_API_KEY     || '',
    confidenceThreshold:   Number(db['llm_confidence_threshold']   ?? 70),
    twoPassEnabled:        (db['llm_two_pass_enabled'] ?? 'true') === 'true',
    visionSystemPrompt:    db['llm_vision_system_prompt']    || undefined,
    verificationSystemPrompt: db['llm_verification_system_prompt'] || undefined,
    rateLimit:             Number(db['llm_rate_limit_rpm']         ?? 15),
    autoApproveThreshold:  Number(db['llm_auto_approve_threshold'] ?? 90),
    skipParseThreshold:    Number(db['llm_skip_parse_threshold']   ?? 60),
    visionModelParams,
    verificationModelParams,
  };
}

/**
 * Convert LLMRuntimeConfig to the LLMConfig interface expected by adapters.
 * SECURITY: Only the correct provider key is included per call; others are omitted.
 */
export function runtimeToAdapterConfig(cfg: LLMRuntimeConfig) {
  return {
    llm_provider: cfg.provider,
    llm_endpoint_url: cfg.endpointUrl,
    llm_vision_model: cfg.visionModel,
    llm_verification_model: cfg.verificationModel,
    llm_openai_api_key:     cfg.openaiApiKey,
    llm_anthropic_api_key:  cfg.anthropicApiKey,
    llm_openrouter_api_key: cfg.openrouterApiKey,
    llm_gemini_api_key:     cfg.geminiApiKey,
    llm_custom_api_key:     cfg.customApiKey,
  } as const;
}
```

---

## 3. `src/lib/llm/types.ts` — Add `geminiApiKey` field

The current interface is missing `llm_gemini_api_key`. Patch the interface:

```typescript
export interface LLMConfig {
  llm_provider: LLMProvider;
  llm_endpoint_url?: string;
  llm_openai_api_key?: string;
  llm_anthropic_api_key?: string;
  llm_openrouter_api_key?: string;
  llm_gemini_api_key?: string;      // ← ADD this line (was missing)
  llm_custom_api_key?: string;
  llm_vision_model?: string;
  llm_verification_model?: string;
}
```

---

## 4. LLM Adapter Patches — Configurable Endpoints

### 4a. `src/lib/llm/anthropic.ts`

Replace the hard-coded URL with a configurable one:

```typescript
// Replace this line inside buildRequest():
//   url: 'https://api.anthropic.com/v1/messages',
// WITH:
    const baseUrl = (config.llm_endpoint_url || 'https://api.anthropic.com').replace(/\/$/, '');
    return {
      url: `${baseUrl}/v1/messages`,
      ...
    };
```

Full replacement for the `buildRequest` return value:

```typescript
    const baseUrl = (config.llm_endpoint_url || 'https://api.anthropic.com').replace(/\/$/, '');
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: config.llm_vision_model || 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content }],
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.1,
      },
    };
```

### 4b. `src/lib/llm/gemini.ts`

Gemini's URL embeds the model name AND the API key. Support configurable base URL:

```typescript
// Inside buildRequest(), replace the hard-coded URL construction:
    const baseUrl = (config.llm_endpoint_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = config.llm_vision_model || 'gemini-2.0-flash-exp';
    const apiKey = config.llm_gemini_api_key;
    if (!apiKey) throw new Error('Gemini API key is required but not configured');

    return {
      url: `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.1,
        },
      },
    };
```

### 4c. `src/lib/llm/index.ts` — Retry + Timeout + Token Logging

Replace the `callVisionModel` function body with a resilient version:

```typescript
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;

export async function callVisionModel(
  config: LLMConfig,
  images: Array<{ mimeType: string; base64Data: string }>,
  prompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<VisionResponse> {
  const adapter = getAdapter(config.llm_provider);
  const request: VisionRequest = {
    images,
    prompt,
    maxTokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.1,
  };

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { url, headers, body } = adapter.buildRequest(config, request);

      logger.debug('Calling vision LLM', {
        provider: config.llm_provider,
        model: config.llm_vision_model,
        imageCount: images.length,
        attempt,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000); // 90 s

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // 429 / 503: retry with backoff; others: throw immediately
        if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
          const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
          logger.warn('LLM rate limited, retrying', { status: response.status, waitMs: wait, attempt });
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`LLM call failed: ${response.status} ${response.statusText} — ${errorText.slice(0, 300)}`);
      }

      const data = await response.json();
      const result = adapter.parseResponse(data);

      logger.info('Vision LLM response', {
        provider: config.llm_provider,
        model: config.llm_vision_model,
        contentLength: result.content.length,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        attempt,
      });

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') {
        throw new Error('LLM call timed out after 90 seconds');
      }
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
        logger.warn('LLM call failed, retrying', { error: lastError.message, waitMs: wait, attempt });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    }
  }
  throw lastError ?? new Error('LLM call failed after all retries');
}
```

---

## 5. `src/lib/services/pdf-renderer.ts` — Higher Resolution & Configurable Scale

The current renderer uses `scale: 1` which for sheet music produces ~96 DPI — too low for reliable LLM OCR. Patch the `renderPdfToImage` signature and implementation:

```typescript
export interface RenderOptions {
  pageIndex?: number;
  quality?: number;
  maxWidth?: number;
  format?: 'png' | 'jpeg';
  /** DPI multiplier. Default 2 → 192 DPI for sharp sheet music OCR */
  scale?: number;
}

export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: RenderOptions = {}
): Promise<string> {
  const {
    pageIndex = 0,
    quality = 85,
    maxWidth = 1024,   // ← reduced default to balance quality vs token size
    format = 'png',
    scale = 2,         // ← 192 DPI default for accurate music notation OCR
  } = options;
  ...
  const viewport = page.getViewport({ scale });   // ← use configurable scale
  ...
}
```

Optionally export a `renderPdfPageBatch` helper to render multiple pages in one call (avoids loading the document N times):

```typescript
export async function renderPdfPageBatch(
  pdfBuffer: Buffer,
  pageIndices: number[],
  options: Omit<RenderOptions, 'pageIndex'> = {}
): Promise<string[]> {
  const pdfData = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: pdfData, disableWorker: true } as never);
  const pdfDocument = await loadingTask.promise;
  const results: string[] = [];

  for (const idx of pageIndices) {
    try {
      // reuse same pdfjsDocument — avoids re-parsing PDF for each page
      const page = await pdfDocument.getPage(idx + 1);
      const { scale = 2, maxWidth = 1024, quality = 85, format = 'png' } = options;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      await page.render({
        canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;
      let buf = canvas.toBuffer('image/png');
      if (Math.floor(viewport.width) > maxWidth) {
        buf = await sharp(buf).resize({ width: maxWidth, fit: 'inside' }).toFormat(format, { quality }).toBuffer();
      } else if (format === 'jpeg') {
        buf = await sharp(buf).toFormat('jpeg', { quality }).toBuffer();
      }
      results.push(buf.toString('base64'));
    } catch (err) {
      logger.warn('renderPdfPageBatch: failed page', { idx, err });
      results.push(PLACEHOLDER_IMAGE);
    }
  }
  return results;
}

const PLACEHOLDER_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';
```

---

## 6. `src/workers/smart-upload-processor.ts` — Major Upgrade

### 6a. Replace `loadLLMConfig`

Delete the local `SmartUploadLLMConfig` interface and `loadLLMConfig` function entirely. Instead:

```typescript
import { loadLLMConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';
```

### 6b. Replace `renderPdfPages` with smart page sampling

Vision models are most useful when they see:
- Page 1 (cover / title)
- Page 2 (first actual music, usually has header with instrument name)
- Sampled interior pages (to detect multi-part structure)
- Last page (end of document, useful for page-count verification)

Providing ALL pages at token cost is wasteful and can exceed context limits. Replace:

```typescript
const MAX_SAMPLED_PAGES = 8;  // hard cap for vision pass

/**
 * Select representative pages from a PDF for LLM analysis.
 * Returns base64-encoded PNG images in page order.
 * - Always includes the first 2 pages (cover + first music page)
 * - For docs > 4 pages: samples evenly across the rest, up to MAX_SAMPLED_PAGES total
 * - Always includes the last page when total > 2
 */
async function samplePdfPages(pdfBuffer: Buffer): Promise<{ images: string[]; totalPages: number; sampledIndices: number[] }> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();

  let indices: number[];
  if (totalPages <= MAX_SAMPLED_PAGES) {
    indices = Array.from({ length: totalPages }, (_, i) => i);
  } else {
    // Always include first 2 and last 1
    const fixed = [0, 1, totalPages - 1];
    const remaining = MAX_SAMPLED_PAGES - fixed.length;
    const step = Math.floor((totalPages - 3) / (remaining + 1));
    const interior: number[] = [];
    for (let i = 1; i <= remaining; i++) {
      const idx = 1 + i * step;
      if (idx < totalPages - 1) interior.push(idx);
    }
    indices = [...new Set([...fixed, ...interior])].sort((a, b) => a - b);
  }

  const images = await renderPdfPageBatch(pdfBuffer, indices, {
    scale: 2,
    maxWidth: 1024,
    quality: 85,
    format: 'png',
  });

  logger.info('PDF pages sampled for LLM', { totalPages, sampledCount: images.length, indices });
  return { images, totalPages, sampledIndices: indices };
}
```

### 6c. Expert Vision Prompt

Replace the thin 1-line `buildVisionPrompt()`:

```typescript
function buildVisionPrompt(totalPages: number, sampledPageNumbers: number[]): string {
  const pageList = sampledPageNumbers.map((n) => n + 1).join(', ');  // 1-indexed for human readability
  return `You are an expert music librarian and sheet music analyst. Analyse these ${sampledPageNumbers.length} images (pages ${pageList} from a ${totalPages}-page PDF) and extract ALL metadata.

## YOUR TASK
Return a single JSON object matching the schema below. Be as accurate as possible — this data will be used to catalogue music for a concert band library.

## JSON OUTPUT SCHEMA
\`\`\`json
{
  "title": "string — the full title exactly as printed on the score",
  "subtitle": "string | null — subtitle or arrangement description if present",
  "composer": "string | null — full name, e.g. 'John Philip Sousa'",
  "arranger": "string | null — arranger name if different from composer",
  "publisher": "string | null — e.g. 'Hal Leonard', 'Carl Fischer'",
  "copyrightYear": "number | null",
  "ensembleType": "string | null — e.g. 'Concert Band', 'Wind Ensemble', 'Brass Quintet'",
  "keySignature": "string | null — e.g. 'Bb Major', 'G minor'",
  "timeSignature": "string | null — e.g. '4/4', '6/8', '3/4'",
  "tempo": "string | null — e.g. 'Allegro', '♩= 120'",
  "fileType": "one of: FULL_SCORE | CONDUCTOR_SCORE | CONDENSED_SCORE | PART",
  "isMultiPart": "boolean — true if this PDF contains multiple instrument parts",
  "parts": [
    {
      "instrument": "string — specific instrument name, e.g. 'Bb Clarinet 1'",
      "partName": "string — label as printed, e.g. 'Clarinet in Bb, Part 1'",
      "section": "one of: Woodwinds | Brass | Percussion | Strings | Keyboard | Vocals | Score | Other",
      "transposition": "one of: C | Bb | Eb | F | G | D | A — concert pitch transposition",
      "partNumber": "integer — ordering index within the PDF, 1-based"
    }
  ],
  "cuttingInstructions": [
    {
      "partName": "string — same as parts[n].partName",
      "instrument": "string — same as parts[n].instrument",
      "section": "string",
      "transposition": "string",
      "partNumber": "integer",
      "pageRange": [startPage, endPage]
    }
  ],
  "totalPageCount": ${totalPages},
  "confidenceScore": "integer 0-100 — your confidence in the accuracy of ALL fields above",
  "notes": "string | null — any caveats, ambiguities, or observations"
}
\`\`\`

## RULES
1. pageRange values are **1-indexed** (page 1 = first page of PDF, page ${totalPages} = last page).
2. Every page MUST be covered by exactly one cuttingInstruction — no overlaps, no gaps.
3. If this is NOT a multi-part score, set isMultiPart=false and provide a single cuttingInstruction covering pages [1, ${totalPages}] for the whole document.
4. For transposition: Bb Clarinet/Trumpet/Soprano Sax → "Bb"; Eb Alto Sax/Horn in Eb → "Eb"; F Horn/English Horn → "F"; all others → "C".
5. Set confidenceScore < 50 if you cannot clearly read the title or instrument names.
6. Return ONLY valid JSON — no markdown fences, no prose before or after.`;
}
```

### 6d. Robust `parseVisionResponse()`

```typescript
function parseVisionResponse(content: string, totalPages: number): ExtractedMetadata {
  // 1. Strip markdown code fences
  let cleaned = content
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  // 2. Extract first top-level JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error('parseVisionResponse: no JSON object found', { contentPreview: content.slice(0, 200) });
    return buildFallbackMetadata(totalPages);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    logger.error('parseVisionResponse: JSON.parse failed', { err });
    return buildFallbackMetadata(totalPages);
  }

  // 3. Validate & normalise required fields
  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? parsed.title.trim()
    : 'Unknown Title';

  const confidenceScore = typeof parsed.confidenceScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.confidenceScore)))
    : 0;

  const isMultiPart = parsed.isMultiPart === true;

  // Normalise parts array
  const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];
  const parts = rawParts.map((p: unknown, i: number) => {
    const part = (p ?? {}) as Record<string, unknown>;
    return {
      instrument: typeof part.instrument === 'string' ? part.instrument.trim() : `Unknown Part ${i + 1}`,
      partName: typeof part.partName === 'string' ? part.partName.trim() : `Part ${i + 1}`,
      section: typeof part.section === 'string' ? part.section : 'Other',
      transposition: typeof part.transposition === 'string' ? part.transposition : 'C',
      partNumber: typeof part.partNumber === 'number' ? part.partNumber : i + 1,
    };
  });

  // Normalise cutting instructions
  const rawCuts = Array.isArray(parsed.cuttingInstructions) ? parsed.cuttingInstructions : [];
  const cuttingInstructions = rawCuts
    .map((c: unknown) => {
      const cut = (c ?? {}) as Record<string, unknown>;
      const pageRange = Array.isArray(cut.pageRange) && cut.pageRange.length >= 2
        ? [Number(cut.pageRange[0]), Number(cut.pageRange[1])] as [number, number]
        : null;
      if (!pageRange || isNaN(pageRange[0]) || isNaN(pageRange[1])) return null;
      return {
        partName: typeof cut.partName === 'string' ? cut.partName.trim() : 'Unknown',
        instrument: typeof cut.instrument === 'string' ? cut.instrument.trim() : 'Unknown',
        section: typeof cut.section === 'string' ? cut.section : 'Other',
        transposition: typeof cut.transposition === 'string' ? cut.transposition : 'C',
        partNumber: typeof cut.partNumber === 'number' ? cut.partNumber : 1,
        pageRange,
      } satisfies CuttingInstruction;
    })
    .filter((c): c is CuttingInstruction => c !== null);

  return {
    title,
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
    composer: typeof parsed.composer === 'string' ? parsed.composer : undefined,
    arranger: typeof parsed.arranger === 'string' ? parsed.arranger : undefined,
    publisher: typeof parsed.publisher === 'string' ? parsed.publisher : undefined,
    ensembleType: typeof parsed.ensembleType === 'string' ? parsed.ensembleType : undefined,
    keySignature: typeof parsed.keySignature === 'string' ? parsed.keySignature : undefined,
    timeSignature: typeof parsed.timeSignature === 'string' ? parsed.timeSignature : undefined,
    tempo: typeof parsed.tempo === 'string' ? parsed.tempo : undefined,
    fileType: (['FULL_SCORE', 'CONDUCTOR_SCORE', 'CONDENSED_SCORE', 'PART'] as const)
      .includes(parsed.fileType as never)
      ? (parsed.fileType as ExtractedMetadata['fileType'])
      : 'FULL_SCORE',
    isMultiPart,
    parts,
    cuttingInstructions,
    confidenceScore,
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

function buildFallbackMetadata(totalPages: number): ExtractedMetadata {
  return {
    title: 'Unknown Title',
    confidenceScore: 0,
    fileType: 'FULL_SCORE',
    isMultiPart: false,
    parts: [],
    cuttingInstructions: [
      {
        partName: 'Full Score',
        instrument: 'Full Score',
        section: 'Score',
        transposition: 'C',
        partNumber: 1,
        pageRange: [1, totalPages],
      },
    ],
    notes: 'Metadata extraction failed — manual review required',
  };
}
```

### 6e. Gap Detection — Cover All Pages

After `validateAndNormalizeInstructions`, detect uncovered page ranges and inject synthetic "Uncovered" parts rather than silently losing pages:

```typescript
// After calling validateAndNormalizeInstructions()…
const gapInstructions = buildGapInstructions(validation.instructions, totalPages);
if (gapInstructions.length > 0) {
  logger.warn('Gap pages detected — adding uncovered parts', {
    sessionId,
    gaps: gapInstructions.map((g) => g.pageRange),
  });
  validation.instructions.push(...gapInstructions);
  validation.warnings.push(
    `${gapInstructions.length} uncovered page range(s) were added as "Unlabelled" parts`
  );
}

// Helper (add at module level):
function buildGapInstructions(
  instructions: CuttingInstruction[],
  totalPages: number
): CuttingInstruction[] {
  // Build a coverage bitmap (1-indexed)
  const covered = new Set<number>();
  for (const inst of instructions) {
    for (let p = inst.pageRange[0]; p <= inst.pageRange[1]; p++) covered.add(p);
  }
  const gaps: Array<[number, number]> = [];
  let gapStart: number | null = null;
  for (let p = 1; p <= totalPages; p++) {
    if (!covered.has(p)) {
      if (gapStart === null) gapStart = p;
    } else if (gapStart !== null) {
      gaps.push([gapStart, p - 1]);
      gapStart = null;
    }
  }
  if (gapStart !== null) gaps.push([gapStart, totalPages]);

  return gaps.map(([start, end], i) => ({
    partName: `Unlabelled Pages ${start}-${end}`,
    instrument: 'Unknown',
    section: 'Other' as const,
    transposition: 'C' as const,
    partNumber: 9900 + i,
    pageRange: [start, end] as [number, number],
  }));
}
```

### 6f. Wire into `processSmartUpload`

The main processor function needs two changes:

1. **Replace** `await renderPdfPages(pdfBuffer)` with `await samplePdfPages(pdfBuffer)`, destructuring `{ images, totalPages, sampledIndices }`.
2. **Pass** `sampledIndices` to `buildVisionPrompt(totalPages, sampledIndices)`.
3. **Replace** `parseVisionResponse(visionResult.content)` with `parseVisionResponse(visionResult.content, totalPages)`.
4. **Remove** the local `loadLLMConfig` and import from `config-loader`.
5. **Pass** the Gemini API key in `llmProviderConfig`.

The final `llmProviderConfig` block must be:

```typescript
  const adapterConfig = runtimeToAdapterConfig(llmConfig);
  // then pass adapterConfig to callVisionModel instead of the manual object
```

---

## 7. `src/workers/smart-upload-worker.ts` — Deduplicate Config

1. Delete the local `LLMConfig` interface and `loadLLMConfig` function.
2. Add import: `import { loadLLMConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';`
3. In `processSecondPass`, replace `const adapterConfig = { llm_provider: ..., llm_endpoint_url: config.ollamaEndpoint, ... }` with: `const adapterConfig = runtimeToAdapterConfig(llmConfig);`
4. Replace the manual `callVerificationLLM` raw-fetch implementation with a call to the shared `callVisionModel` from `@/lib/llm` — the adapter pattern already handles all providers correctly and includes retry logic.

```typescript
// NEW callVerificationLLM replacement in smart-upload-worker.ts
async function callVerificationLLMShared(
  pageImages: string[],
  cfg: LLMRuntimeConfig,
  prompt: string
): Promise<ExtractedMetadata> {
  await llmRateLimiter.consume();
  const adapterConfig = runtimeToAdapterConfig(cfg);
  const images = pageImages.map((d) => ({ mimeType: 'image/png', base64Data: d }));
  const response = await callVisionModel(adapterConfig, images, prompt, {
    maxTokens: 4096,
    temperature: 0.1,
  });
  return parseVerificationResponse(response.content);
}
```

Where `parseVerificationResponse` strips fences and parses JSON defensively (same pattern as section 6d above).

---

## 8. `src/app/api/admin/uploads/second-pass/route.ts` — Deduplicate Config + Align Keys

1. Delete the local `loadLLMConfig` and `SecondPassLLMConfig` interface.
2. Import from config-loader: `import { loadLLMConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';`
3. In `POST`, replace `const llmConfig = await loadLLMConfig()` (same import).
4. Replace manual endpoint switch with `runtimeToAdapterConfig(llmConfig)` for all `callVisionModel` calls.
5. Key fix: the existing code reads `llm_rate_limit_rpm` but config-loader exposes `rateLimit` — update references.

---

## 9. `src/app/api/admin/uploads/settings/test/route.ts` — Respect Endpoint Override

The test route currently ignores the `endpoint` parameter for OpenAI and OpenRouter. Fix:

```typescript
case 'openai': {
  const base = (endpoint?.trim() || getDefaultEndpointForProvider('openai')).replace(/\/$/, '');
  testUrl = `${base}/models`;
  if (apiKey) testHeaders['Authorization'] = `Bearer ${apiKey}`;
  break;
}

case 'anthropic': {
  const base = (endpoint?.trim() || getDefaultEndpointForProvider('anthropic')).replace(/\/$/, '');
  testUrl = `${base}/v1/models`;
  if (apiKey) {
    testHeaders['x-api-key'] = apiKey;
    testHeaders['anthropic-version'] = '2023-06-01';
  }
  break;
}

case 'gemini': {
  const base = (endpoint?.trim() || getDefaultEndpointForProvider('gemini')).replace(/\/$/, '');
  const key = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  testUrl = `${base}/models${key}`;
  break;
}

case 'openrouter': {
  const base = (endpoint?.trim() || getDefaultEndpointForProvider('openrouter')).replace(/\/$/, '');
  testUrl = `${base}/models`;
  if (apiKey) testHeaders['Authorization'] = `Bearer ${apiKey}`;
  break;
}
```

Add at top of the file: `import { getDefaultEndpointForProvider } from '@/lib/llm/providers';`

---

## 10. `src/components/admin/music/smart-upload-settings-form.tsx` — Auto-populate Endpoints

### 10a. Update imports and constants

Replace the inline `LLM_PROVIDERS` constant with the canonical import:

```typescript
import { LLM_PROVIDERS, getDefaultEndpointForProvider } from '@/lib/llm/providers';
import type { LLMProviderValue } from '@/lib/llm/providers';
```

Remove the old `LLM_PROVIDERS` array defined in the file.

Remove the local `type ProviderValue = ...` — use `LLMProviderValue` from providers.

### 10b. Fix `defaultValues` initialisation

```typescript
// Computed once before useForm
const savedProvider = (settings['llm_provider'] ?? 'ollama') as LLMProviderValue;
const savedEndpoint =
  settings['llm_endpoint_url'] ||
  settings['llm_ollama_endpoint'] ||
  getDefaultEndpointForProvider(savedProvider);

const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    llm_provider: savedProvider,
    llm_endpoint_url: savedEndpoint,
    llm_vision_model:
      settings['llm_vision_model'] ||
      LLM_PROVIDERS.find((p) => p.value === savedProvider)?.defaultVisionModel ||
      'llama3.2-vision',
    llm_verification_model:
      settings['llm_verification_model'] ||
      LLM_PROVIDERS.find((p) => p.value === savedProvider)?.defaultVerificationModel ||
      'qwen2.5:7b',
    // … rest of fields unchanged
  },
});
```

### 10c. Fix `handleProviderChange` — fill endpoint for ALL providers

```typescript
const handleProviderChange = (value: LLMProviderValue) => {
  form.setValue('llm_provider', value);
  const meta = LLM_PROVIDERS.find((p) => p.value === value);
  if (!meta) return;

  // Always populate the endpoint with the provider default
  if (value === 'custom') {
    form.setValue('llm_endpoint_url', '');
  } else {
    form.setValue('llm_endpoint_url', meta.defaultEndpoint);
  }

  // Populate default models
  if (meta.defaultVisionModel) form.setValue('llm_vision_model', meta.defaultVisionModel);
  if (meta.defaultVerificationModel) form.setValue('llm_verification_model', meta.defaultVerificationModel);
};
```

### 10d. Update `restoreDefaults`

```typescript
const restoreDefaults = () => {
  const currentProvider = form.getValues('llm_provider') as LLMProviderValue;
  const meta = LLM_PROVIDERS.find((p) => p.value === currentProvider);
  form.setValue('llm_endpoint_url', meta?.defaultEndpoint ?? '');
  form.setValue('llm_vision_model', meta?.defaultVisionModel ?? 'llama3.2-vision');
  form.setValue('llm_verification_model', meta?.defaultVerificationModel ?? 'qwen2.5:7b');
  form.setValue('smart_upload_confidence_threshold', 70);
  form.setValue('smart_upload_auto_approve_threshold', 90);
  form.setValue('smart_upload_rate_limit_rpm', 10);
  form.setValue('smart_upload_max_concurrent', 3);
  form.setValue('smart_upload_max_pages', 20);
  form.setValue('smart_upload_max_file_size_mb', 50);
  form.setValue('smart_upload_allowed_mime_types', JSON.stringify(['application/pdf']));
  form.setValue('vision_model_params', JSON.stringify({ temperature: 0.1, max_tokens: 4000 }));
  form.setValue('verification_model_params', JSON.stringify({ temperature: 0.1, max_tokens: 4000 }));
  toast.info('Defaults restored. Click Save to apply.');
};
```

### 10e. Endpoint field — helpful description

```tsx
<FormDescription>
  {provider === 'custom'
    ? 'Enter the base URL of your OpenAI-compatible server (no trailing slash).'
    : `Pre-configured for ${providerConfig?.label}. Edit only if using a proxy or self-hosted mirror.`
  }
</FormDescription>
```

### 10f. Show API key fields only for providers that need them

Wrap the `SECRET_KEYS.map(...)` section so that only the key relevant to the current provider is shown by default, with an "Advanced" toggle to reveal others:

```tsx
{/* Show only the active provider's key prominently; others in Advanced */}
{SECRET_KEYS
  .filter(({ key }) => {
    if (provider === 'openai')     return key === 'llm_openai_api_key';
    if (provider === 'anthropic')  return key === 'llm_anthropic_api_key';
    if (provider === 'openrouter') return key === 'llm_openrouter_api_key';
    if (provider === 'gemini')     return key === 'llm_gemini_api_key';
    if (provider === 'custom')     return key === 'llm_custom_api_key';
    return false;  // ollama: no key
  })
  .map(({ key, label, placeholder }) => (
    <FormField key={key} ... />
  ))
}
```

---

## 11. `prisma/seed.ts` — Provider-Aware Endpoint Default

Replace the `llm_endpoint_url` seed row:

```typescript
import { getDefaultEndpointForProvider } from '../src/lib/llm/providers';

// Inside the seed function, before the defaultSettings array:
const seedProvider = process.env.LLM_PROVIDER || 'ollama';
const seedEndpoint =
  process.env.LLM_ENDPOINT_URL ||
  (seedProvider === 'ollama'
    ? process.env.LLM_OLLAMA_ENDPOINT || 'http://localhost:11434'
    : getDefaultEndpointForProvider(seedProvider));

// Then in the array:
{
  key: 'llm_endpoint_url',
  value: seedEndpoint,
  description: 'Base URL for the configured LLM provider. Auto-populated from LLM_PROVIDER default when not set.',
},
```

---

## 12. `src/lib/services/cutting-instructions.ts` — Export `generateUniqueFilename`

Verify the function `generateUniqueFilename` is exported (it's imported in `second-pass/route.ts`). If missing, add:

```typescript
export function generateUniqueFilename(baseName: string, existingNames: Set<string>): string {
  let candidate = baseName;
  let counter = 1;
  while (existingNames.has(candidate)) {
    candidate = `${baseName}_${counter}`;
    counter++;
  }
  existingNames.add(candidate);
  return candidate;
}
```

---

## 13. `src/app/api/admin/uploads/events/route.ts` — SSE Live Progress (NEW FILE)

Create a Server-Sent Events endpoint so the upload page can replace polling with a real-time stream. BullMQ's `QueueEvents` API is used.

```typescript
// src/app/api/admin/uploads/events/route.ts
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { MUSIC_UPLOAD } from '@/lib/auth/permission-constants';
import { getQueue } from '@/lib/jobs/queue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const hasPerm = await checkUserPermission(session.user.id, MUSIC_UPLOAD);
  if (!hasPerm) return new Response('Forbidden', { status: 403 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) return new Response('sessionId required', { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send('connected', { sessionId });

      // Poll job status every 1.5 s and emit progress until terminal state
      let attempts = 0;
      const MAX_POLL = 120; // 3 minutes max
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > MAX_POLL) {
          send('timeout', { sessionId });
          clearInterval(poll);
          controller.close();
          return;
        }
        try {
          const { prisma } = await import('@/lib/db');
          const s = await prisma.smartUploadSession.findUnique({
            where: { uploadSessionId: sessionId },
            select: {
              parseStatus: true,
              secondPassStatus: true,
              confidenceScore: true,
              routingDecision: true,
              autoApproved: true,
            },
          });
          if (!s) {
            send('error', { message: 'Session not found' });
            clearInterval(poll);
            controller.close();
            return;
          }
          send('progress', s);
          const done =
            s.parseStatus === 'PARSED' ||
            s.parseStatus === 'PARSE_FAILED' ||
            s.secondPassStatus === 'COMPLETE' ||
            s.secondPassStatus === 'FAILED';
          if (done) {
            send('done', s);
            clearInterval(poll);
            controller.close();
          }
        } catch (err) {
          logger.warn('SSE poll error', { err });
        }
      }, 1_500);

      req.signal.addEventListener('abort', () => {
        clearInterval(poll);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

---

## 14. `src/app/(admin)/admin/uploads/page.tsx` — SSE Progress

Replace the current polling approach with SSE for each active upload. Find the section that polls `/api/admin/uploads/status` and replace with:

```typescript
function subscribeToUploadProgress(
  sessionId: string,
  onProgress: (data: Record<string, unknown>) => void,
  onDone: (data: Record<string, unknown>) => void,
  onError: (msg: string) => void
): () => void {
  const es = new EventSource(`/api/admin/uploads/events?sessionId=${sessionId}`);
  es.addEventListener('progress', (e) => onProgress(JSON.parse(e.data)));
  es.addEventListener('done', (e) => { onDone(JSON.parse(e.data)); es.close(); });
  es.addEventListener('error', () => { onError('Connection error'); es.close(); });
  es.addEventListener('timeout', () => { onError('Processing timed out'); es.close(); });
  return () => es.close();
}
```

Call inside `useEffect` once a `sessionId` is returned from the upload POST, and clean up in the effect's return.

---

## 15. `src/app/(admin)/admin/uploads/review/page.tsx` — Review UI Improvements

The review page (1321 lines) needs these targeted patches:

### 15a. Show gap warnings

In the session detail panel, after rendering the parts list, add:

```tsx
{session.extractedMetadata?.notes && (
  <Alert variant="destructive" className="mt-2">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{session.extractedMetadata.notes}</AlertDescription>
  </Alert>
)}
```

### 15b. Per-part page count badge

In the parts table, add a "Pages" column:

```tsx
<TableHead>Pages</TableHead>
...
<TableCell>
  {part.pageCount ?? `${part.pageRange[1] - part.pageRange[0] + 1}`}
</TableCell>
```

### 15c. Confidence colour coding

Replace static badge with colour-coded variant:

```tsx
function confidenceBadge(score: number | null) {
  if (score === null) return <Badge variant="outline">Unknown</Badge>;
  if (score >= 85) return <Badge className="bg-green-100 text-green-800">{score}%</Badge>;
  if (score >= 60) return <Badge className="bg-yellow-100 text-yellow-800">{score}%</Badge>;
  return <Badge variant="destructive">{score}%</Badge>;
}
```

### 15d. "Re-run AI" Button

For sessions with `parseStatus === 'PARSE_FAILED'` or `secondPassStatus === 'FAILED'`, add an action button that POSTs to `/api/admin/uploads/second-pass` to re-trigger:

```tsx
{(session.parseStatus === 'PARSE_FAILED' || session.secondPassStatus === 'FAILED') && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => handleRerunAI(session.id)}
    disabled={rerunLoading}
  >
    {rerunLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
    Re-run AI
  </Button>
)}
```

---

## 16. `env.example` — All Provider Endpoints Documented

Add this block after the existing LLM_OLLAMA_ENDPOINT line:

```dotenv
# ------------------------------------------------------------------------------
# LLM CONFIGURATION (Smart Upload)
# The admin UI auto-populates the Endpoint URL when you select a provider.
# You only need to set the API key for your chosen provider.
# ------------------------------------------------------------------------------
# Provider selection: ollama | openai | anthropic | gemini | openrouter | custom
LLM_PROVIDER="ollama"

# --- Ollama (local, free) ---
LLM_OLLAMA_ENDPOINT="http://localhost:11434"

# --- OpenAI ---
# Endpoint: https://api.openai.com/v1  (auto-configured in UI)
# LLM_OPENAI_API_KEY="sk-..."

# --- Anthropic ---
# Endpoint: https://api.anthropic.com  (auto-configured in UI)
# LLM_ANTHROPIC_API_KEY="sk-ant-..."

# --- Google Gemini ---
# Endpoint: https://generativelanguage.googleapis.com/v1beta  (auto-configured)
# LLM_GEMINI_API_KEY="AIza..."

# --- OpenRouter (200+ free & paid models) ---
# Endpoint: https://openrouter.ai/api/v1  (auto-configured in UI)
# LLM_OPENROUTER_API_KEY="sk-or-..."

# --- Custom OpenAI-compatible endpoint ---
# LLM_CUSTOM_BASE_URL="https://your-server.example.com/v1"
# LLM_CUSTOM_API_KEY="your-key"

# Models (auto-populated from provider defaults — override only if needed)
LLM_VISION_MODEL="llama3.2-vision"
LLM_VERIFICATION_MODEL="qwen2.5:7b"

# Endpoint URL override (takes priority over provider defaults when set)
# LLM_ENDPOINT_URL=""
```

---

## 17. `docs/SMART_UPLOAD.md` — Provider Reference Table

Add or replace the "Supported Providers" section:

```markdown
## Supported LLM Providers

The Endpoint URL is **automatically populated** in Admin → Smart Upload Settings when you
select a provider. You never need to look up or type these URLs manually.

| Provider | Default Endpoint | Best Vision Model | Free Tier |
|----------|-----------------|-------------------|-----------|
| Ollama (local) | `http://localhost:11434` | `llama3.2-vision` | ✅ Yes — runs locally |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | ❌ Paid |
| Anthropic | `https://api.anthropic.com` | `claude-3-5-sonnet-20241022` | ❌ Paid |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash-exp` | ✅ Generous free tier |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-exp:free` | ✅ Free models available |
| Custom | _(user-supplied)_ | _(user-supplied)_ | Depends |

### Recommended Providers for Sheet Music

1. **Best accuracy**: `gpt-4o` (OpenAI) — excellent at reading typography and musical notation.
2. **Best free option**: `gemini-2.0-flash-exp` via OpenRouter or Gemini directly.
3. **Most private**: Ollama with `llama3.2-vision` — runs entirely on your server.

### Getting API Keys

- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [console.anthropic.com/keys](https://console.anthropic.com/keys)
- **Gemini**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **OpenRouter**: [openrouter.ai/keys](https://openrouter.ai/keys) — one key, access to 200+ models
```

---

## 18. Tests

### 18a. `src/lib/llm/__tests__/providers.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { getDefaultEndpointForProvider, LLM_PROVIDERS } from '../providers';

describe('getDefaultEndpointForProvider', () => {
  it.each([
    ['ollama',      'http://localhost:11434'],
    ['openai',      'https://api.openai.com/v1'],
    ['anthropic',   'https://api.anthropic.com'],
    ['gemini',      'https://generativelanguage.googleapis.com/v1beta'],
    ['openrouter',  'https://openrouter.ai/api/v1'],
    ['custom',      ''],
    ['unknown',     ''],
  ])('provider=%s → %s', (provider, expected) => {
    expect(getDefaultEndpointForProvider(provider)).toBe(expected);
  });

  it('every non-custom provider has a non-empty defaultEndpoint', () => {
    for (const p of LLM_PROVIDERS.filter((p) => p.value !== 'custom')) {
      expect(p.defaultEndpoint).toBeTruthy();
    }
  });
});
```

### 18b. `src/lib/llm/__tests__/config-loader.test.ts` (NEW)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLLMConfig } from '../config-loader';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    systemSetting: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

function mockDb(rows: Record<string, string>) {
  vi.mocked(prisma.systemSetting.findMany).mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({
      id: key,
      key,
      value,
      description: null,
      updatedAt: new Date(),
      updatedBy: null,
      createdAt: new Date(),
    }))
  );
}

describe('loadLLMConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses llm_endpoint_url from DB when set', async () => {
    mockDb({ llm_provider: 'openai', llm_endpoint_url: 'https://my-proxy.example.com/v1' });
    const cfg = await loadLLMConfig();
    expect(cfg.endpointUrl).toBe('https://my-proxy.example.com/v1');
  });

  it('falls back to provider default when llm_endpoint_url is absent', async () => {
    mockDb({ llm_provider: 'openai' });
    const cfg = await loadLLMConfig();
    expect(cfg.endpointUrl).toBe('https://api.openai.com/v1');
  });

  it('uses Ollama env var when provider is ollama and no DB endpoint', async () => {
    mockDb({ llm_provider: 'ollama' });
    process.env.LLM_OLLAMA_ENDPOINT = 'http://gpu-box:11434';
    const cfg = await loadLLMConfig();
    expect(cfg.endpointUrl).toBe('http://gpu-box:11434');
    delete process.env.LLM_OLLAMA_ENDPOINT;
  });

  it('returns empty string for custom provider with no endpoint', async () => {
    mockDb({ llm_provider: 'custom' });
    const cfg = await loadLLMConfig();
    expect(cfg.endpointUrl).toBe('');
  });

  it('parses vision model params JSON correctly', async () => {
    mockDb({
      llm_provider: 'ollama',
      vision_model_params: '{"temperature":0.05,"max_tokens":2048}',
    });
    const cfg = await loadLLMConfig();
    expect(cfg.visionModelParams).toEqual({ temperature: 0.05, max_tokens: 2048 });
  });

  it('returns empty object for malformed model params JSON', async () => {
    mockDb({ llm_provider: 'ollama', vision_model_params: '{bad json' });
    const cfg = await loadLLMConfig();
    expect(cfg.visionModelParams).toEqual({});
  });
});
```

### 18c. `src/lib/llm/__tests__/adapters.test.ts` — Patch Existing

In the Anthropic adapter test, verify configurable endpoint:

```typescript
it('should use custom endpoint for Anthropic when provided', () => {
  const cfg = { ...mockConfig, llm_provider: 'anthropic' as const, llm_anthropic_api_key: 'ant-key', llm_endpoint_url: 'https://proxy.example.com' };
  const result = new AnthropicAdapter().buildRequest(cfg, { images: [], prompt: 'test' });
  expect(result.url).toBe('https://proxy.example.com/v1/messages');
});

it('should use custom endpoint for Gemini when provided', () => {
  const cfg = { ...mockConfig, llm_provider: 'gemini' as const, llm_gemini_api_key: 'gemini-key', llm_endpoint_url: 'https://gemini-proxy.example.com/v1beta' };
  const result = new GeminiAdapter().buildRequest(cfg, { images: [], prompt: 'test' });
  expect(result.url).toContain('https://gemini-proxy.example.com/v1beta/models/');
});
```

### 18d. Cutting Instructions — Gap Detection Test

In `src/lib/services/__tests__/cutting-instructions.test.ts` (or create it), add:

```typescript
import { describe, it, expect } from 'vitest';
import { buildGapInstructions } from '../cutting-instructions';

// Note: export buildGapInstructions from the module first

describe('buildGapInstructions', () => {
  it('detects a gap in the middle', () => {
    const instructions = [
      { partName: 'Part A', instrument: 'Flute', section: 'Woodwinds', transposition: 'C', partNumber: 1, pageRange: [1, 4] as [number, number] },
      { partName: 'Part B', instrument: 'Oboe', section: 'Woodwinds', transposition: 'C', partNumber: 2, pageRange: [7, 10] as [number, number] },
    ];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([5, 6]);
  });

  it('returns empty array when all pages are covered', () => {
    const instructions = [
      { partName: 'Only Part', instrument: 'Full Score', section: 'Score', transposition: 'C', partNumber: 1, pageRange: [1, 10] as [number, number] },
    ];
    expect(buildGapInstructions(instructions, 10)).toHaveLength(0);
  });

  it('detects gap at start', () => {
    const instructions = [
      { partName: 'Part', instrument: 'Trumpet', section: 'Brass', transposition: 'Bb', partNumber: 1, pageRange: [3, 10] as [number, number] },
    ];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps[0].pageRange).toEqual([1, 2]);
  });
});
```

Make sure to `export` the `buildGapInstructions` function from `cutting-instructions.ts`.

---

## 19. Verification Checklist

Run these steps after completing all changes above.

### Build & Type Check

```bash
npm run build
# Must complete without TypeScript errors.
# Check in particular: providers.ts, config-loader.ts, all three loadLLMConfig callers.
```

### Unit Tests

```bash
npm run test
# Must pass all suites including new ones:
# src/lib/llm/__tests__/providers.test.ts
# src/lib/llm/__tests__/config-loader.test.ts
# src/lib/services/__tests__/cutting-instructions.test.ts (gap detection)
```

### Linting

```bash
npm run lint
# Fix any import-order or no-unused-vars warnings introduced.
```

### Manual UI Checks (with dev server running)

1. Navigate to **Admin → Smart Upload Settings**.
2. Select each provider in the dropdown — **Endpoint URL field must auto-populate**:
   - Ollama → `http://localhost:11434`
   - OpenAI → `https://api.openai.com/v1`
   - Anthropic → `https://api.anthropic.com`
   - Gemini → `https://generativelanguage.googleapis.com/v1beta`
   - OpenRouter → `https://openrouter.ai/api/v1`
   - Custom → _(empty field)_
3. Click **Test Connection** for all providers with valid API keys — must not 404; must use the correct endpoint.
4. Save settings → reload page → verify saved endpoint is pre-populated for each provider.
5. Click **Restore Defaults** — endpoint must match the current provider's default, not always Ollama.

### End-to-End Upload Test

1. Upload a multi-part concert band PDF (e.g. a full set of parts).
2. Watch the progress indicator (now SSE-driven) update in real-time.
3. In the Review page, confirm:
   - Parts list shows correct page count per part.
   - No gap warnings unless the AI left uncovered pages.
   - Confidence score is colour coded.
4. Click **Approve** → MusicPiece + MusicFiles + MusicParts must appear in the music library.
5. Upload an ambiguous PDF (low confidence) → session must route to second pass, then land in review.

### Database Seed Verification

```bash
LLM_PROVIDER=openai npm run db:generate  # or ts-node prisma/seed.ts
# Confirm system_setting row for llm_endpoint_url = 'https://api.openai.com/v1'

LLM_PROVIDER=ollama npm run db:generate
# Confirm system_setting row for llm_endpoint_url = 'http://localhost:11434'
```

---

## 20. Priority Order for Implementation

Execute in this order to minimise broken states:

1. ✅ Create `src/lib/llm/providers.ts`
2. ✅ Create `src/lib/llm/config-loader.ts`
3. ✅ Patch `src/lib/llm/types.ts` (add geminiApiKey)
4. ✅ Patch all four LLM adapters (openai, anthropic, gemini, openrouter)
5. ✅ Patch `src/lib/llm/index.ts` (retry + timeout)
6. ✅ Patch `src/lib/services/pdf-renderer.ts` (scale + batch)
7. ✅ Patch `src/workers/smart-upload-processor.ts` (import config-loader, smart sampling, expert prompt, robust parse, gap detection)
8. ✅ Patch `src/workers/smart-upload-worker.ts` (import config-loader, shared callVisionModel)
9. ✅ Patch `src/app/api/admin/uploads/second-pass/route.ts` (import config-loader)
10. ✅ Patch `src/app/api/admin/uploads/settings/test/route.ts` (endpoint-aware)
11. ✅ Patch `src/components/admin/music/smart-upload-settings-form.tsx` (auto-populate)
12. ✅ Patch `prisma/seed.ts` (provider-aware endpoint)
13. ✅ Patch `src/lib/services/cutting-instructions.ts` (export buildGapInstructions)
14. ✅ Create `src/app/api/admin/uploads/events/route.ts` (SSE)
15. ✅ Patch `src/app/(admin)/admin/uploads/page.tsx` (SSE client)
16. ✅ Patch `src/app/(admin)/admin/uploads/review/page.tsx` (gap alerts, re-run button, confidence colours)
17. ✅ Update `env.example` and `docs/SMART_UPLOAD.md`
18. ✅ Write all tests listed in §18
19. ✅ Run full verification matrix (§19)
