import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

const BLOCKED_BODY_PARAMS = new Set(['model', 'messages']);

function buildLabelText(label: string): string {
  return `[${label}]`;
}

function pushOpenRouterImageContent(
  content: Array<{ type: string; image_url?: { url: string }; text?: string }>,
  image: { mimeType: string; base64Data: string; label?: string }
): void {
  if (image.label?.trim()) {
    content.push({ type: 'text', text: buildLabelText(image.label.trim()) });
  }

  content.push({
    type: 'image_url',
    image_url: { url: `data:${image.mimeType};base64,${image.base64Data}` },
  });
}

function mergeModelParams(
  body: Record<string, unknown>,
  modelParams?: Record<string, unknown>
): void {
  if (!modelParams) return;

  for (const [key, value] of Object.entries(modelParams)) {
    if (BLOCKED_BODY_PARAMS.has(key)) continue;
    body[key] = value;
  }
}

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
      pushOpenRouterImageContent(content, image);
    }

    if (request.labeledInputs) {
      for (const labeledInput of request.labeledInputs) {
        pushOpenRouterImageContent(content, labeledInput);
      }
    }

    content.push({ type: 'text', text: request.prompt });

    const baseUrl = (config.llm_endpoint_url || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

    const messages: Array<Record<string, unknown>> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    messages.push({ role: 'user', content });

    const body: Record<string, unknown> = {
      model: config.llm_vision_model || 'openai/gpt-4o',
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.1,
    };

    mergeModelParams(body, request.modelParams);

    if (request.responseFormat?.type === 'json') {
      body['response_format'] = { type: 'json_object' };
    }

    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://eccb.app',
        'X-Title': 'ECCB Smart Upload',
      },
      body,
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
