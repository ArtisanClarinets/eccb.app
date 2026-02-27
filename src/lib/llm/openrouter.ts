// src/lib/llm/openrouter.ts
// ============================================================
// Enterprise-Grade Adapter for the OpenRouter.ai API
//
// This adapter provides a robust, production-ready interface to
// the OpenRouter service, which acts as an aggregator for hundreds
// of different LLM models.
//
// Key Features:
// - Follows the standard OpenAI-compatible API format.
// - Includes OpenRouter-specific headers (`HTTP-Referer`, `X-Title`)
//   for analytics and identification.
// - Supports unique OpenRouter features like `route` and `transforms`
//   passed via the `modelParams` object.
// - Securely handles the OpenRouter-specific API key.
// ============================================================

import type {
  LLMAdapter,
  LLMConfig,
  VisionRequest,
  VisionResponse,
} from './types';

// Parameters that are set at the top level of the request body and
// should not be merged from `modelParams`.
const BLOCKED_BODY_PARAMS = new Set([
  'model',
  'messages',
  'route',
  'transforms',
]);

/**
 * Creates the standard `[LABEL]` text for labeled images.
 * @param label The label for the image.
 * @returns A formatted string `[LABEL]`.
 */
function buildLabelText(label: string): string {
  return `[${label}]`;
}

/**
 * Appends a multimodal image part to the message content array
 * in the format expected by OpenAI-compatible vision APIs.
 * @param content The message `content` array to be mutated.
 * @param image The image object to be added.
 */
function pushOpenRouterImageContent(
  content: Array<{ type: string; image_url?: { url: string }; text?: string }>,
  image: { mimeType: string; base64Data: string; label?: string },
): void {
  if (image.label?.trim()) {
    content.push({ type: 'text', text: buildLabelText(image.label.trim()) });
  }
  content.push({
    type: 'image_url',
    image_url: { url: `data:${image.mimeType};base64,${image.base64Data}` },
  });
}

/**
 * Merges provider-specific parameters from `modelParams` into the request body,
 * respecting a blocklist to avoid overwriting critical fields.
 * @param body The request `body` object to be mutated.
 * @param modelParams An optional record of provider-specific parameters.
 */
function mergeModelParams(
  body: Record<string, unknown>,
  modelParams?: Record<string, unknown>,
): void {
  if (!modelParams) return;

  for (const [key, value] of Object.entries(modelParams)) {
    if (BLOCKED_BODY_PARAMS.has(key)) continue;
    body[key] = value;
  }
}

/**
 * Implements the `LLMAdapter` for the OpenRouter.ai service.
 * This class translates the generic `VisionRequest` into the specific
 * format required by the OpenRouter `/chat/completions` endpoint.
 */
export class OpenRouterAdapter implements LLMAdapter {
  /**
   * Builds the complete request object for the OpenRouter API.
   * @param config The LLM configuration containing the API key, endpoint, and model name.
   * @param request The generic vision request to be translated.
   * @returns A structured object with the URL, headers, and body for the API call.
   * @throws If the OpenRouter API key is not configured.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    // SECURITY: Use the provider-specific API key.
    const apiKey = config.llm_openrouter_api_key;
    if (!apiKey) {
      throw new Error('OpenRouter API key is required but not configured.');
    }

    const baseUrl = (
      config.llm_endpoint_url || 'https://openrouter.ai/api/v1'
    ).replace(/\/$/, '');

    // --- Build Request Body ---

    // 1. Construct the `messages` array with multimodal content.
    const content: Array<
      { type: string; image_url?: { url: string }; text?: string }
    > = [];
    for (const image of request.images) {
      pushOpenRouterImageContent(content, image);
    }
    if (request.labeledInputs) {
      for (const labeledInput of request.labeledInputs) {
        pushOpenRouterImageContent(content, labeledInput);
      }
    }
    content.push({ type: 'text', text: request.prompt });

    const messages: Array<Record<string, unknown>> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push({ role: 'user', content });

    // 2. Assemble the base request body.
    const body: Record<string, unknown> = {
      model: config.llm_vision_model || 'openai/gpt-4o', // Default model for OpenRouter
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };

    // 3. Add OpenRouter-specific features if present in `modelParams`.
    if (request.modelParams?.route) {
      body.route = request.modelParams.route;
    }
    if (request.modelParams?.transforms) {
      body.transforms = request.modelParams.transforms;
    }

    // 4. Merge remaining `modelParams`.
    mergeModelParams(body, request.modelParams);

    // 5. Add JSON mode if requested.
    if (request.responseFormat?.type === 'json') {
      body['response_format'] = { type: 'json_object' };
    }

    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Recommended headers for OpenRouter analytics and abuse prevention.
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://eccb.app',
        'X-Title': process.env.NEXT_PUBLIC_APP_NAME || 'ECCB Smart Upload',
      },
      body,
    };
  }

  /**
   * Parses the response from the OpenRouter API into the standardized `VisionResponse` format.
   * @param response The raw JSON response from the API.
   * @returns A structured `VisionResponse` containing the content and token usage.
   */
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

/**
 * Singleton instance of the OpenRouterAdapter.
 * This is used by the central LLM service layer.
 */
export const adapter = new OpenRouterAdapter();
