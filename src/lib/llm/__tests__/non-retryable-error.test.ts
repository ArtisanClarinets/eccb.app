/**
 * Tests for LlmNonRetryableError — verifies the error class behaves correctly
 * so that callers can distinguish non-retryable (4xx) failures from transient ones.
 */

import { describe, it, expect } from 'vitest';
import { LlmNonRetryableError } from '../index';

describe('LlmNonRetryableError', () => {
  it('is an instance of Error', () => {
    const err = new LlmNonRetryableError('bad request', 400);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new LlmNonRetryableError('bad request', 400);
    expect(err.name).toBe('LlmNonRetryableError');
  });

  it('preserves the message', () => {
    const err = new LlmNonRetryableError('model does not support images', 400);
    expect(err.message).toBe('model does not support images');
  });

  it('exposes the HTTP status code', () => {
    const err = new LlmNonRetryableError('unauthorized', 401);
    expect(err.status).toBe(401);
  });

  it('preserves different 4xx status codes', () => {
    const err403 = new LlmNonRetryableError('forbidden', 403);
    const err422 = new LlmNonRetryableError('unprocessable', 422);
    expect(err403.status).toBe(403);
    expect(err422.status).toBe(422);
  });

  it('can be caught and identified by instanceof', () => {
    const err = new LlmNonRetryableError('bad request', 400);
    let caught: unknown;
    try {
      throw err;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LlmNonRetryableError);
    expect((caught as LlmNonRetryableError).status).toBe(400);
  });
});
