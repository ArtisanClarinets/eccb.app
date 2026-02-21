/**
 * Provider Registry
 *
 * Provider selection logic based on AI_PROVIDER environment variable.
 * Validates that required API keys are present for the selected provider.
 */

import { env } from '../env';

import { AIProvider, AIProviderId, MissingAPIKeyError } from './types';

import { createOpenAIProvider } from './providers/openai';
import { createAnthropicProvider } from './providers/anthropic';
import { createGeminiProvider } from './providers/gemini';
import { createOpenAICompatibleProvider } from './providers/openai-compatible';
import { createOpenRouterProvider } from './providers/openrouter';
import { createKiloProvider } from './providers/kilo';
import { createCustomProvider } from './providers/custom';

// Cached provider instance
let cachedProvider: AIProvider | null = null;

/**
 * Get the configured AI provider based on environment variables
 *
 * @returns The configured AI provider instance
 * @throws Error if the required API key is not configured
 */
export function getProvider(): AIProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerId = env.AI_PROVIDER;

  cachedProvider = createProvider(providerId);
  return cachedProvider;
}

/**
 * Create a provider instance based on the provider ID
 *
 * @param providerId - The provider ID to create
 * @returns The provider instance
 * @throws Error if the required API key is not configured
 */
function createProvider(providerId: string): AIProvider {
  switch (providerId) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new MissingAPIKeyError('openai', 'OPENAI_API_KEY');
      }
      return createOpenAIProvider();

    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new MissingAPIKeyError('anthropic', 'ANTHROPIC_API_KEY');
      }
      return createAnthropicProvider();

    case 'gemini':
      if (!env.GEMINI_API_KEY) {
        throw new MissingAPIKeyError('gemini', 'GEMINI_API_KEY');
      }
      return createGeminiProvider();

    case 'openai_compat':
      if (!env.OPENAI_COMPAT_BASE_URL) {
        throw new Error(
          'OPENAI_COMPAT_BASE_URL is required for openai_compat provider'
        );
      }
      return createOpenAICompatibleProvider();

    case 'openrouter':
      if (!env.OPENROUTER_API_KEY) {
        throw new MissingAPIKeyError('openrouter', 'OPENROUTER_API_KEY');
      }
      return createOpenRouterProvider();

    case 'kilo':
      // Kilo uses KILO_API_KEY or falls back to OPENAI_API_KEY
      if (!process.env.KILO_API_KEY && !env.OPENAI_API_KEY) {
        throw new MissingAPIKeyError('kilo', 'KILO_API_KEY or OPENAI_API_KEY');
      }
      return createKiloProvider();

    case 'custom':
      if (!env.CUSTOM_AI_BASE_URL) {
        throw new Error('CUSTOM_AI_BASE_URL is required for custom provider');
      }
      return createCustomProvider();

    default:
      throw new Error(`Unknown AI provider: ${providerId}`);
  }
}

/**
 * Check if a specific provider is available and configured
 *
 * @param providerId - The provider ID to check
 * @returns Whether the provider is available
 */
export function isProviderAvailable(providerId: AIProviderId): boolean {
  try {
    switch (providerId) {
      case 'openai':
        return !!env.OPENAI_API_KEY;
      case 'anthropic':
        return !!env.ANTHROPIC_API_KEY;
      case 'gemini':
        return !!env.GEMINI_API_KEY;
      case 'openai_compat':
        return !!env.OPENAI_COMPAT_BASE_URL;
      case 'openrouter':
        return !!env.OPENROUTER_API_KEY;
      case 'kilo':
        return !!process.env.KILO_API_KEY || !!env.OPENAI_API_KEY;
      case 'custom':
        return !!env.CUSTOM_AI_BASE_URL;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get the list of available providers
 *
 * @returns Array of available provider IDs
 */
export function getAvailableProviders(): AIProviderId[] {
  const providers: AIProviderId[] = [];

  if (isProviderAvailable('openai')) providers.push('openai');
  if (isProviderAvailable('anthropic')) providers.push('anthropic');
  if (isProviderAvailable('gemini')) providers.push('gemini');
  if (isProviderAvailable('openai_compat')) providers.push('openai_compat');
  if (isProviderAvailable('openrouter')) providers.push('openrouter');
  if (isProviderAvailable('kilo')) providers.push('kilo');
  if (isProviderAvailable('custom')) providers.push('custom');

  return providers;
}

/**
 * Reset the cached provider (useful for testing)
 */
export function resetProviderCache(): void {
  cachedProvider = null;
}

/**
 * Get the current provider ID
 *
 * @returns The current provider ID from environment
 */
export function getProviderId(): AIProviderId {
  return env.AI_PROVIDER as AIProviderId;
}
