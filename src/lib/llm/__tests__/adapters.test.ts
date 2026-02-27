import { describe, it, expect } from 'vitest';
import { getAdapter } from '../index';
import { OpenAIAdapter } from '../openai';
import { AnthropicAdapter } from '../anthropic';
import { GeminiAdapter } from '../gemini';
import { OpenRouterAdapter } from '../openrouter';

describe('LLM Adapters', () => {
  const mockConfig = {
    llm_provider: 'openai' as const,
    llm_openai_api_key: 'sk-test',
    llm_anthropic_api_key: 'sk-ant-test',
    llm_gemini_api_key: 'gemini-test',
    llm_openrouter_api_key: 'sk-or-test',
    llm_vision_model: 'gpt-4-turbo',
  };

  describe('getAdapter', () => {
    it('should return OpenAI adapter for openai provider', async () => {
      const adapter = await getAdapter('openai');
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it('should return Anthropic adapter for anthropic provider', async () => {
      const adapter = await getAdapter('anthropic');
      expect(adapter).toBeInstanceOf(AnthropicAdapter);
    });

    it('should return Gemini adapter for gemini provider', async () => {
      const adapter = await getAdapter('gemini');
      expect(adapter).toBeInstanceOf(GeminiAdapter);
    });

    it('should return OpenRouter adapter for openrouter provider', async () => {
      const adapter = await getAdapter('openrouter');
      expect(adapter).toBeInstanceOf(OpenRouterAdapter);
    });

    it('should return OpenAI adapter for custom provider', async () => {
      const adapter = await getAdapter('custom');
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it('should return OpenAI adapter for ollama provider', async () => {
      const adapter = await getAdapter('ollama');
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it('should default to OpenAI adapter for unknown provider', async () => {
      const adapter = await getAdapter('unknown');
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });
  });

  describe('OpenAI Adapter', () => {
    const adapter = new OpenAIAdapter();

    it('should build correct request', () => {
      const request = {
        images: [{ mimeType: 'image/png', base64Data: 'base64data' }],
        prompt: 'Extract metadata',
        maxTokens: 4000,
        temperature: 0.1,
      };

      const result = adapter.buildRequest(mockConfig, request);

      expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
      expect(result.headers['Authorization']).toBe('Bearer sk-test');
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.body).toHaveProperty('model', 'gpt-4-turbo');
      expect(result.body).toHaveProperty('messages');
      expect(result.body).toHaveProperty('max_tokens', 4000);
      expect(result.body).toHaveProperty('temperature', 0.1);
    });

    it('should use custom endpoint when provided', () => {
      const configWithEndpoint = {
        ...mockConfig,
        llm_endpoint_url: 'https://custom.openai.com/v1/',
      };

      const result = adapter.buildRequest(configWithEndpoint, {
        images: [],
        prompt: 'test',
      });

      expect(result.url).toBe('https://custom.openai.com/v1/chat/completions');
    });

    it('should parse response correctly', () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test response' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };

      const result = adapter.parseResponse(mockResponse);

      expect(result.content).toBe('Test response');
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
      });
    });

    it('should throw error when API key is missing', () => {
      const configWithoutKey = { ...mockConfig, llm_openai_api_key: undefined };

      expect(() =>
        adapter.buildRequest(configWithoutKey, { images: [], prompt: 'test' })
      ).toThrow('OpenAI API key is required');
    });
  });

  describe('Anthropic Adapter', () => {
    const adapter = new AnthropicAdapter();

    it('should build correct request', () => {
      const anthropicConfig = {
        ...mockConfig,
        llm_vision_model: 'claude-3-5-sonnet-20241022',
      };
      const request = {
        images: [{ mimeType: 'image/png', base64Data: 'base64data' }],
        prompt: 'Extract metadata',
        maxTokens: 4000,
        temperature: 0.1,
      };

      const result = adapter.buildRequest(anthropicConfig, request);

      expect(result.url).toBe('https://api.anthropic.com/v1/messages');
      expect(result.headers['x-api-key']).toBe('sk-ant-test');
      expect(result.headers['anthropic-version']).toBe('2023-06-01');
      expect(result.body).toHaveProperty('model', 'claude-3-5-sonnet-20241022');
    });

    it('should parse Anthropic response correctly', () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const result = adapter.parseResponse(mockResponse);

      expect(result.content).toBe('Test response');
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
      });
    });

    it('should throw error when API key is missing', () => {
      const configWithoutKey = { ...mockConfig, llm_anthropic_api_key: undefined };

      expect(() =>
        adapter.buildRequest(configWithoutKey, { images: [], prompt: 'test' })
      ).toThrow('Anthropic API key is required');
    });
  });

  describe('Adapter Security', () => {
    it('should use different API keys for different providers', () => {
      const openaiAdapter = new OpenAIAdapter();
      const anthropicAdapter = new AnthropicAdapter();

      const openaiResult = openaiAdapter.buildRequest(mockConfig, {
        images: [],
        prompt: 'test',
      });

      const anthropicResult = anthropicAdapter.buildRequest(mockConfig, {
        images: [],
        prompt: 'test',
      });

      expect(openaiResult.headers['Authorization']).toBe('Bearer sk-test');
      expect(anthropicResult.headers['x-api-key']).toBe('sk-ant-test');
    });
  });

  describe('Anthropic Adapter — configurable endpoint', () => {
    const adapter = new AnthropicAdapter();

    it('uses the default Anthropic endpoint when llm_endpoint_url is empty', () => {
      const result = adapter.buildRequest({ ...mockConfig, llm_provider: 'anthropic', llm_endpoint_url: '' }, { images: [], prompt: 'test' });
      expect(result.url).toMatch(/^https:\/\/api\.anthropic\.com/);
    });

    it('uses a custom endpoint when llm_endpoint_url is set', () => {
      const result = adapter.buildRequest(
        { ...mockConfig, llm_provider: 'anthropic', llm_endpoint_url: 'https://proxy.example.com' },
        { images: [], prompt: 'test' }
      );
      expect(result.url).toMatch(/^https:\/\/proxy\.example\.com/);
      expect(result.url).not.toContain('api.anthropic.com');
    });

    it('strips trailing slash from custom endpoint', () => {
      const result = adapter.buildRequest(
        { ...mockConfig, llm_provider: 'anthropic', llm_endpoint_url: 'https://proxy.example.com/' },
        { images: [], prompt: 'test' }
      );
      // No double-slash after the domain (trailing slash was stripped)
      expect(result.url.replace('://', '')).not.toContain('//');
    });
  });

  describe('Gemini Adapter — configurable endpoint', () => {
    const adapter = new GeminiAdapter();
    const geminiConfig = { ...mockConfig, llm_provider: 'gemini' as const };

    it('uses the default Gemini endpoint when llm_endpoint_url is empty', () => {
      const result = adapter.buildRequest({ ...geminiConfig, llm_endpoint_url: '' }, { images: [], prompt: 'test' });
      expect(result.url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com/);
    });

    it('uses a custom endpoint when llm_endpoint_url is set', () => {
      const result = adapter.buildRequest(
        { ...geminiConfig, llm_endpoint_url: 'https://gemini-proxy.example.com/v1beta' },
        { images: [], prompt: 'test' }
      );
      expect(result.url).toMatch(/^https:\/\/gemini-proxy\.example\.com/);
      expect(result.url).not.toContain('googleapis.com');
    });

    it('URL-encodes the Gemini API key', () => {
      const result = adapter.buildRequest(
        { ...geminiConfig, llm_endpoint_url: '', llm_gemini_api_key: 'key with spaces+special' },
        { images: [], prompt: 'test' }
      );
      expect(result.url).not.toContain('key with spaces');
      expect(result.url).toContain('key%20with%20spaces');
    });
  });

  describe('Ollama Adapter (via OpenAIAdapter)', () => {
    const adapter = new OpenAIAdapter();
    const ollamaConfig = {
      ...mockConfig,
      llm_provider: 'ollama' as const,
      llm_endpoint_url: 'http://localhost:11434',
      // No API key supplied — Ollama doesn't need one
      llm_openai_api_key: undefined,
    };

    it('does not include Authorization header when no API key is provided', () => {
      const result = adapter.buildRequest(ollamaConfig, { images: [], prompt: 'test' });
      expect(result.headers).not.toHaveProperty('Authorization');
    });

    it('normalises bare host to include /v1 automatically', () => {
      const result = adapter.buildRequest(
        { ...ollamaConfig, llm_endpoint_url: 'http://localhost:11434' },
        { images: [], prompt: 'test' }
      );
      expect(result.url).toContain('/v1/');
    });

    it('does not double-add /v1 when endpoint already contains /v1', () => {
      const result = adapter.buildRequest(
        { ...ollamaConfig, llm_endpoint_url: 'http://localhost:11434/v1' },
        { images: [], prompt: 'test' }
      );
      // Should not result in /v1/v1/
      expect(result.url.replace('://', '')).not.toContain('/v1/v1');
    });

    it('never sets Authorization header for ollama — even when a key is supplied — because ollama does not require auth', () => {
      const result = adapter.buildRequest(
        { ...ollamaConfig, llm_openai_api_key: 'ollama-key' },
        { images: [], prompt: 'test' }
      );
      // Ollama adapter hard-codes apiKey = undefined for the 'ollama' case
      expect(result.headers).not.toHaveProperty('Authorization');
    });
  });
});
