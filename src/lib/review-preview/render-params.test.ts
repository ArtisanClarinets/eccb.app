import { describe, it, expect } from 'vitest';
import { parseRenderParams } from './render-params';

function makeUrl(params: Record<string, string | number>): URL {
  const u = new URL('https://example.com/api/preview');
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, String(v));
  }
  return u;
}

describe('parseRenderParams', () => {
  it('returns defaults when no params are provided', () => {
    const result = parseRenderParams(new URL('https://example.com/api/preview'));
    expect(result).toEqual({
      pageIndex: 0,
      scale: 3,
      maxWidth: 2000,
      format: 'png',
      quality: 92,
    });
  });

  it('parses valid params correctly', () => {
    const result = parseRenderParams(makeUrl({ page: 2, scale: 4, maxWidth: 1600, format: 'jpeg', quality: 80 }));
    expect(result.pageIndex).toBe(2);
    expect(result.scale).toBe(4);
    expect(result.maxWidth).toBe(1600);
    expect(result.format).toBe('jpeg');
    expect(result.quality).toBe(80);
  });

  describe('scale clamping', () => {
    it('clamps scale below minimum to 1', () => {
      expect(parseRenderParams(makeUrl({ scale: 0 })).scale).toBe(1);
    });
    it('clamps scale above maximum to 6', () => {
      expect(parseRenderParams(makeUrl({ scale: 100 })).scale).toBe(6);
    });
    it('accepts decimal scale within range', () => {
      expect(parseRenderParams(makeUrl({ scale: 2.5 })).scale).toBe(2.5);
    });
  });

  describe('maxWidth clamping', () => {
    it('clamps maxWidth below minimum to 800', () => {
      expect(parseRenderParams(makeUrl({ maxWidth: 100 })).maxWidth).toBe(800);
    });
    it('clamps maxWidth above maximum to 4000', () => {
      expect(parseRenderParams(makeUrl({ maxWidth: 9999 })).maxWidth).toBe(4000);
    });
  });

  describe('quality clamping', () => {
    it('clamps quality below minimum to 60', () => {
      expect(parseRenderParams(makeUrl({ quality: 10 })).quality).toBe(60);
    });
    it('clamps quality above maximum to 100', () => {
      expect(parseRenderParams(makeUrl({ quality: 200 })).quality).toBe(100);
    });
  });

  describe('format validation', () => {
    it('accepts "jpeg"', () => {
      expect(parseRenderParams(makeUrl({ format: 'jpeg' })).format).toBe('jpeg');
    });
    it('defaults unknown format to "png"', () => {
      expect(parseRenderParams(makeUrl({ format: 'webp' })).format).toBe('png');
    });
    it('defaults "gif" to "png"', () => {
      expect(parseRenderParams(makeUrl({ format: 'gif' })).format).toBe('png');
    });
  });

  describe('pageIndex', () => {
    it('rejects negative page numbers — falls back to 0', () => {
      expect(parseRenderParams(makeUrl({ page: -1 })).pageIndex).toBe(0);
    });
    it('accepts page 0', () => {
      expect(parseRenderParams(makeUrl({ page: 0 })).pageIndex).toBe(0);
    });
    it('accepts large valid page numbers', () => {
      expect(parseRenderParams(makeUrl({ page: 99 })).pageIndex).toBe(99);
    });
    it('ignores non-numeric page values — falls back to 0', () => {
      expect(parseRenderParams(makeUrl({ page: 'abc' })).pageIndex).toBe(0);
    });
  });
});
