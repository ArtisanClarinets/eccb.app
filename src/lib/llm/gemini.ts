import type { LLMAdapter, LLMConfig, VisionRequest, VisionResponse } from './types';

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

    // Include labeled inputs if provided
    const allImages = request.labeledInputs
      ? [...request.images, ...request.labeledInputs.map((li) => ({ mimeType: li.mimeType, base64Data: li.base64Data }))]
      : request.images;

    for (const image of allImages) {
      parts.push({
        inline_data: { mime_type: image.mimeType, data: image.base64Data },
      });
    }

    // If JSON mode requested, append instruction to prompt
    const promptText = request.responseFormat?.type === 'json'
      ? `${request.prompt}\n\nIMPORTANT: Respond with valid JSON only, no markdown fences or prose.`
      : request.prompt;

    parts.push({ text: promptText });

    const baseUrl = (config.llm_endpoint_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

    const bodyObj: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.1,
        // Request JSON output when responseFormat is json
        ...(request.responseFormat?.type === 'json'
          ? { response_mime_type: 'application/json' }
          : {}),
      },
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
