import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

/**
 * OpenRouter API adapter
 * OpenRouter is OpenAI-compatible but with a different base URL
 * Uses Authorization header with Bearer token
 * SECURITY: OpenRouter keys must not be sent to OpenAI and vice versa
 */
export class OpenRouterAdapter implements LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } {
    // SECURITY: Use provider-specific API key - OpenRouter keys must not be sent to OpenAI and vice versa
    const apiKey = config.llm_openrouter_api_key;

    if (!apiKey) {
      throw new Error('OpenRouter API key is required but not configured');
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

    const baseUrl = config.llm_endpoint_url || 'https://openrouter.ai/api/v1';

    return {
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter specific headers for analytics
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://eccb.app',
        'X-Title': 'ECCB Smart Upload',
      },
      body: {
        model: config.llm_vision_model || 'openai/gpt-4o',
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
