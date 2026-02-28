// src/lib/llm/ollama-cloud.ts
// ============================================================
// Adapter for the Ollama Cloud API.
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
 * Implements the LLMAdapter for the official Ollama Cloud service.
 *
 * This adapter is built on the assumption that the Ollama Cloud API
 * follows the OpenAI completions API format, which is a common standard for
 * serving LLM models.
 *
 * @see https://ollama.com/cloud
 */
export class OllamaCloudAdapter implements LLMAdapter {
  /**
   * Constructs the API request for the Ollama Cloud service.
   *
   * @param config - The LLM configuration containing the API key, endpoint, and model.
   * @param request - The vision request with prompt and images.
   * @returns An object containing the URL, headers, and body for the fetch request.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { llm_endpoint_url, llm_vision_model, llm_ollama_cloud_api_key } =
      config;
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
      throw new Error('Ollama Cloud endpoint URL is not configured.');
    }

    if (!llm_ollama_cloud_api_key) {
      throw new Error('Ollama Cloud API key is not configured.');
    }

    // Ollama Cloud follows the same OpenAI-compat layout as local Ollama:
    // the actual endpoint is /v1/chat/completions under whatever base URL is configured.
    const cleanBase = llm_endpoint_url.replace(/\/$/, '');
    const base = /\/v\d+/.test(cleanBase) ? cleanBase : `${cleanBase}/v1`;
    const url = `${base}/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm_ollama_cloud_api_key}`,
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
   * Parses the JSON response from the Ollama Cloud API.
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

export const adapter = new OllamaCloudAdapter();
