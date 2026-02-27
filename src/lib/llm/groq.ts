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

    // IMPORTANT: As of early 2024, Groq does not support vision/image inputs.
    // The image content is constructed here to maintain a consistent interface,
    // but the Groq API will likely reject requests containing image data.
    // The calling service should ideally avoid sending image requests to Groq.
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
