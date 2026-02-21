/**
 * OpenAI Provider Implementation
 *
 * First-class OpenAI integration using the official SDK.
 * Supports structured output via response_format: { type: "json_object" }
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
 * OpenAI Provider
 */
export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;

  private client: OpenAI;
  private config: AIProviderConfig;

  constructor() {
    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: env.NODE_ENV === 'production' ? 60000 : 30000,
      maxRetries: 3,
    });

    this.config = {
      provider: 'openai',
      model: env.AI_MODEL || 'gpt-4o-mini',
      temperature: env.AI_TEMPERATURE || 0.1,
      maxTokens: 4096,
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const model = request.model || this.config.model || 'gpt-4o-mini';
    const response = await withRetry(
      async () =>
        withTimeout(
          async () => {
            const result = await this.client.chat.completions.create({
              model,
              messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
              tools: request.tools as OpenAI.Chat.ChatCompletionTool[],
              tool_choice: request.tool_choice as OpenAI.Chat.ChatCompletionToolChoiceOption,
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
    const model = request.model || this.config.model || 'gpt-4o-mini';
    const stream = await withRetry(
      async () =>
        withTimeout(
          async () => {
            const stream = await this.client.chat.completions.create({
              model,
              messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens,
              top_p: request.top_p,
              frequency_penalty: request.frequency_penalty,
              presence_penalty: request.presence_penalty,
              stop: request.stop,
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
      onChunk(this.convertStreamChunk(chunk));
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
        messages: messages as ChatCompletionRequest['messages'],
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
    return !!env.OPENAI_API_KEY;
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
          role: choice.message.role as 'system' | 'user' | 'assistant' | 'tool',
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

  private convertStreamChunk(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk
  ): ChatCompletionResponse {
    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: (choice.delta.role || 'assistant') as 'system' | 'user' | 'assistant' | 'tool',
          content: choice.delta.content || '',
        },
        finish_reason: choice.finish_reason as ChatCompletionResponse['choices'][0]['finish_reason'],
      })),
      usage: chunk.usage
        ? {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Create an OpenAI provider instance
 */
export function createOpenAIProvider(): OpenAIProvider {
  return new OpenAIProvider();
}
