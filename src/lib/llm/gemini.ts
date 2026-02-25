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

    for (const image of request.images) {
      parts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: image.base64Data,
        },
      });
    }

    parts.push({
      text: request.prompt,
    });

    const baseUrl = (config.llm_endpoint_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    return {
      url: `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.1,
        },
      },
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
