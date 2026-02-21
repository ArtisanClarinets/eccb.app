/**
 * Dynamic AI Provider
 *
 * This module provides AI operations that use task-specific model configurations
 * from the database rather than hardcoded environment variables.
 *
 * This is the preferred way for Smart Upload pipeline to make AI calls.
 */

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getModelForTask } from '@/lib/services/smart-upload-settings';
import { UploadTaskType } from '@/lib/db';
import { getProviderConfig } from './provider-config';

import {
  StructuredExtractionResult,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ChatCompletionChoice,
  Usage,
} from './types';

// =============================================================================
// Types
// =============================================================================

export interface DynamicAIConfig {
  modelId: string;
  providerId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  apiKey: string;
  baseUrl: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 30000;

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Get AI configuration for a specific task type.
 * This is a convenience wrapper around getModelForTask.
 */
export async function getAIConfigForTask(
  taskType: UploadTaskType
): Promise<DynamicAIConfig | null> {
  const result = await getModelForTask(taskType);

  if (!result) {
    logger.error('No AI configuration available for task', { taskType });
    return null;
  }

  return {
    modelId: result.modelId,
    providerId: result.providerId,
    temperature: result.temperature,
    maxTokens: result.maxTokens,
    topP: result.topP,
    apiKey: result.apiKey,
    baseUrl: result.baseUrl,
  };
}

/**
 * Generate structured output using task-specific model configuration.
 *
 * @param taskType - The task type to get model config for
 * @param prompt - The user prompt
 * @param schema - Zod schema for validation
 * @param systemPrompt - Optional system prompt
 * @returns The structured extraction result
 */
export async function generateStructuredOutputForTask<T>(
  taskType: UploadTaskType,
  prompt: string,
  schema: z.ZodSchema<T>,
  systemPrompt?: string
): Promise<StructuredExtractionResult<T>> {
  const config = await getAIConfigForTask(taskType);

  if (!config) {
    return {
      data: null,
      error: `No AI configuration available for task: ${taskType}`,
      rawResponse: '',
    };
  }

  return generateStructuredOutputWithConfig(config, prompt, schema, systemPrompt);
}

/**
 * Generate structured output with a specific configuration.
 *
 * @param config - The AI configuration to use
 * @param prompt - The user prompt
 * @param schema - Zod schema for validation
 * @param systemPrompt - Optional system prompt
 * @returns The structured extraction result
 */
export async function generateStructuredOutputWithConfig<T>(
  config: DynamicAIConfig,
  prompt: string,
  schema: z.ZodSchema<T>,
  systemPrompt?: string
): Promise<StructuredExtractionResult<T>> {
  try {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const request: ChatCompletionRequest = {
      messages,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      top_p: config.topP,
    };

    const response = await makeChatCompletion(config, request);

    // Check for error - if choices is empty, there was an error
    if (!response.choices || response.choices.length === 0) {
      return {
        data: null,
        error: 'No response from AI provider',
        rawResponse: '',
      };
    }

    // Extract content from response
    const content = response.choices[0]?.message?.content || '';

    // Try to parse as JSON
    let parsed: unknown;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content;

      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to repair common JSON issues
      const repaired = repairJson(content);
      try {
        parsed = JSON.parse(repaired);
      } catch {
        return {
          data: null,
          error: 'Failed to parse AI response as JSON',
          rawResponse: content,
        };
      }
    }

    // Validate against schema
    const validationResult = schema.safeParse(parsed);

    if (!validationResult.success) {
      return {
        data: null,
        error: `Schema validation failed: ${validationResult.error.message}`,
        rawResponse: content,
      };
    }

    return {
      data: validationResult.data,
      error: null,
      rawResponse: content,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Structured output generation failed', {
      error: errorMessage,
      taskType: config.providerId,
      modelId: config.modelId,
    });

    return {
      data: null,
      error: errorMessage,
      rawResponse: '',
    };
  }
}

/**
 * Make a chat completion request with a specific configuration.
 *
 * @param config - The AI configuration to use
 * @param request - The chat completion request
 * @returns The chat completion response
 */
