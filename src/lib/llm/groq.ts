// src/lib/llm/groq.ts
// ============================================================
// Adapter for the Groq API.
// Assumes an OpenAI-compatible endpoint structure.
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
 * Implements the LLMAdapter for the Groq API.
 *
 * This adapter is built for the Groq API, which provides extremely
 * fast inference on its LPU hardware and uses an OpenAI-compatible
 * API format.
 *
 * @see https://console.groq.com/docs/
 */
export class GroqAdapter implements LLMAdapter {
  /**
   * Constructs the API request for the Groq service.
   *
   * @param config - The LLM configuration containing the API key, endpoint, and model.
   * @param request - The vision request with prompt and images.
   * @returns An object containing the URL, headers, and body for the fetch request.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { llm_endpoint_url, llm_vision_model, llm_groq_api_key } = config;
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
      throw new Error('Groq endpoint URL is not configured.');
    }

    if (!llm_groq_api_key) {
      throw new Error('Groq API key is not configured.');
    }

    const url = `${llm_endpoint_url.replace(/\/$/, '')}/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm_groq_api_key}`,
    };

    const messages = [];

    if (system) {
      messages.push({ role: 'system', content: system });
    }

    // NOTE: Groq's vision support varies by model. Some models (e.g. llama-3.2-90b-vision)
    // support vision, but not all do. If images are provided we include them in the OpenAI-
    // compatible format. If the chosen model doesn't support images, the API will return an
    // error which the retry/fallback logic in index.ts handles.
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
   * Parses the JSON response from the Groq API.
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

export const adapter = new GroqAdapter();
