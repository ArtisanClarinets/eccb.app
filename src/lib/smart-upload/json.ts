/**
 * Enterprise-grade JSON Parsing Utilities for Smart Upload
 *
 * Handles the messy reality of LLM output: leading prose, markdown fences,
 * multiple JSON chunks, trailing commas, and partial JSON.
 *
 * SECURITY: Never logs raw content; only logs safe previews (first ~200 chars)
 * with secrets redacted.
 */

import { jsonrepair as repairJson } from 'jsonrepair';

// =============================================================================
// Constants
// =============================================================================

/** Maximum characters to include in log previews */
const LOG_PREVIEW_LENGTH = 200;

// =============================================================================
// Core Utilities
// =============================================================================

/**
 * Strip markdown code fences from LLM output.
 * Handles ```json, ```, and triple backtick variants.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json|JSON|javascript|typescript)?\s*\n?/im, '')
    .replace(/\n?\s*```\s*$/im, '')
    .trim();
}

/**
 * Extract the first top-level JSON object ({...}) from text.
 * Handles leading prose, trailing text, and nested braces.
 *
 * @returns The JSON substring or null if no object found.
 */
export function extractFirstJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(text);

  // Find the first opening brace
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) return null;

  // Track brace depth to find the matching closing brace
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return cleaned.slice(startIdx, i + 1);
      }
    }
  }

  // If we couldn't find balanced braces, fall back to regex
  const regexMatch = cleaned.match(/\{[\s\S]*\}/);
  return regexMatch?.[0] ?? null;
}

/**
 * Extract the first JSON array ([...]) from text.
 * Used for header label responses.
 *
 * @returns The JSON substring or null if no array found.
 */
export function extractFirstJsonArray(text: string): string | null {
  const cleaned = stripCodeFences(text);

  const startIdx = cleaned.indexOf('[');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) {
        return cleaned.slice(startIdx, i + 1);
      }
    }
  }

  const regexMatch = cleaned.match(/\[[\s\S]*\]/);
  return regexMatch?.[0] ?? null;
}

/**
 * Safe preview of text content for logging.
 * Truncates to LOG_PREVIEW_LENGTH and redacts potential secrets.
 */
export function safePreview(text: string): string {
  const preview = text.slice(0, LOG_PREVIEW_LENGTH);
  // Redact anything that looks like an API key pattern
  return preview.replace(/(?:sk-|AIza|gsk_|sk-ant-|sk-or-|m_)[a-zA-Z0-9_-]{10,}/g, '[REDACTED]');
}

// =============================================================================
// Lenient JSON Parser
// =============================================================================

export type ParseJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Parse JSON leniently from LLM output.
 *
 * Strategy:
 * 1. Strip code fences
 * 2. Extract first JSON object (or array)
 * 3. Attempt JSON.parse
 * 4. If that fails, attempt jsonrepair → JSON.parse
 *
 * @param text Raw LLM output text
 * @param mode Whether to extract an 'object' or 'array'
 * @returns Result discriminated union
 */
export function parseJsonLenient<T>(
  text: string,
  mode: 'object' | 'array' = 'object',
): ParseJsonResult<T> {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Input is empty or not a string' };
  }

  const jsonStr =
    mode === 'array' ? extractFirstJsonArray(text) : extractFirstJsonObject(text);

  if (!jsonStr) {
    return {
      ok: false,
      error: `No JSON ${mode} found in response. Preview: ${safePreview(text)}`,
    };
  }

  // Attempt 1: Direct parse
  try {
    const parsed = JSON.parse(jsonStr) as T;
    return { ok: true, value: parsed };
  } catch {
    // Continue to repair
  }

  // Attempt 2: Repair and parse
  try {
    const repaired = repairJson(jsonStr);
    const parsed = JSON.parse(repaired) as T;
    return { ok: true, value: parsed };
  } catch (repairErr) {
    return {
      ok: false,
      error: `JSON parse and repair both failed. Preview: ${safePreview(text)}. Repair error: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
    };
  }
}
