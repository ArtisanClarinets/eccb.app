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

function mergeAnthropicModelParams(
  body: Record<string, unknown>,
  modelParams?: Record<string, unknown>
): void {
  if (!modelParams) return;

  const temperature = toFiniteNumber(modelParams.temperature);
  if (temperature !== undefined) {
    body.temperature = clamp(temperature, 0, 1);
  }

  const topP = toFiniteNumber(modelParams.top_p) ?? toFiniteNumber(modelParams.topP);
  if (topP !== undefined) {
    body.top_p = clamp(topP, 0, 1);
  }

  const topK = toFiniteInteger(modelParams.top_k) ?? toFiniteInteger(modelParams.topK);
  if (topK !== undefined) {
    body.top_k = Math.max(0, topK);
  }

  if (Array.isArray(modelParams.stop_sequences)) {
    body.stop_sequences = modelParams.stop_sequences;
  } else if (Array.isArray(modelParams.stopSequences)) {
    body.stop_sequences = modelParams.stopSequences;
  }
}

/**
 * Anthropic API adapter for Messages API
 * Uses x-api-key header and anthropic-version header
 * Request format: { model, messages, max_tokens, system? }
 */
export class AnthropicAdapter implements LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } {
    // SECURITY: Use provider-specific API key - Anthropic keys must not be sent to other providers
    const apiKey = config.llm_anthropic_api_key;

    if (!apiKey) {
      throw new Error('Anthropic API key is required but not configured');
    }

    // Build content array with images and text for Anthropic format
    const content: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    > = [];

    const pushLabeledImage = (image: { mimeType: string; base64Data: string; label?: string }) => {
      if (image.label?.trim()) {
        content.push({ type: 'text', text: `[${image.label.trim()}]` });
      }

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: image.base64Data,
        },
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

    content.push({ type: 'text', text: promptText });

    const baseUrl = (config.llm_endpoint_url || 'https://api.anthropic.com').replace(/\/$/, '');

    const bodyObj: Record<string, unknown> = {
      model: config.llm_vision_model || 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content }],
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.1,
    };

    mergeAnthropicModelParams(bodyObj, request.modelParams);

    // Anthropic supports a top-level system field (not inside messages)
    if (request.system) {
      bodyObj['system'] = request.system;
    }

    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: bodyObj,
    };
  }

  parseResponse(response: unknown): VisionResponse {
    const data = response as {
      content?: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    // Anthropic returns content as an array of blocks
    const content = data.content?.find((c) => c.type === 'text')?.text ?? '';

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }
}

export const adapter = new AnthropicAdapter();
