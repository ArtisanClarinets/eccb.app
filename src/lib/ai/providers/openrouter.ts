/**
 * OpenRouter Provider Implementation
 *
 * Thin wrapper around openai-compatible.
 * Adds required HTTP-Referer and X-Title headers.
 * Uses https://openrouter.ai/api/v1 as base URL.
 */

import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../../env';

import {
  AIProvider,
  AIProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StructuredExtractionResult,
  ZodSchema,
} from '../types';
import {
  parseAndValidateJson,
  withRetry,
  withTimeout,
} from '../structured-output';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter Provider
 */
export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter' as const;

  private client: OpenAI;
  private config: AIProviderConfig;

  constructor() {
    const apiKey = env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for OpenRouter provider');
    }

    this.client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': env.NEXT_PUBLIC_APP_NAME || 'Emerald Coast Community Band',
      },
      timeout: env.NODE_ENV === 'production' ? 60000 : 30000,
      maxRetries: 3,
    });

    this.config = {
      provider: 'openrouter',
      model: env.AI_MODEL || 'openai/gpt-4o-mini',
      temperature: env.AI_TEMPERATURE || 0.1,
      maxTokens: 4096,
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      headers: {
        'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': env.NEXT_PUBLIC_APP_NAME || 'Emerald Coast Community Band',
      },
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await withRetry(
      async () =>
        withTimeout(
          async () => {
            const result = await this.client.chat.completions.create({
              model: request.model || this.config.model,
              messages: request.messages as any[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
              tools: request.tools as any[],
              tool_choice: request.tool_choice as any,
              response_format: request.response_format as any,
              stream: false,
            });

            return this.convertResponse(result);
          },
          30000
        ),
      3,
      1000
    );

    return response;
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatCompletionResponse) => void
  ): Promise<void> {
    const stream = await withRetry(
      async () =>
        withTimeout(
          async () => {
            const stream = await this.client.chat.completions.create({
              model: request.model || this.config.model,
              messages: request.messages as any[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
              response_format: request.response_format as any,
              stream: true,
            });

            return stream;
          },
          30000
        ),
      3,
      1000
    );

    for await (const chunk of stream) {
      onChunk(this.convertResponse(chunk));
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<StructuredExtractionResult<T>> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const response = await this.chatCompletion({
        messages,
        response_format: { type: 'json_object' },
        temperature: this.config.temperature,
      });

      const content = response.choices[0]?.message?.content || '';
      const data = parseAndValidateJson(content, schema);

      return {
        data,
        error: data ? null : 'Failed to parse or validate JSON response',
        rawResponse: content,
        usage: response.usage,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        rawResponse: '',
      };
    }
  }

  isConfigured(): boolean {
    return !!env.OPENROUTER_API_KEY;
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  private convertResponse(
    response: OpenAI.Chat.Completions.ChatCompletion
  ): ChatCompletionResponse {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content || '',
        },
        finish_reason: choice.finish_reason as ChatCompletionResponse['choices'][0]['finish_reason'],
      })),
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Create an OpenRouter provider instance
 */
export function createOpenRouterProvider(): OpenRouterProvider {
  return new OpenRouterProvider();
}
