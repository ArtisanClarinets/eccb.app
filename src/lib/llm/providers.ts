// src/lib/llm/providers.ts
// ============================================================
// Single source of truth for LLM provider metadata.
// All default endpoints / models / capabilities live here.
// ============================================================

export const LLM_PROVIDER_VALUES = [
  'ollama',
  'ollama-cloud',
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'mistral',
  'groq',
  'custom',
] as const;

export type LLMProviderValue = (typeof LLM_PROVIDER_VALUES)[number];

export interface ProviderMeta {
  value: LLMProviderValue;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultEndpoint: string;
  /** Default vision-capable model for 1st pass */
  defaultVisionModel: string;
  /** Default model for 2nd verification pass */
  defaultVerificationModel: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
}

export const LLM_PROVIDERS: ProviderMeta[] = [
  {
    value: 'ollama',
    label: 'Ollama (Local / Self-hosted)',
    description: 'Free, private, runs on your server or laptop',
    requiresApiKey: false,
    defaultEndpoint: 'http://localhost:11434',
    defaultVisionModel: 'llama3.2-vision',
    defaultVerificationModel: 'qwen2.5:7b',
    apiKeyLabel: '',
    apiKeyPlaceholder: '',
    docsUrl: 'https://ollama.com',
  },
  {
    value: 'ollama-cloud',
    label: 'Ollama Cloud',
    description: 'Paid, cloud-hosted Ollama models',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.ollama.com',
    defaultVisionModel: 'llama3.2-vision',
    defaultVerificationModel: 'qwen2.5:7b',
    apiKeyLabel: 'Ollama Cloud API Key',
    apiKeyPlaceholder: 'oc_...',
    docsUrl: 'https://ollama.com/cloud',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Vision — most reliable vision models',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultVisionModel: 'gpt-4o',
    defaultVerificationModel: 'gpt-4o-mini',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet — strong reasoning and OCR accuracy',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.anthropic.com',
    defaultVisionModel: 'claude-3-5-sonnet-20241022',
    defaultVerificationModel: 'claude-3-haiku-20240307',
    apiKeyLabel: 'Anthropic API Key',
    apiKeyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/keys',
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 2.0 Flash — generous free tier for testing',
    requiresApiKey: true,
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultVisionModel: 'gemini-2.0-flash-exp',
    defaultVerificationModel: 'gemini-2.0-flash-exp',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Access 200+ models via a single API key — free tier available',
    requiresApiKey: true,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultVisionModel: 'google/gemini-2.0-flash-exp:free',
    defaultVerificationModel: 'google/gemma-3-27b-it:free',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    value: 'mistral',
    label: 'Mistral',
    description: 'High-performance open and commercial models from France.',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.mistral.ai/v1',
    // pixtral-large-2411 is Mistral\'s latest multimodal (vision) model
    defaultVisionModel: 'pixtral-large-2411',
    defaultVerificationModel: 'mistral-large-latest',
    apiKeyLabel: 'Mistral API Key',
    apiKeyPlaceholder: 'm_...',
    docsUrl: 'https://console.mistral.ai/api-keys/',
  },
  {
    value: 'groq',
    label: 'Groq',
    description: 'The world\'s fastest inference, running on custom LPU hardware.',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    // llama-3.2-90b-vision-preview is Groq\'s most capable vision model
    defaultVisionModel: 'llama-3.2-90b-vision-preview',
    defaultVerificationModel: 'llama-3.3-70b-versatile',
    apiKeyLabel: 'Groq API Key',
    apiKeyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    value: 'custom',
    label: 'Custom (OpenAI-compatible)',
    description: 'vLLM, LM Studio, Mistral, Groq, or any OpenAI-compatible API',
    requiresApiKey: false,
    defaultEndpoint: '',
    defaultVisionModel: '',
    defaultVerificationModel: '',
    apiKeyLabel: 'Custom API Key',
    apiKeyPlaceholder: 'Bearer token or API key',
    docsUrl: '',
  },
];

/** O(1) lookup — returns undefined for unknown values */
export function getProviderMeta(value: string): ProviderMeta | undefined {
  return LLM_PROVIDERS.find((p) => p.value === value);
}

/**
 * Returns the default API endpoint for the given provider.
 * Returns '' for 'custom' and unknown values.
 */
export function getDefaultEndpointForProvider(value: string): string {
  return getProviderMeta(value)?.defaultEndpoint ?? '';
}
