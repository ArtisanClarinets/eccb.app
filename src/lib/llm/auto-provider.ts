// src/lib/llm/auto-provider.ts
// ============================================================
// Automatic LLM Provider Dispatcher
//
// Thin shim that delegates to the unified callVisionModel in @/lib/llm/index,
// which provides automatic retries, per-attempt timeouts, and parameter
// validation.  Kept as a named export for callers that imported it directly.
// ============================================================

import {
  loadLLMConfig,
  runtimeToAdapterConfig,
} from './config-loader';
import { logger } from '@/lib/logger';
import { type VisionRequest, type VisionResponse } from './types';

/**
 * Executes a vision request using the automatically selected LLM provider.
 *
 * Delegates to the unified `callVisionModel` in `@/lib/llm/index` which
 * provides automatic retries, per-attempt timeouts, and parameter clamping.
 *
 * @param request The details of the vision request (prompt, images, etc.).
 * @returns A promise that resolves to a structured VisionResponse.
 * @throws If configuration fails, the provider is invalid, or the API call fails.
 */
export async function getVisionResponse(
  request: VisionRequest,
): Promise<VisionResponse> {
  logger.info('Starting vision request (auto-provider)...');

  // Load config and delegate to the robust callVisionModel implementation
  // which adds retries, timeouts, and parameter validation.
  const runtimeConfig = await loadLLMConfig();
  const adapterConfig = runtimeToAdapterConfig(runtimeConfig);

  const { callVisionModel } = await import('./index');
  return callVisionModel(adapterConfig, request.images, request.prompt, {
    system: request.system,
    responseFormat: request.responseFormat,
    labeledInputs: request.labeledInputs,
    modelParams: request.modelParams,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });
}
