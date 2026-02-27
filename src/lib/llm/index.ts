// src/lib/llm/index.ts
// ============================================================
// Unified LLM Service Layer
//
// Provides a single, robust entry point (`callVisionModel`) for all
// LLM vision requests. It automatically handles:
// - Dynamic provider selection based on system configuration.
// - Secure, provider-specific API key management.
// - Request/response normalization across all providers.
// - Automatic retries with exponential backoff for transient errors.
// - Per-attempt timeouts to prevent stalled requests.
// - Validation and clamping of request parameters.
// ============================================================

import {
  loadLLMConfig,
  runtimeToAdapterConfig,
  type LLMRuntimeConfig,
} from './config-loader';
import { logger } from '@/lib/logger';
import {
  type LLMAdapter,
  type LLMConfig,
  type LabeledImage,
  type VisionRequest,
  type VisionResponse,
} from './types';

// --- Constants ---
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const REQUEST_TIMEOUT_MS = 90000; // 90 seconds
const MIN_MAX_TOKENS = 64;
const MAX_MAX_TOKENS = 16384;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

// --- Helper Functions ---

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Dynamically imports and returns the adapter for the configured LLM provider.
 * This pattern ensures that only the code for the active provider is loaded.
 *
 * @param provider The configured LLM provider name.
 * @returns A promise that resolves to the provider's LLMAdapter instance.
 * @throws If the provider is unknown or the adapter module cannot be found.
 */
async function getAdapter(provider: LLMRuntimeConfig['provider']): Promise<LLMAdapter> {
  switch (provider) {
    case 'openai':
      return (await import('./openai')).adapter;
    case 'anthropic':
      return (await import('./anthropic')).adapter;
    case 'gemini':
      return (await import('./gemini')).adapter;
    case 'openrouter':
      return (await import('./openrouter')).adapter;
    case 'ollama':
      return (await import('./ollama')).adapter;
    case 'ollama-cloud':
      return (await import('./ollama-cloud')).adapter;
    case 'mistral':
      return (await import('./mistral')).adapter;
    case 'groq':
      return (await import('./groq')).adapter;
    case 'custom':
      return (await import('./custom')).adapter;
    default:
      logger.error('Unknown LLM provider configured', { provider });
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Unified function to call vision models.
 * Handles provider-specific request/response formatting, retries, and timeouts.
 *
 * @param config The LLM configuration for the request.
 * @param images An array of images to be processed.
 * @param prompt The text prompt for the vision model.
 * @param options Optional parameters for the request.
 * @returns A promise that resolves to a structured VisionResponse.
 */
export async function callVisionModel(
  config: LLMConfig,
  images: Array<{ mimeType: string; base64Data: string; label?: string }>,
  prompt: string,
  options?: {
    system?: string;
    responseFormat?: { type: 'json' | 'text' };
    labeledInputs?: LabeledImage[];
    modelParams?: Record<string, unknown>;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<VisionResponse> {
  const adapter = await getAdapter(config.llm_provider);

  // --- Parameter Validation and Clamping ---
  const inputModelParams = { ...(options?.modelParams ?? {}) };
  const paramMaxTokens = toFiniteNumber(inputModelParams.max_tokens) ?? toFiniteNumber(inputModelParams.maxTokens);
  const paramTemperature = toFiniteNumber(inputModelParams.temperature);

  const boundedMaxTokens = clamp(
    Math.round(paramMaxTokens ?? options?.maxTokens ?? 4096),
    MIN_MAX_TOKENS,
    MAX_MAX_TOKENS,
  );
  const boundedTemperature = clamp(
    paramTemperature ?? options?.temperature ?? 0.1,
    MIN_TEMPERATURE,
    MAX_TEMPERATURE,
  );

  // Apply clamped values back to modelParams for consistency
  if ('max_tokens' in inputModelParams) inputModelParams.max_tokens = boundedMaxTokens;
  if ('maxTokens' in inputModelParams) inputModelParams.maxTokens = boundedMaxTokens;
  if ('temperature' in inputModelParams) inputModelParams.temperature = boundedTemperature;

  const request: VisionRequest = {
    images,
    prompt,
    labeledInputs: options?.labeledInputs,
    system: options?.system,
    responseFormat: options?.responseFormat,
    maxTokens: boundedMaxTokens,
    temperature: boundedTemperature,
    modelParams: inputModelParams,
  };

  // --- Retry and Execution Loop ---
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { url, headers, body } = adapter.buildRequest(config, request);

      logger.debug('Calling vision LLM', {
        provider: config.llm_provider,
        model: (body as any)?.model || config.llm_vision_model,
        attempt,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
          logger.warn('LLM call failed, retrying...', { status: response.status, attempt, wait });
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`LLM API request failed: ${response.status} ${errorText.slice(0, 300)}`);
      }

      const jsonResponse = await response.json();
      const result = adapter.parseResponse(jsonResponse);

      logger.info('Vision LLM response received', {
        provider: config.llm_provider,
        usage: result.usage,
      });

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') {
        throw new Error(`LLM call timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
      }
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
        logger.warn('LLM call failed, retrying...', { error: lastError.message, attempt, wait });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastError ?? new Error('LLM call failed after all retries.');
}

/**
 * High-level convenience function that loads configuration automatically.
 * Use this when you want the system to use its currently configured provider.
 *
 * @param request The details of the vision request (prompt, images, etc.).
 * @returns A promise that resolves to a structured VisionResponse.
 */
export async function getVisionResponse(
  request: Omit<VisionRequest, 'temperature' | 'maxTokens'>,
): Promise<VisionResponse> {
  const runtimeConfig = await loadLLMConfig();
  const adapterConfig = runtimeToAdapterConfig(runtimeConfig);
  
  return callVisionModel(adapterConfig, request.images, request.prompt, {
    system: request.system,
    responseFormat: request.responseFormat,
    labeledInputs: request.labeledInputs,
    modelParams: request.modelParams,
  });
}


// --- Re-exports ---
export * from './types';
export { AnthropicAdapter } from './anthropic';
export { CustomAdapter } from './custom';
export { GeminiAdapter } from './gemini';
export { GroqAdapter } from './groq';
export { MistralAdapter } from './mistral';
export { OllamaAdapter } from './ollama';
export { OllamaCloudAdapter } from './ollama-cloud';
export { OpenAIAdapter } from './openai';
export { OpenRouterAdapter } from './openrouter';
