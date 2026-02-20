/**
 * AI Provider Configuration
 *
 * Configuration for all supported AI providers.
 * Used by the settings service to manage provider configurations.
 */

export interface ProviderConfig {
  id: string;
  displayName: string;
  description: string;
  baseUrl: string;
  modelsEndpoint?: string;
  testEndpoint?: string;
  headerFormat: 'bearer' | 'x-api-key';
  apiKeyHeaderName: string;
  defaultModel?: string;
  supportsVision?: boolean;
  supportsStructuredOutput?: boolean;
}

/**
 * Registry of all supported AI providers
 */
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o models for high-quality extraction',
    baseUrl: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
    testEndpoint: '/models/gpt-4o-mini',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    defaultModel: 'gpt-4o-mini',
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models for reasoning',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsEndpoint: '/models',
    testEndpoint: '/messages',
    headerFormat: 'x-api-key',
    apiKeyHeaderName: 'x-api-key',
    defaultModel: 'claude-3-haiku-20240307',
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'google',
    displayName: 'Google (Gemini)',
    description: 'Gemini Flash for fast, cheap extraction',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsEndpoint: '/models',
    testEndpoint: '/models/gemini-1.5-flash',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    defaultModel: 'gemini-1.5-flash',
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral models for efficient extraction',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsEndpoint: '/models',
    testEndpoint: '/models/mistral-small-latest',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    defaultModel: 'mistral-small-latest',
    supportsVision: false,
    supportsStructuredOutput: true,
  },
  {
    id: 'cohere',
    displayName: 'Cohere',
    description: 'Cohere models for text generation',
    baseUrl: 'https://api.cohere.ai/v1',
    modelsEndpoint: '/models',
    testEndpoint: '/models/command-r',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    defaultModel: 'command-r',
    supportsVision: false,
    supportsStructuredOutput: true,
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Aggregator with access to many models',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
    testEndpoint: '/models',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    defaultModel: 'openai/gpt-4o-mini',
    supportsVision: true,
    supportsStructuredOutput: true,
  },
];

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return PROVIDER_CONFIGS.find((p) => p.id === providerId);
}

/**
 * Get all provider IDs
 */
export function getAllProviderIds(): string[] {
  return PROVIDER_CONFIGS.map((p) => p.id);
}

/**
 * Check if a provider exists
 */
export function isValidProvider(providerId: string): boolean {
  return PROVIDER_CONFIGS.some((p) => p.id === providerId);
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(providerId: string): string {
  const provider = getProviderConfig(providerId);
  return provider?.displayName ?? providerId;
}
