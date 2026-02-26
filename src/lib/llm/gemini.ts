import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toFiniteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mergeGenerationConfigParams(
  generationConfig: Record<string, unknown>,
  modelParams?: Record<string, unknown>
): void {
  if (!modelParams) return;

  const maxOutputTokens =
    toFiniteInteger(modelParams.maxOutputTokens) ??
    toFiniteInteger(modelParams.max_tokens) ??
    toFiniteInteger(modelParams.maxTokens);
  if (maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = clamp(maxOutputTokens, 1, 65_536);
  }

  const temperature = toFiniteNumber(modelParams.temperature);
  if (temperature !== undefined) {
    generationConfig.temperature = clamp(temperature, 0, 2);
  }

  const topP = toFiniteNumber(modelParams.topP) ?? toFiniteNumber(modelParams.top_p);
  if (topP !== undefined) {
    generationConfig.topP = clamp(topP, 0, 1);
  }

  const topK = toFiniteInteger(modelParams.topK) ?? toFiniteInteger(modelParams.top_k);
  if (topK !== undefined) {
    generationConfig.topK = Math.max(1, topK);
  }

  const candidateCount =
    toFiniteInteger(modelParams.candidateCount) ?? toFiniteInteger(modelParams.candidate_count);
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
 * Google Gemini API adapter
 * Uses API key as query parameter (not header)
 * Request format: { contents: [{ parts: [...] }] }
 */
export class GeminiAdapter implements LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } {
    // SECURITY: Use provider-specific API key - Gemini keys must not be sent to other providers
    const apiKey = config.llm_gemini_api_key;

    if (!apiKey) {
      throw new Error('Gemini API key is required but not configured');
    }

    const model = config.llm_vision_model || 'gemini-2.0-flash-exp';

    // Build parts array with images and text for Gemini format
    const parts: Array<
      | { inline_data: { mime_type: string; data: string } }
      | { text: string }
    > = [];

    const pushLabeledImage = (image: { mimeType: string; base64Data: string; label?: string }) => {
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

    // If JSON mode requested, append instruction to prompt
    const promptText = request.responseFormat?.type === 'json'
      ? `${request.prompt}\n\nIMPORTANT: Respond with valid JSON only, no markdown fences or prose.`
      : request.prompt;

    parts.push({ text: promptText });

    const baseUrl = (config.llm_endpoint_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.1,
      // Request JSON output when responseFormat is json
      ...(request.responseFormat?.type === 'json'
        ? { response_mime_type: 'application/json' }
        : {}),
    };

    mergeGenerationConfigParams(generationConfig, request.modelParams);

    const bodyObj: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig,
    };

    // Gemini supports systemInstruction at the top level
    if (request.system) {
      bodyObj['systemInstruction'] = { parts: [{ text: request.system }] };
    }

    return {
      url: `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: bodyObj,
    };
  }

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
      };
    };

    // Gemini returns content in candidates array
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
