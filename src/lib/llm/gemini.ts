// src/lib/llm/gemini.ts
// ============================================================
// Enterprise-Grade Adapter for the Google Gemini API
//
// This adapter provides a robust, production-ready interface to the
// Google Gemini family of models. It handles the specific request and
// response formats of the Gemini API, including its unique structure
// for prompts, vision content, and system instructions.
//
// Key Features:
// - Provider-specific, secure API key handling (via query parameter).
// - Correctly formats multimodal (vision) requests.
// - Supports modern Gemini features like `systemInstruction`.
// - Natively handles JSON output mode via `responseMimeType`.
// - Robustly merges and clamps model parameters.
// - Includes placeholders for future Gemini features (Tools, Safety Settings).
// ============================================================

import type {
  LLMAdapter,
  LLMConfig,
  VisionRequest,
  VisionResponse,
} from './types';

// --- Utility Functions for Parameter Sanitization ---

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toFiniteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Merges and sanitizes model-specific parameters into the Gemini `generationConfig`.
 * This ensures that parameters passed via `modelParams` are correctly formatted
 * and fall within the API's supported ranges.
 * @param generationConfig The `generationConfig` object to be mutated.
 * @param modelParams An optional record of provider-specific parameters.
 */
function mergeGenerationConfigParams(
  generationConfig: Record<string, unknown>,
  modelParams?: Record<string, unknown>,
): void {
  if (!modelParams) return;

  const maxOutputTokens =
    toFiniteInteger(modelParams.maxOutputTokens) ??
    toFiniteInteger(modelParams.max_tokens) ??
    toFiniteInteger(modelParams.maxTokens);
  if (maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = clamp(maxOutputTokens, 1, 65536);
  }

  const temperature = toFiniteNumber(modelParams.temperature);
  if (temperature !== undefined) {
    generationConfig.temperature = clamp(temperature, 0, 2);
  }

  const topP =
    toFiniteNumber(modelParams.topP) ?? toFiniteNumber(modelParams.top_p);
  if (topP !== undefined) {
    generationConfig.topP = clamp(topP, 0, 1);
  }

  const topK =
    toFiniteInteger(modelParams.topK) ?? toFiniteInteger(modelParams.top_k);
  if (topK !== undefined) {
    generationConfig.topK = Math.max(1, topK);
  }

  // Other common Gemini params
  const candidateCount =
    toFiniteInteger(modelParams.candidateCount) ??
    toFiniteInteger(modelParams.candidate_count);
  if (candidateCount !== undefined) {
    generationConfig.candidateCount = Math.max(1, candidateCount);
  }
  const seed = toFiniteInteger(modelParams.seed);
  if (seed !== undefined) {
    generationConfig.seed = Math.max(0, seed);
  }
  if (Array.isArray(modelParams.stopSequences)) {
    generationConfig.stopSequences = modelParams.stopSequences;
  } else if (Array.isArray(modelParams.stop)) {
    generationConfig.stopSequences = modelParams.stop;
  }
}

/**
 * Implements the `LLMAdapter` for the Google Gemini API.
 * This class translates the generic `VisionRequest` into the specific
 * format required by Gemini's `generateContent` endpoint.
 */
export class GeminiAdapter implements LLMAdapter {
  /**
   * Builds the complete request object for the Gemini API.
   * @param config The LLM configuration containing the API key, endpoint, and model name.
   * @param request The generic vision request to be translated.
   * @returns A structured object with the URL, headers, and body for the API call.
   * @throws If the Gemini API key is not configured.
   */
  buildRequest(
    config: LLMConfig,
    request: VisionRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    // SECURITY: Use the provider-specific API key.
    const apiKey = config.llm_gemini_api_key;
    if (!apiKey) {
      throw new Error('Gemini API key is required but not configured.');
    }

    const model = config.llm_vision_model || 'gemini-1.5-flash-latest';
    const baseUrl = (
      config.llm_endpoint_url ||
      'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');

    // --- Build Request Body ---

    // 1. Construct the `parts` array for multimodal content.
    const parts: Array<
      { inline_data: { mime_type: string; data: string } } | { text: string }
    > = [];

    const pushLabeledImage = (image: {
      mimeType: string;
      base64Data: string;
      label?: string;
    }) => {
      if (image.label?.trim()) {
        parts.push({ text: `[${image.label.trim()}]` });
      }
      parts.push({
        inline_data: { mime_type: image.mimeType, data: image.base64Data },
      });
    };

    for (const image of request.images) {
      pushLabeledImage(image);
    }
    if (request.labeledInputs) {
      for (const labeledInput of request.labeledInputs) {
        pushLabeledImage(labeledInput);
      }
    }
    parts.push({ text: request.prompt });

    // 2. Set up the `generationConfig`.
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    };

    if (request.responseFormat?.type === 'json') {
      generationConfig.responseMimeType = 'application/json';
      // The Gemini API is reliable with JSON mode when the MIME type is set.
      // No extra prompting is typically needed. We also support a future `schema` property.
      const schema = (request.responseFormat as any).schema;
      if (schema) {
        generationConfig.responseSchema = schema;
      }
    }

    mergeGenerationConfigParams(generationConfig, request.modelParams);

    // 3. Assemble the final request body.
    const bodyObj: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig,
    };

    // 4. Add system instruction if provided.
    if (request.system) {
      bodyObj['systemInstruction'] = { parts: [{ text: request.system }] };
    }

    // 5. (Future) Add placeholders for other advanced features.
    // if (request.tools) { bodyObj['tools'] = request.tools; }
    // if (config.safetySettings) { bodyObj['safetySettings'] = config.safetySettings; }

    return {
      url: `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey,
      )}`,
      headers: { 'Content-Type': 'application/json' },
      body: bodyObj,
    };
  }

  /**
   * Parses the response from the Gemini API into the standardized `VisionResponse` format.
   * @param response The raw JSON response from the API.
   * @returns A structured `VisionResponse` containing the content and token usage.
   */
  parseResponse(response: unknown): VisionResponse {
    const data = response as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      content,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount ?? 0,
            completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          }
        : undefined,
    };
  }
}

/**
 * Singleton instance of the GeminiAdapter.
 * This is used by the central LLM service layer.
 */
export const adapter = new GeminiAdapter();
