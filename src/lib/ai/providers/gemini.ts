/**
 * Gemini Provider Implementation
 *
 * First-class Gemini integration using Google GenAI SDK.
 * Handles structured output via prompt instructions.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Gemini Provider
 */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;

  private client: GoogleGenerativeAI;
  private config: AIProviderConfig;

  constructor() {
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini provider');
    }

    this.client = new GoogleGenerativeAI(apiKey);

    this.config = {
      provider: 'gemini',
      model: env.AI_MODEL || 'gemini-1.5-flash-002',
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
            const model = this.client.getGenerativeModel({
              model: request.model || this.config.model || 'gemini-1.5-flash-002',
              generationConfig: {
                temperature: request.temperature ?? this.config.temperature,
                maxOutputTokens: request.max_tokens || this.config.maxTokens,
                topP: request.top_p,
                stopSequences: request.stop
                  ? Array.isArray(request.stop)
                    ? request.stop
                    : [request.stop]
                  : undefined,
              },
            });

            const result = await model.generateContent(
              this.convertMessages(request.messages)
            ) as unknown;

            return this.convertResponse(result as Awaited<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']>);
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
    const model = this.client.getGenerativeModel({
      model: request.model || this.config.model || 'gemini-1.5-flash-002',
      generationConfig: {
        temperature: request.temperature ?? this.config.temperature,
        maxOutputTokens: request.max_tokens || this.config.maxTokens,
        topP: request.top_p,
        stopSequences: request.stop
          ? Array.isArray(request.stop)
            ? request.stop
            : [request.stop]
          : undefined,
      },
    });

    const result = await model.generateContentStream(
      this.convertMessages(request.messages)
    );

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        onChunk({
          id: `gemini-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model || this.config.model || 'gemini-1.5-flash-002',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: text,
              },
              finish_reason: null,
            },
          ],
        });
      }
    }

    // Send final chunk
    const finalResponse = await result.response;
    const finalText = finalResponse.text();
    onChunk({
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model || this.config.model || 'gemini-1.5-flash-002',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: finalText,
          },
          finish_reason: 'stop',
        },
      ],
    });
  }

  async generateStructuredOutput<T>(
    prompt: string,
    _schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<StructuredExtractionResult<T>> {
    // Gemini uses prompt engineering for structured output
    const enhancedPrompt = `${systemPrompt || ''}

Respond ONLY with a valid JSON object.

Do not include any explanatory text, markdown formatting, or code blocks.

JSON:`;

    try {
      const response = await this.chatCompletion({
        messages: [
          { role: 'user', content: enhancedPrompt + '\n\n' + prompt },
        ],
        temperature: this.config.temperature,
      });

      const content = response.choices[0]?.message?.content || '';

      // Parse JSON manually
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
    return !!env.GEMINI_API_KEY;
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  private convertMessages(
    messages: ChatCompletionRequest['messages']
  ): string {
    // Gemini uses a simple string format for conversation
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(`System: ${msg.content}`);
      } else if (msg.role === 'user') {
        parts.push(`User: ${msg.content}`);
      } else if (msg.role === 'assistant') {
        parts.push(`Assistant: ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }

  private convertResponse(
    response: unknown
  ): ChatCompletionResponse {
    const genAIResponse = response as { response: { text: () => string } };
    const text = genAIResponse.response.text();

    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.config.model || 'gemini-1.5-flash-002',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: text,
          },
          finish_reason: 'stop',
        },
      ],
    };
  }
}

/**
 * Create a Gemini provider instance
 */
export function createGeminiProvider(): GeminiProvider {
  return new GeminiProvider();
}
