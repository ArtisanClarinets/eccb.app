export interface NormalizedPageContent {
  body: string;
  html: string | null;
  source: 'plain' | 'json-text' | 'json-html' | 'json-unknown';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizePageContent(raw: unknown): NormalizedPageContent {
  if (typeof raw !== 'string') {
    return {
      body: '',
      html: null,
      source: 'plain',
    };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      body: '',
      html: null,
      source: 'plain',
    };
  }

  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return {
      body: raw,
      html: null,
      source: 'plain',
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return {
        body: raw,
        html: null,
        source: 'json-unknown',
      };
    }

    if (typeof record.text === 'string') {
      return {
        body: record.text,
        html: typeof record.html === 'string' ? record.html : null,
        source: 'json-text',
      };
    }

    if (typeof record.html === 'string') {
      return {
        body: record.html,
        html: record.html,
        source: 'json-html',
      };
    }

    return {
      body: raw,
      html: null,
      source: 'json-unknown',
    };
  } catch {
    return {
      body: raw,
      html: null,
      source: 'plain',
    };
  }
}
