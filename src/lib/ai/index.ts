/**
 * AI Provider Abstraction Layer - Public Interface
 *
 * This is the main entrypoint for all AI operations in the Smart Upload feature.
 * Smart Upload code must NEVER call OpenAI/Anthropic/Gemini directly - only through this module.
 *
 * Supported providers:
 * - openai: OpenAI API
 * - anthropic: Anthropic Claude API
 * - gemini: Google Gemini API
 * - openrouter: OpenRouter aggregation
 * - openai_compat: Any OpenAI-compatible endpoint (Ollama, vLLM, etc.)
 * - kilo: KiloCode gateway
 * - custom: Custom provider with configurable base URL and headers
 */

import { z } from 'zod';

import { env } from '../env';

import {
  AIProvider,
  AIProviderId,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StructuredExtractionResult,
} from './types';
import {
  getProvider,
  getProviderId,
  getAvailableProviders,
  isProviderAvailable,
  resetProviderCache,
} from './provider-registry';
import {
  MusicMetadata,
  MusicMetadataSchema,
  MUSIC_METADATA_PROMPT,
} from './prompts/music-metadata';

import { classifyExtractedText } from './document-classification';
import {
  PartClassification,
  PartClassificationSchema,
  PART_CLASSIFICATION_PROMPT,
} from './prompts/part-classification';

import {
  DocumentClassification,
  DocumentClassificationSchema,
  DOCUMENT_CLASSIFICATION_PROMPT,
} from './prompts/document-classification';

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract music metadata from PDF text using AI
 *
 * @param text - The extracted text from the PDF
 * @returns Promise resolving to the extracted music metadata
 */
export async function extractMusicMetadata(
  text: string
): Promise<StructuredExtractionResult<MusicMetadata>> {
  const provider = getProvider();

  // Using any to bypass strict Zod type checking issues with schema inference
  return provider.generateStructuredOutput(
    text,
    MusicMetadataSchema as any,
    MUSIC_METADATA_PROMPT
  );
}

/**
 * Classify instrument parts from PDF text using AI
 *
 * @param text - The extracted text from the PDF
 * @returns Promise resolving to the part classification result
 */
export async function classifyParts(
  text: string
): Promise<StructuredExtractionResult<PartClassification>> {
  const provider = getProvider();

  return provider.generateStructuredOutput(
    text,
    PartClassificationSchema as any,
    PART_CLASSIFICATION_PROMPT
  );
}

/**
 * Generate a structured output from a custom prompt
 *
 * @param prompt - The user prompt
 * @param schema - Zod schema for the expected output
 * @param systemPrompt - Optional system prompt
 * @returns Promise resolving to the structured extraction result
 */
export async function generateStructuredOutput<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  systemPrompt?: string
): Promise<StructuredExtractionResult<T>> {
  const provider = getProvider();

  return provider.generateStructuredOutput(prompt, schema as any, systemPrompt);
}

/**
 * Generate a chat completion
 *
 * @param request - Chat completion request parameters
 * @returns Promise resolving to the chat completion response
 */
export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const provider = getProvider();

  return provider.chatCompletion(request);
}

/**
 * Generate a streaming chat completion
 *
 * @param request - Chat completion request parameters
 * @param onChunk - Callback for each chunk of the response
 */
export async function chatCompletionStream(
  request: ChatCompletionRequest,
  onChunk: (chunk: ChatCompletionResponse) => void
): Promise<void> {
  const provider = getProvider();

  return provider.chatCompletionStream(request, onChunk);
}

/**
 * Get the current AI provider
 *
 * @returns The current AI provider instance
 */
export function getAIProvider(): AIProvider {
  return getProvider();
}

/**
 * Get the current provider ID
 *
 * @returns The current provider ID
 */
export function getCurrentProviderId(): AIProviderId {
  return getProviderId();
}

/**
 * Check if a provider is available
 *
 * @param providerId - The provider ID to check
 * @returns Whether the provider is available
 */
export function isProviderConfigured(providerId: AIProviderId): boolean {
  return isProviderAvailable(providerId);
}

/**
 * Get all available providers
 *
 * @returns Array of available provider IDs
 */
export function getAIProviders(): AIProviderId[] {
  return getAvailableProviders();
}

/**
 * Check if Smart Upload AI features are enabled
 *
 * @returns Whether AI features are enabled
 */
export function isAIEnabled(): boolean {
  // AI is enabled if Smart Upload is enabled and at least one provider is available
  if (!env.SMART_UPLOAD_ENABLED) {
    return false;
  }

  return getAvailableProviders().length > 0;
}

/**
 * Reset the provider cache (useful for testing)
 */
export function resetAIProviderCache(): void {
  resetProviderCache();
}

// =============================================================================
// Types Export
// =============================================================================

export type {
  AIProvider,
  AIProviderId,
  AIProviderConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StructuredExtractionResult,
  ZodSchema,
} from './types';

// =============================================================================
// Schemas Export
// =============================================================================

export { MusicMetadataSchema, MUSIC_METADATA_PROMPT } from './prompts/music-metadata';
export type { MusicMetadata } from './prompts/music-metadata';

export { PartClassificationSchema, PART_CLASSIFICATION_PROMPT } from './prompts/part-classification';
export type { PartClassification } from './prompts/part-classification';

export { classifyExtractedText } from './document-classification';
export { DocumentClassificationSchema, DOCUMENT_CLASSIFICATION_PROMPT } from './prompts/document-classification';
export type { DocumentClassification } from './prompts/document-classification';

// =============================================================================
// Constants
// =============================================================================

/**
 * Default temperature for deterministic results
 */
export const DEFAULT_TEMPERATURE = 0.1;

/**
 * Default max tokens for responses
 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Default timeout for AI requests in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum number of retries for failed requests
 */
export const MAX_RETRIES = 3;
