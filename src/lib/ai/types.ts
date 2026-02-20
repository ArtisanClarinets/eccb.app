/**
 * AI Provider Abstraction Layer - Type Definitions
 *
 * This module provides type definitions for the multi-provider LLM abstraction layer.
 * All AI operations should go through this interface to support multiple providers.
 */

import { z } from 'zod';

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported AI provider IDs
 */
export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'openai_compat'
  | 'kilo'
  | 'custom';

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Role of a chat message sender
 */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single message in a chat conversation
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * Request parameters for generating a chat completion
 */
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  tools?: ChatTool[];
  tool_choice?: 'none' | 'auto' | ChatToolChoice;
  response_format?: ResponseFormat;
  stream?: boolean;
}

/**
 * Tool definition for function calling
 */
export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Tool choice for function calling
 */
export interface ChatToolChoice {
  type: 'function';
  function: {
    name: string;
  };
}

/**
 * Response format for structured outputs
 */
export interface ResponseFormat {
  type: 'text' | 'json_object';
}

/**
 * Response from a chat completion
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
}

/**
 * A single choice in a chat completion response
 */
export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/**
 * Token usage information
 */
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// =============================================================================
// Structured Output Types
// =============================================================================

/**
 * Result of a structured extraction operation
 */
export interface StructuredExtractionResult<T> {
  data: T | null;
  error: string | null;
  rawResponse: string;
  usage?: Usage;
}

/**
 * Zod schema type for structured output validation
 */
export type ZodSchema<T> = z.ZodType<T>;

// =============================================================================
// Provider Configuration Types
// =============================================================================

/**
 * Configuration for an AI provider
 */
export interface AIProviderConfig {
  provider: AIProviderId;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Base interface for all AI providers
 */
export interface AIProvider {
  /**
   * The provider ID
   */
  readonly id: AIProviderId;

  /**
   * Generate a chat completion
   */
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * Generate a chat completion with streaming
   */
  chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatCompletionResponse) => void
  ): Promise<void>;

  /**
   * Generate a structured output from a prompt
   */
  generateStructuredOutput<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<StructuredExtractionResult<T>>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get the provider's configuration
   */
  getConfig(): AIProviderConfig;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error types for AI operations
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: AIProviderId,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Error when no API key is configured for a provider
 */
export class MissingAPIKeyError extends AIError {
  constructor(provider: AIProviderId, requiredEnvVar: string) {
    super(
      `No API key configured for ${provider}. Set ${requiredEnvVar} environment variable.`,
      'MISSING_API_KEY',
      provider
    );
    this.name = 'MissingAPIKeyError';
  }
}

/**
 * Error when structured output parsing fails
 */
export class ParseError extends AIError {
  constructor(
    message: string,
    provider: AIProviderId,
    public readonly rawResponse: string
  ) {
    super(message, 'PARSE_ERROR', provider);
    this.name = 'ParseError';
  }
}

/**
 * Error when rate limited by the provider
 */
export class RateLimitError extends AIError {
  constructor(provider: AIProviderId, retryAfter?: number) {
    super(
      `Rate limited by ${provider}. Please retry after ${retryAfter || 'a short wait'}.`,
      'RATE_LIMITED',
      provider,
      429,
      true
    );
    this.name = 'RateLimitError';
  }
}