export async function makeChatCompletion(
  config: DynamicAIConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const providerConfig = getProviderConfig(config.providerId);

  if (!providerConfig) {
    // Return empty response for unknown provider
    return {
      id: '',
      object: 'chat.completion',
      created: Date.now(),
      model: config.modelId,
      choices: [],
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Set up authentication headers based on provider format
    if (providerConfig.headerFormat === 'bearer') {
      headers[providerConfig.apiKeyHeaderName] = `Bearer ${config.apiKey}`;
    } else {
      headers[providerConfig.apiKeyHeaderName] = config.apiKey;
    }

    // Add Anthropic-specific headers
    if (config.providerId === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }

    // Build request body based on provider
    const body = buildRequestBody(config, request, providerConfig);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.warn('AI provider request failed', {
        status: response.status,
        statusText: response.statusText,
        errorData,
      });

      // Return empty response on error
      return {
        id: '',
        object: 'chat.completion',
        created: Date.now(),
        model: config.modelId,
        choices: [],
      };
    }

    const data = await response.json();

    // Parse response based on provider
    return parseResponse(data, config.providerId, config.modelId);
  } catch (error) {
    logger.error('Chat completion request failed', {
      providerId: config.providerId,
      modelId: config.modelId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return empty response on error
    return {
      id: '',
      object: 'chat.completion',
      created: Date.now(),
      model: config.modelId,
      choices: [],
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build the request body for a chat completion request.
 */
function buildRequestBody(
  config: DynamicAIConfig,
  request: ChatCompletionRequest,
  providerConfig: ReturnType<typeof getProviderConfig>
): Record<string, unknown> {
  const baseBody: Record<string, unknown> = {
    model: config.modelId,
    messages: request.messages,
    temperature: request.temperature ?? config.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: request.max_tokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  if (request.top_p !== undefined || config.topP !== undefined) {
    baseBody.top_p = request.top_p ?? config.topP;
  }

  // Add response format for providers that support structured output
  if (providerConfig?.supportsStructuredOutput) {
    baseBody.response_format = { type: 'json_object' };
  }

  return baseBody;
}

/**
 * Parse the response from a chat completion request.
 */
function parseResponse(
  data: unknown,
  providerId: string,
  modelId: string
): ChatCompletionResponse {
  // Most providers use OpenAI-compatible response format
  const openaiData = data as {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: Array<{
      index?: number;
      message?: {
        content?: string;
        role?: string;
      };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    error?: {
      message?: string;
    };
  };

  if (openaiData.error) {
    // Return empty response on error
    return {
      id: openaiData.id || '',
      object: openaiData.object || 'chat.completion',
      created: openaiData.created || Date.now(),
      model: openaiData.model || modelId,
      choices: [],
    };
  }

  const choices: ChatCompletionChoice[] = (openaiData.choices || []).map((choice, index) => ({
    index,
    message: {
      role: (choice.message?.role || 'assistant') as 'assistant' | 'user' | 'system',
      content: (choice.message?.content as string) || '',
    },
    finish_reason: (choice.finish_reason || 'stop') as 'stop' | 'length' | 'tool_calls' | 'content_filter' | null,
  }));

  let usage: Usage | undefined;
  if (openaiData.usage) {
    usage = {
      prompt_tokens: openaiData.usage.prompt_tokens || 0,
      completion_tokens: openaiData.usage.completion_tokens || 0,
      total_tokens: openaiData.usage.total_tokens || 0,
    };
  }

  return {
    id: openaiData.id || '',
    object: openaiData.object || 'chat.completion',
    created: openaiData.created || Date.now(),
    model: openaiData.model || modelId,
    choices,
    usage,
  };
}

/**
 * Attempt to repair common JSON errors.
 */
function repairJson(raw: string): string {
  let repaired = raw.trim();

  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Fix unquoted property names
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes
  repaired = repaired.replace(/'/g, '"');

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  repaired = repaired.replace(/[\x00-\x1F\x7F]/g, '');

  return repaired;
}

// =============================================================================
// Convenience Functions for Smart Upload Pipeline
// =============================================================================

/**
 * Extract music metadata from text using the configured METADATA_EXTRACTION task.
 */
export async function extractMusicMetadataWithConfig(
  text: string,
  systemPrompt: string,
  schema: z.ZodSchema<unknown>
): Promise<StructuredExtractionResult<unknown>> {
  return generateStructuredOutputForTask(
    UploadTaskType.METADATA_EXTRACTION,
    text,
    schema,
    systemPrompt
  );
}

/**
 * Classify document using the configured CLASSIFICATION task.
 */
export async function classifyDocumentWithConfig(
  text: string,
  systemPrompt: string,
  schema: z.ZodSchema<unknown>
): Promise<StructuredExtractionResult<unknown>> {
  return generateStructuredOutputForTask(
    UploadTaskType.CLASSIFICATION,
    text,
    schema,
    systemPrompt
  );
}

/**
 * Summarize content using the configured SUMMARIZATION task.
 */
export async function summarizeWithConfig(
  text: string,
  systemPrompt: string,
  schema: z.ZodSchema<unknown>
): Promise<StructuredExtractionResult<unknown>> {
  return generateStructuredOutputForTask(
    UploadTaskType.SUMMARIZATION,
    text,
    schema,
    systemPrompt
  );
}
