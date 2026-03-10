import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callVisionModel, LlmNonRetryableError } from '../index';
import type { LLMConfig } from '../types';

const mockGetAdapter = vi.hoisted(() => vi.fn().mockResolvedValue({
  buildRequest: vi.fn().mockReturnValue({
    url: 'https://fake.example.com',
    headers: {},
    body: {},
  }),
  parseResponse: vi.fn().mockReturnValue({
    output: 'mocked output',
  }),
}));

vi.mock('../index', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getAdapter: mockGetAdapter,
  };
});

const defaultConfig: LLMConfig = {
  llm_provider: 'openai',
  llm_vision_model: 'dummy',
  llm_openai_api_key: 'fake-key',
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

    const promise = callVisionModel(defaultConfig, [], 'prompt');
    // Fast-forward through exponential backoff delays (1000ms, 2000ms)
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/after 3 attempts|LLM call failed/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws LlmNonRetryableError immediately on 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad', json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock as any);

    const promise = callVisionModel(defaultConfig, [], 'p');
    // Ensure all mocked timer events are processed so that await rejects
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(LlmNonRetryableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
