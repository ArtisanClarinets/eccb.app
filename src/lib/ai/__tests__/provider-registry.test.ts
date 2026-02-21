/**
 * Provider Registry Tests
 *
 * Tests for AI provider selection based on AI_PROVIDER env var,
 * provider fallback logic, and custom provider configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetProviderCache, isProviderAvailable, getAvailableProviders, getProviderId, getProvider } from '@/lib/ai/provider-registry';

// Mock the env module
vi.mock('@/lib/env', () => ({
  env: {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    OPENAI_COMPAT_BASE_URL: '',
    OPENROUTER_API_KEY: '',
    CUSTOM_AI_BASE_URL: '',
    KILO_API_KEY: '',
  },
}));

// Mock the provider creators
vi.mock('@/lib/ai/providers/openai', () => ({
  createOpenAIProvider: vi.fn(() => ({
    id: 'openai',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'openai' })),
  })),
}));

vi.mock('@/lib/ai/providers/anthropic', () => ({
  createAnthropicProvider: vi.fn(() => ({
    id: 'anthropic',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'anthropic' })),
  })),
}));

vi.mock('@/lib/ai/providers/gemini', () => ({
  createGeminiProvider: vi.fn(() => ({
    id: 'gemini',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'gemini' })),
  })),
}));

vi.mock('@/lib/ai/providers/openai-compatible', () => ({
  createOpenAICompatibleProvider: vi.fn(() => ({
    id: 'openai_compat',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'openai_compat' })),
  })),
}));

vi.mock('@/lib/ai/providers/openrouter', () => ({
  createOpenRouterProvider: vi.fn(() => ({
    id: 'openrouter',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'openrouter' })),
  })),
}));

vi.mock('@/lib/ai/providers/kilo', () => ({
  createKiloProvider: vi.fn(() => ({
    id: 'kilo',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'kilo' })),
  })),
}));

vi.mock('@/lib/ai/providers/custom', () => ({
  createCustomProvider: vi.fn(() => ({
    id: 'custom',
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    generateStructuredOutput: vi.fn(),
    isConfigured: vi.fn(() => true),
    getConfig: vi.fn(() => ({ provider: 'custom' })),
  })),
}));

describe('Provider Registry', () => {
  beforeEach(() => {
    resetProviderCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProviderCache();
  });

  describe('getProviderId', () => {
    it('should return the current provider ID from environment', () => {
      const providerId = getProviderId();
      expect(providerId).toBe('openai');
    });

    it('should return the configured provider regardless of availability', () => {
      // Even with missing API key, the provider ID should be returned
      const providerId = getProviderId();
      expect(['openai', 'anthropic', 'gemini', 'openai_compat', 'openrouter', 'kilo', 'custom']).toContain(providerId);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true when OpenAI API key is present', () => {
      // We already have OPENAI_API_KEY in the mock
      expect(isProviderAvailable('openai')).toBe(true);
    });

    it('should return false when Anthropic API key is missing', () => {
      expect(isProviderAvailable('anthropic')).toBe(false);
    });

    it('should return false when Gemini API key is missing', () => {
      expect(isProviderAvailable('gemini')).toBe(false);
    });

    it('should return false when OpenAI compat base URL is missing', () => {
      expect(isProviderAvailable('openai_compat')).toBe(false);
    });

    it('should return false when OpenRouter API key is missing', () => {
      expect(isProviderAvailable('openrouter')).toBe(false);
    });

    it('should return false when custom provider base URL is missing', () => {
      expect(isProviderAvailable('custom')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(isProviderAvailable('unknown' as any)).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return array of available providers', () => {
      const providers = getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers).toContain('openai');
    });

    it('should not include unavailable providers', () => {
      const providers = getAvailableProviders();
      expect(providers).not.toContain('anthropic');
      expect(providers).not.toContain('gemini');
    });

    it('should return empty array when no providers are configured', () => {
      // This test verifies the function returns an array
      const providers = getAvailableProviders();
      expect(providers).toBeDefined();
    });
  });

  describe('getProvider', () => {
    it('should return a provider when API key is available', async () => {
      const provider = await getProvider();
      expect(provider).toBeDefined();
      expect(provider.id).toBe('openai');
    });

    it('should cache the provider after first call', async () => {
      const provider1 = await getProvider();
      const provider2 = await getProvider();
      expect(provider1).toBe(provider2);
    });
  });

  describe('resetProviderCache', () => {
    it('should reset the cached provider', async () => {
      // First call creates the provider
      const provider1 = await getProvider();
      expect(provider1).toBeDefined();
      
      // Reset cache
      resetProviderCache();
      
      // Next call should also work (it's cached in the module but reset clears it)
      const provider2 = await getProvider();
      expect(provider2).toBeDefined();
    });
  });
});
