import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callVisionModel, LlmNonRetryableError } from '../index';
import type { LLMConfig } from '../types';

// stub getAdapter so we don't hit real network or require API keys
vi.mock('../index', async () => {
  const actual: any = await vi.importActual('../index');
  return {
    ...actual,
    getAdapter: vi.fn().mockResolvedValue({
      buildRequest: (_config: any, request: any) => ({
        url: 'https://fake.example.com',
        headers: {},
        body: request,
      }),
      parseResponse: (json: any) => ({
        output: json,
      }),
    }),
  };
});

const defaultConfig: LLMConfig = {
  llm_provider: 'openai',
  llm_vision_model: 'dummy',
};

describe('callVisionModel retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('retries on 429 and throws generic error after max attempts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rl1', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rl2', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rl3', json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock as any);

    await expect(callVisionModel(defaultConfig, [], 'prompt')).rejects.toThrow(/after 3 attempts/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws LlmNonRetryableError immediately on 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad', json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock as any);

    await expect(callVisionModel(defaultConfig, [], 'p')).rejects.toBeInstanceOf(LlmNonRetryableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
