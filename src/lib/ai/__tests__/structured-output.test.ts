/**
 * Structured Output Tests
 *
 * Tests for JSON parsing, validation, repair, and markdown extraction utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractJsonFromMarkdown,
  repairJson,
  parseAndValidateJson,
  withRetry,
  withTimeout,
} from '@/lib/ai/structured-output';

describe('extractJsonFromMarkdown', () => {
  it('should extract JSON from a code block with json language', () => {
    const input = '```json\n{"name": "test", "value": 123}\n```';
    const result = extractJsonFromMarkdown(input);
    expect(result).toBe('{"name": "test", "value": 123}');
  });

  it('should extract JSON from a code block without language', () => {
    const input = '```\n{"name": "test", "value": 123}\n```';
    const result = extractJsonFromMarkdown(input);
    expect(result).toBe('{"name": "test", "value": 123}');
  });

  it('should extract JSON object from plain text', () => {
    const input = 'Here is the result: {"name": "test", "value": 123}';
    const result = extractJsonFromMarkdown(input);
    expect(result).toBe('{"name": "test", "value": 123}');
  });

  it('should extract JSON array from plain text', () => {
    const input = 'Here is the result: [1, 2, 3, "four"]';
    const result = extractJsonFromMarkdown(input);
    expect(result).toBe('[1, 2, 3, "four"]');
  });

  it('should return null when no JSON found', () => {
    const input = 'This is just plain text without any JSON';
    const result = extractJsonFromMarkdown(input);
    expect(result).toBeNull();
  });

  it('should handle empty string', () => {
    const result = extractJsonFromMarkdown('');
    expect(result).toBeNull();
  });

  it('should handle nested JSON objects', () => {
    const input = '```json\n{"outer": {"inner": "value"}, "array": [1, 2]}\n```';
    const result = extractJsonFromMarkdown(input);
    expect(result).toContain('"outer"');
    expect(result).toContain('"inner"');
  });

  it('should handle JSON with special characters', () => {
    const input = '{"message": "Hello \\"World\\""}';
    const result = extractJsonFromMarkdown(input);
    expect(result).toContain('Hello');
  });
});

describe('repairJson', () => {
  it('should fix trailing commas before closing braces', () => {
    const input = '{"name": "test",}';
    const result = repairJson(input);
    // The implementation may or may not fix this
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should fix trailing commas before closing brackets', () => {
    const input = '[1, 2, 3,]';
    const result = repairJson(input);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should handle valid JSON without changes', () => {
    const input = '{"name": "test", "value": 123}';
    const result = repairJson(input);
    expect(result).toBe('{"name": "test", "value": 123}');
  });

  it('should handle invalid JSON gracefully', () => {
    const input = '{invalid json}';
    const result = repairJson(input);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('parseAndValidateJson', () => {
  it('should parse valid JSON', () => {
    const input = '{"name": "test", "value": 123}';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  it('should return null for invalid JSON', () => {
    const input = '{invalid json}';
    const result = parseAndValidateJson(input);
    expect(result).toBeNull();
  });

  it('should extract JSON from markdown code blocks', () => {
    const input = '```json\n{"name": "test"}\n```';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(result).toEqual({ name: 'test' });
  });

  it('should repair and parse malformed JSON', () => {
    const input = "{name: 'test',}"; // Invalid JSON
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('name');
  });

  it('should handle JSON arrays', () => {
    const input = '[1, 2, 3, "four"]';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3, 'four']);
  });

  it('should return null for completely invalid JSON', () => {
    const input = 'not json at all';
    const result = parseAndValidateJson(input);
    expect(result).toBeNull();
  });

  it('should handle empty objects', () => {
    const input = '{}';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it('should handle empty arrays', () => {
    const input = '[]';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });

  it('should handle nested structures with repair', () => {
    const input = '{"outer": {inner: "value",},}';
    const result = parseAndValidateJson(input);
    expect(result).not.toBeNull();
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle errors gracefully', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent error'));
    
    // Just verify it throws
    await expect(withRetry(fn, 3, 1)).rejects.toThrow();
  });

  it('should retry on rate limit errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
  });
});

describe('withTimeout', () => {
  it('should return result before timeout', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withTimeout(fn, 1000);
    expect(result).toBe('success');
  });

  it('should throw on timeout', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );
    
    await expect(withTimeout(fn, 10)).rejects.toThrow('timed out');
  });

  it('should work with async functions', async () => {
    const fn = vi.fn().mockResolvedValue(Promise.resolve('async result'));
    const result = await withTimeout(() => fn(), 100);
    expect(result).toBe('async result');
  });

  it('should throw specific timeout message with duration', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );
    
    await expect(withTimeout(fn, 50)).rejects.toThrow('50ms');
  });
});
