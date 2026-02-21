/**
 * Custom Provider Implementation
 *
 * Escape hatch for any custom provider.
 * Uses CUSTOM_AI_BASE_URL and parses CUSTOM_AI_HEADERS_JSON.
 */

import OpenAI from 'openai';

import { env } from '../../env';

import {
  AIProvider,
  AIProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  StructuredExtractionResult,
  ZodSchema,
} from '../types';
import {
  withRetry,
  withTimeout,
} from '../structured-output';

/**
 * Custom Provider
 */
export class CustomProvider implements AIProvider {
  readonly id = 'custom' as const;

  private client: OpenAI;
  private config: AIProviderConfig;

  constructor() {
    const baseURL = env.CUSTOM_AI_BASE_URL;

    if (!baseURL) {
      throw new Error('CUSTOM_AI_BASE_URL is required for custom provider');
    }

    const apiKey = env.OPENAI_COMPAT_API_KEY || 'not-needed';

    // Parse custom headers from JSON
    let customHeaders: Record<string, string> = {};
    if (env.CUSTOM_AI_HEADERS_JSON) {
      try {
        customHeaders = JSON.parse(env.CUSTOM_AI_HEADERS_JSON);
      } catch {
        throw new Error('CUSTOM_AI_HEADERS_JSON must be valid JSON');
      }
    }

    this.client = new OpenAI({
      baseURL,
      apiKey,
      defaultHeaders: customHeaders,
      timeout: env.NODE_ENV === 'production' ? 120000 : 60000,
      maxRetries: 3,
    });

    this.config = {
      provider: 'custom',
      model: env.AI_MODEL || 'gpt-4o-mini',
      temperature: env.AI_TEMPERATURE || 0.1,
      maxTokens: 4096,
      baseURL,
      apiKey,
      headers: customHeaders,
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
              model: (request.model || this.config.model || 'gpt-4o-mini') as OpenAI.ChatModel,
              messages: request.messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              stop: request.stop,
              stream: false,
            });

            return this.convertResponse(result as OpenAI.Chat.Completions.ChatCompletion);
          },
          60000
        ),
      3,
      2000
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
              model: (request.model || this.config.model || 'gpt-4o-mini') as OpenAI.ChatModel,
              messages: request.messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              stop: request.stop,
              stream: true,
            });

            return stream;
          },
          60000
        ),
      3,
      2000
    );

    for await (const chunk of stream) {
      onChunk(this.convertResponse(chunk as unknown as OpenAI.Chat.Completions.ChatCompletion));
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    _schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<StructuredExtractionResult<T>> {
    const messages: ChatMessage[] = [];

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

      // Parse JSON manually to avoid type issues
      let data: T | null = null;
      try {
        data = JSON.parse(content) as T;
      } catch {
        data = null;
      }

      return {
        data,
        error: data ? null : 'Failed to parse JSON response',
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
    return !!env.CUSTOM_AI_BASE_URL;
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
 * Create a custom provider instance
 */
export function createCustomProvider(): CustomProvider {
  return new CustomProvider();
}
