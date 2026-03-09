import { describe, expect, it } from 'vitest';
import { normalizePageContent } from '@/lib/cms/page-content';

describe('normalizePageContent', () => {
  it('returns canonical string body for plain content', () => {
    const result = normalizePageContent('Hello\nWorld');
    expect(result.body).toBe('Hello\nWorld');
    expect(result.html).toBeNull();
  });

  it('extracts text from legacy json-string content', () => {
    const result = normalizePageContent('{"text":"Legacy body","type":"markdown"}');
    expect(result.body).toBe('Legacy body');
    expect(result.source).toBe('json-text');
  });

  it('falls back to raw string when json parsing fails', () => {
    const raw = '{not-valid-json';
    const result = normalizePageContent(raw);
    expect(result.body).toBe(raw);
    expect(result.source).toBe('plain');
  });
});
