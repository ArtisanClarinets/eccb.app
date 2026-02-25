import { logger } from '@/lib/logger';
import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { OpenRouterAdapter } from './openrouter';

/**
 * Adapter factory - returns the appropriate adapter for the provider
 * SECURITY: Each adapter uses provider-specific API keys to prevent
 * sending keys to the wrong provider (e.g., OpenRouter keys to OpenAI)
 */
export function getAdapter(provider: string): LLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter();
    case 'anthropic':
      return new AnthropicAdapter();
    case 'gemini':
      return new GeminiAdapter();
    case 'openrouter':
      return new OpenRouterAdapter();
    case 'custom':
      // Custom providers use OpenAI-compatible format
      return new OpenAIAdapter();
    case 'ollama':
      // Ollama uses OpenAI-compatible format
      return new OpenAIAdapter();
    default:
      logger.warn(`Unknown LLM provider: ${provider}, defaulting to OpenAI`);
      return new OpenAIAdapter();
  }
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;

/**
 * Unified function to call vision models.
 * Handles provider-specific request/response formatting.
 * Includes automatic retry with exponential backoff (rate-limit + transient errors)
 * and a 90-second per-attempt timeout.
 */
export async function callVisionModel(
  config: LLMConfig,
  images: Array<{ mimeType: string; base64Data: string }>,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
  }
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
          logger.warn('LLM rate limited, retrying', {
            status: response.status,
            waitMs: wait,
            attempt,
          });
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(
          `LLM call failed: ${response.status} ${response.statusText} — ${errorText.slice(0, 300)}`
        );
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
        logger.warn('LLM call failed, retrying', {
          error: lastError.message,
          waitMs: wait,
          attempt,
        });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    }
  }

  throw lastError ?? new Error('LLM call failed after all retries');
}

// Re-export types
export type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';
export { OpenAIAdapter } from './openai';
export { AnthropicAdapter } from './anthropic';
export { GeminiAdapter } from './gemini';
export { OpenRouterAdapter } from './openrouter';
