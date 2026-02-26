export type LLMProvider = 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'ollama' | 'custom';

export interface LLMConfig {
  llm_provider: LLMProvider;
  llm_endpoint_url?: string;
  llm_openai_api_key?: string;
  llm_anthropic_api_key?: string;
  llm_openrouter_api_key?: string;
  llm_gemini_api_key?: string;
  llm_custom_api_key?: string;
  llm_vision_model?: string;
  llm_verification_model?: string;
}

export interface LabeledImage {
  kind: 'image';
  mimeType: string;
  base64Data: string;
  /** Optional label to reference this image in the prompt */
  label?: string;
}

export interface ResponseFormat {
  type: 'json' | 'text';
}

export interface VisionRequest {
  images: Array<{ mimeType: string; base64Data: string }>;
  /** Labeled inputs for multi-source verification (images with context labels) */
  labeledInputs?: LabeledImage[];
  prompt: string;
  /** Optional system-level instruction (passed as system message or role-based) */
  system?: string;
  /** Request structured JSON output */
  responseFormat?: ResponseFormat;
  maxTokens?: number;
  temperature?: number;
}

export interface VisionResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMAdapter {
  buildRequest(
    config: LLMConfig,
    request: VisionRequest
  ): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  };
  parseResponse(response: unknown): VisionResponse;
}
