// src/lib/llm/ollama.ts
// ============================================================
// Adapter for a local or self-hosted Ollama instance.
// Assumes an OpenAI-compatible API format.
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
 * Implements the LLMAdapter for a local Ollama instance.
 *
 * This adapter is designed for local or self-hosted Ollama installations,
 * which typically do not require an API key. It assumes the standard
 * OpenAI-compatible `/chat/completions` endpoint.
 *
 * @see https://ollama.com
 */
export class OllamaAdapter implements LLMAdapter {
  /**
   * Constructs the API request for the local Ollama service.
   *
   * @param config - The LLM configuration containing the endpoint and model.
   * @param request - The vision request with prompt and images.
   * @returns An object containing the URL, headers, and body for the fetch request.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { llm_endpoint_url, llm_vision_model } = config;
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
      throw new Error('Ollama endpoint URL is not configured.');
    }

    const url = `${llm_endpoint_url.replace(/\/$/, '')}/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
    };

    const messages = [];

    if (system) {
      messages.push({ role: 'system', content: system });
    }

    // Build content array supporting both images and labeledInputs
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

    // Append labeled inputs (used by verification pass)
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
   * Parses the JSON response from the Ollama API.
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

export const adapter = new OllamaAdapter();
