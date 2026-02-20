/**
 * OpenAI-Compatible Provider Implementation
 *
 * Generic adapter for any OpenAI-compatible endpoint.
 * This covers: Ollama, vLLM, TGI, LM Studio, and other local/self-hosted models.
 * Uses OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_API_KEY.
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

/**
 * OpenAI-Compatible Provider
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id = 'openai_compat' as const;

  private client: OpenAI;
  private config: AIProviderConfig;

  constructor() {
    const baseURL = env.OPENAI_COMPAT_BASE_URL;
    const apiKey = env.OPENAI_COMPAT_API_KEY || 'not-needed';

    if (!baseURL) {
      throw new Error(
        'OPENAI_COMPAT_BASE_URL is required for OpenAI-compatible provider'
      );
    }

    this.client = new OpenAI({
      baseURL,
      apiKey,
      timeout: env.NODE_ENV === 'production' ? 120000 : 60000, // Longer timeout for local models
      maxRetries: 3,
    });

    this.config = {
      provider: 'openai_compat',
      model: env.AI_MODEL || 'llama3',
      temperature: env.AI_TEMPERATURE || 0.1,
      maxTokens: 4096,
      baseURL,
      apiKey,
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
              messages: request.messages,
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
              tools: request.tools as OpenAI.Chat.CompletionTool[],
              tool_choice: request.tool_choice as OpenAI.Chat.CompletionToolChoiceOption,
              response_format: request.response_format as OpenAI.Chat.CompletionCreateParams.ResponseFormat,
              stream: false,
            });

            return this.convertResponse(result);
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
              model: request.model || this.config.model,
              messages: request.messages,
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
              response_format: request.response_format as OpenAI.Chat.CompletionCreateParams.ResponseFormat,
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
    return !!env.OPENAI_COMPAT_BASE_URL;
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
 * Create an OpenAI-compatible provider instance
 */
export function createOpenAICompatibleProvider(): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider();
}
