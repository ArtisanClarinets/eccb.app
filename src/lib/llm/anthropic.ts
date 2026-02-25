import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

/**
 * Anthropic API adapter for Messages API
 * Uses x-api-key header and anthropic-version header
 * Request format: { model, messages, max_tokens, system? }
 */
export class AnthropicAdapter implements LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } {
    // SECURITY: Use provider-specific API key - Anthropic keys must not be sent to other providers
    const apiKey = config.llm_anthropic_api_key;

    if (!apiKey) {
      throw new Error('Anthropic API key is required but not configured');
    }

    // Build content array with images and text for Anthropic format
    const content: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    > = [];

    for (const image of request.images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: image.base64Data,
        },
      });
    }

    content.push({
      type: 'text',
      text: request.prompt,
    });

    const baseUrl = (config.llm_endpoint_url || 'https://api.anthropic.com').replace(/\/$/, '');
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: config.llm_vision_model || 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.1,
      },
    };
  }

  parseResponse(response: unknown): VisionResponse {
    const data = response as {
      content?: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    // Anthropic returns content as an array of blocks
    const content = data.content?.find((c) => c.type === 'text')?.text ?? '';

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }
}
