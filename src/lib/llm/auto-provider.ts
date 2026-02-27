// src/lib/llm/auto-provider.ts
// ============================================================
// Automatic LLM Provider Dispatcher
//
// This module acts as a factory and abstract interface for all
// supported LLM providers. It reads the system's configuration,
// dynamically loads the appropriate provider adapter, and executes
// the request. This pattern ensures that only the code for the
// currently configured provider is loaded into memory.
// ============================================================

import {
  loadLLMConfig,
  runtimeToAdapterConfig,
  type LLMRuntimeConfig,
} from './config-loader';
import { logger } from '@/lib/logger';
import { type VisionRequest, type VisionResponse, type LLMAdapter } from './types';

/**
 * Dynamically imports and returns the adapter for the configured LLM provider.
 *
 * @param provider The configured LLM provider name.
 * @returns A promise that resolves to the provider's LLMAdapter.
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
      // Assuming a local ollama adapter exists at './ollama.ts'
      return (await import('./ollama')).adapter;
    case 'ollama-cloud':
      return (await import('./ollama-cloud')).adapter;
    case 'mistral':
      return (await import('./mistral')).adapter;
    case 'groq':
      return (await import('./groq')).adapter;
    case 'custom':
      // Assuming a custom adapter exists for OpenAI-compatible endpoints
      return (await import('./custom')).adapter;
    default:
      logger.error('Unknown LLM provider configured', { provider });
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Executes a vision request using the automatically selected LLM provider.
 *
 * This is the primary entry point for all vision-based LLM calls. It
 * orchestrates loading the configuration, selecting the provider,
 * building the request, making the API call, and parsing the response.
 *
 * @param request The details of the vision request (prompt, images, etc.).
 * @returns A promise that resolves to a structured VisionResponse.
 * @throws If configuration fails, the provider is invalid, or the API call fails.
 */
export async function getVisionResponse(
  request: VisionRequest,
): Promise<VisionResponse> {
  logger.info('Starting vision request...');

  try {
    // 1. Load the current system-wide LLM configuration
    const runtimeConfig = await loadLLMConfig();
    const { provider } = runtimeConfig;
    logger.info(`Using LLM provider: ${provider}`);

    // 2. Dynamically load the correct adapter
    const adapter = await getAdapter(provider);

    // 3. Convert runtime config to the adapter-specific, secure config
    const adapterConfig = runtimeToAdapterConfig(runtimeConfig);

    // 4. Build the provider-specific request payload
    const { url, headers, body } = adapter.buildRequest(adapterConfig, request);

    // 5. Execute the API call
    logger.debug('Making LLM API call', { url, model: (body as any)?.model });
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('LLM API call failed', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(
        `LLM API request failed with status ${response.status}: ${errorBody}`,
      );
    }

    const jsonResponse = await response.json();

    // 6. Parse the response into a standardized format
    const visionResponse = adapter.parseResponse(jsonResponse);
    logger.info('Successfully received and parsed LLM response.', {
      usage: visionResponse.usage,
    });

    return visionResponse;
  } catch (error) {
    logger.error('Error in getVisionResponse', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Re-throw the error to be handled by the calling service
    throw error;
  }
}
