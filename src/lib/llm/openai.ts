import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

/**
 * OpenAI API adapter for chat.completions endpoint
 * Supports OpenAI-compatible APIs including custom endpoints
 */
export class OpenAIAdapter implements LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } {
    // SECURITY: Use provider-specific API key - OpenAI keys must not be sent to other providers
    const apiKey = config.llm_openai_api_key;

    if (!apiKey) {
      throw new Error('OpenAI API key is required but not configured');
    }

    // Build content array with images and text
    const content: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];

    for (const image of request.images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64Data}`,
        },
      });
    }

    content.push({
      type: 'text',
      text: request.prompt,
    });

    const baseUrl = config.llm_endpoint_url || 'https://api.openai.com/v1';

    return {
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model: config.llm_vision_model || 'gpt-4o',
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
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
