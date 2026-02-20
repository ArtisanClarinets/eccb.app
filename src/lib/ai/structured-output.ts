/**
 * Structured Output Utilities
 *
 * Provides utilities for parsing and validating JSON responses from AI models.
 * Includes repair functions for common JSON errors.
 */

import { z } from 'zod';

/**
 * Attempts to extract JSON from a markdown code block
 *
 * @param text - The text potentially containing JSON in markdown
 * @returns The extracted JSON string or null if not found
 */
export function extractJsonFromMarkdown(text: string): string | null {
  // Try to find JSON in a code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object at the root level
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Try to find JSON array at the root level
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return null;
}

/**
 * Attempts to repair common JSON errors
 *
 * @param raw - The raw JSON string to repair
 * @returns The repaired JSON string
 */
export function repairJson(raw: string): string {
  let repaired = raw.trim();

  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Fix unquoted property names
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes
  repaired = repaired.replace(/'/g, '"');

  // Fix missing quotes around string values (simple cases)
  repaired = repaired.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*([,}])/g, ':"$1"$2');

  // Remove control characters using unicode ranges
  repaired = repaired.replace(/[\x00-\x1F\x7F]/g, '');

  // Try to fix unclosed strings
  const openQuotes = (repaired.match(/"/g) || []).length;
  const closeQuotes = (repaired.match(/(?<!\\)"/g) || []).length;
  if (openQuotes > closeQuotes) {
    const missing = openQuotes - closeQuotes;
    repaired += '"'.repeat(missing);
  }

  return repaired;
}

/**
 * Parses and validates JSON against a Zod schema
 *
 * @param raw - The raw JSON string to parse
 * @param _schema - The Zod schema to validate against (currently unused, kept for compatibility)
 * @returns The parsed and validated data, or null if parsing/validation fails
 */
export function parseAndValidateJson<T>(
  raw: string,
  _schema?: z.ZodSchema<T>
): T | null {
  // First try to extract JSON from markdown if present
  let jsonString = extractJsonFromMarkdown(raw);

  if (!jsonString) {
    jsonString = raw;
  }

  // Try to parse the JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    // Try to repair the JSON
    const repaired = repairJson(jsonString);
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  // Validate against the schema if provided
  if (_schema) {
    try {
      return _schema.parse(parsed);
    } catch {
      return null;
    }
  }

  // Return as T if no schema provided
  return parsed as T;
}

/**
 * Creates a retryable wrapper for AI calls with exponential backoff
 *
 * @param fn - The function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @returns The result of the function call
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;

      // Check if the error is retryable
      const isRetryable =
        error instanceof Error &&
        (error.message.includes('rate limit') ||
          error.message.includes('429') ||
          error.message.includes('timeout') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNRESET'));

      if (!isRetryable) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Creates a timeout wrapper for AI calls
 *
 * @param fn - The function to timeout
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The result of the function call, or throws TimeoutError
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}
