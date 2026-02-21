/**
 * Anthropic Provider Implementation
 *
 * First-class Anthropic integration using the official SDK.
 * Handles structured output via prompt instructions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

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
  parseAndValidateJson,
  withRetry,
  withTimeout,
} from '../structured-output';

/**
 * Anthropic Provider
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;

  private client: Anthropic;
  private config: AIProviderConfig;

  constructor() {
    const apiKey = env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    this.client = new Anthropic({
      apiKey,
      timeout: env.NODE_ENV === 'production' ? 60000 : 30000,
      maxRetries: 3,
    });

    this.config = {
      provider: 'anthropic',
      model: env.AI_MODEL || 'claude-3-haiku-20240307',
      temperature: env.AI_TEMPERATURE || 0.1,
      maxTokens: 4096,
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await withRetry(
      async () =>
        withTimeout(
          async () => {
            const result = await this.client.messages.create({
              model: request.model || this.config.model || 'claude-3-haiku-20240307',
              messages: this.convertMessages(request.messages),
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens || 4096,
              top_p: request.top_p,
              stop_sequences: request.stop
                ? Array.isArray(request.stop)
                  ? request.stop
                  : [request.stop]
                : undefined,
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
            const stream = await this.client.messages.stream({
              model: request.model || this.config.model || 'claude-3-haiku-20240307',
              messages: this.convertMessages(request.messages),
              temperature: request.temperature ?? this.config.temperature,
              max_tokens: request.max_tokens || this.config.maxTokens || 4096,
              top_p: request.top_p,
              stop_sequences: request.stop
                ? Array.isArray(request.stop)
                  ? request.stop
                  : [request.stop]
                : undefined,
            });

            return stream;
          },
          30000
        ),
      3,
      1000
    );

    let accumulatedContent = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          accumulatedContent += chunk.delta.text;
          onChunk({
            id: `anthropic-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: request.model || this.config.model || 'claude-3-haiku-20240307',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: accumulatedContent,
                },
                finish_reason: null,
              },
            ],
          });
        }
      } else if (chunk.type === 'message_stop') {
        onChunk({
          id: `anthropic-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model || this.config.model || 'claude-3-haiku-20240307',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: accumulatedContent,
              },
              finish_reason: 'stop',
            },
          ],
        });
      }
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    _schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<StructuredExtractionResult<T>> {
    // Anthropic uses prompt engineering for structured output
    const fullSystemPrompt = `${systemPrompt || ''}

IMPORTANT: You must respond ONLY with a valid JSON object. Do not include any explanatory text, markdown formatting, or code blocks.

Respond with valid JSON now.`;

    try {
      const response = await this.chatCompletion({
        messages: [
          { role: 'user', content: fullSystemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.temperature,
      });

      const content = response.choices[0]?.message?.content || '';

      // Import the schema here to avoid circular issues
      const { parse } = await import('zod');
      let data: T | null = null;
      try {
        // Use a generic approach - try to parse the JSON
        const parsed = JSON.parse(content);
        data = parsed as T;
      } catch {
        // Try to repair and parse
        const repaired = content.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
          const parsed = JSON.parse(repaired);
          data = parsed as T;
        } catch {
          data = null;
        }
      }

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
    return !!env.ANTHROPIC_API_KEY;
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  private convertMessages(
    messages: ChatMessage[]
  ): Anthropic.MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' as const : msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private convertResponse(
    response: Anthropic.Message
  ): ChatCompletionResponse {
    const content = response.content[0];
    const textContent = content.type === 'text' ? content.text : '';

    // created_at might not be in the type definition, use type assertion
    const createdAt = (response as unknown as { created_at: Date }).created_at;

    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(createdAt.getTime() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: textContent,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}

/**
 * Create an Anthropic provider instance
 */
export function createAnthropicProvider(): AnthropicProvider {
  return new AnthropicProvider();
}
