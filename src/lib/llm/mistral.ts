// src/lib/llm/mistral.ts
// ============================================================
// Adapter for the Mistral AI API.
// Assumes an OpenAI-compatible endpoint structure.
// ============================================================

import {
  type LLMConfig,
  type VisionRequest,
  type VisionResponse,
  type LLMAdapter,
} from './types';

/**
 * Implements the LLMAdapter for the Mistral AI API.
 *
 * This adapter is built for the Mistral API, which follows the
 * standard OpenAI completions API format.
 *
 * @see https://docs.mistral.ai/
 */
export class MistralAdapter implements LLMAdapter {
  /**
   * Constructs the API request for the Mistral AI service.
   *
   * @param config - The LLM configuration containing the API key, endpoint, and model.
   * @param request - The vision request with prompt and images.
   * @returns An object containing the URL, headers, and body for the fetch request.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { llm_endpoint_url, llm_vision_model, llm_mistral_api_key } = config;
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
      throw new Error('Mistral endpoint URL is not configured.');
    }

    if (!llm_mistral_api_key) {
      throw new Error('Mistral API key is not configured.');
    }

    const url = `${llm_endpoint_url.replace(/\/$/, '')}/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm_mistral_api_key}`,
    };

    const messages = [];

    if (system) {
      messages.push({ role: 'system', content: system });
    }

    // Note: As of early 2024, Mistral's official API does not support inline images
    // in the same way as OpenAI's vision models. This implementation assumes a
    // future-compatible or OpenAI-proxy-compatible format. If targeting native
    // Mistral, this would need adjustment. For now, we follow the common standard.
    const imageContent = images.map((img) => ({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64Data}`,
      },
    }));

    messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }, ...imageContent],
    });

    const body = {
      model: llm_vision_model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature,
      ...(responseFormat?.type === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...modelParams,
    };

    return { url, headers, body };
  }

  /**
   * Parses the JSON response from the Mistral API.
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

export const adapter = new MistralAdapter();
