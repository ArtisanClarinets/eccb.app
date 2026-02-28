// src/lib/llm/custom.ts
// ============================================================
// Adapter for a custom, OpenAI-compatible LLM provider.
// ============================================================

import {
  type LLMConfig,
  type VisionRequest,
  type VisionResponse,
  type LLMAdapter,
} from './types';

/** Fields that must not be overwritten by user-supplied modelParams */
const BLOCKED_BODY_PARAMS = new Set(['model', 'messages']);

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
 * Implements the LLMAdapter for a generic, OpenAI-compatible endpoint.
 *
 * This adapter is designed for use with any LLM service that exposes
 * an OpenAI-compatible `/chat/completions` endpoint. It conditionally
 * includes an Authorization header if a custom API key is provided.
 * This makes it suitable for services like vLLM, LM Studio, Groq, etc.
 */
export class CustomAdapter implements LLMAdapter {
  /**
   * Constructs the API request for the custom service.
   *
   * @param config - The LLM configuration.
   * @param request - The vision request.
   * @returns An object containing the URL, headers, and body for the fetch request.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { llm_endpoint_url, llm_vision_model, llm_custom_api_key } = config;
    const {
      images,
      prompt,
      system,
      responseFormat,
      maxTokens,
      temperature,
      modelParams,
    } = request;

    if (!llm_endpoint_url) {
      throw new Error('Custom LLM endpoint URL is not configured.');
    }

    const url = `${llm_endpoint_url.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (llm_custom_api_key) {
      headers['Authorization'] = `Bearer ${llm_custom_api_key}`;
    }

    const messages = [];

    if (system) {
      messages.push({ role: 'system', content: system });
    }

    // Build content array supporting labeled inputs for verification
    const content: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];

    for (const img of images) {
      if (img.label?.trim()) {
        content.push({ type: 'text', text: `[${img.label.trim()}]` });
      }
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64Data}` },
      });
    }

    if (request.labeledInputs) {
      for (const li of request.labeledInputs) {
        if (li.label?.trim()) {
          content.push({ type: 'text', text: `[${li.label.trim()}]` });
        }
        content.push({
          type: 'image_url',
          image_url: { url: `data:${li.mimeType};base64,${li.base64Data}` },
        });
      }
    }

    content.push({ type: 'text', text: prompt });

    messages.push({ role: 'user', content });

    const body: Record<string, unknown> = {
      model: llm_vision_model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature,
      ...(responseFormat?.type === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    mergeModelParams(body, modelParams);

    return { url, headers, body };
  }

  /**
   * Parses the JSON response from the API.
   *
   * @param response - The raw JSON response from the API.
   * @returns A structured VisionResponse object.
   */
  parseResponse(response: unknown): VisionResponse {
    const res = response as any;

    const content = res.choices?.[0]?.message?.content ?? '';

    const usage =
      res.usage &&
      typeof res.usage.prompt_tokens === 'number' &&
      typeof res.usage.completion_tokens === 'number'
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
          }
        : undefined;

    return { content, usage };
  }
}

export const adapter = new CustomAdapter();
