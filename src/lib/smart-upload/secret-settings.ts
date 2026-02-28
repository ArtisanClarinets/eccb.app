/**
 * Secret Settings Helpers
 *
 * Isolated, testable functions for masking and merging API-key values
 * in Smart Upload settings. Used by the settings API route and tests.
 */

// Sentinel values that the UI/API uses as placeholders
const MASKED_SENTINELS = new Set(['__SET__', '__UNSET__', '***', '******']);

/**
 * Mask a secret value for safe API responses.
 *
 * @returns `"__SET__"` when a non-empty value is present, `""` otherwise.
 */
export function maskSecretValue(value: string | null | undefined): string {
  if (value != null && value.length > 0) {
    return '__SET__';
  }
  return '';
}

/**
 * Merge an incoming secret value with the currently-stored value.
 *
 * Rules:
 * - If `incoming` is a masked sentinel (`__SET__`, `***`, etc.) → keep `current` unchanged.
 * - If `incoming` is `""` or whitespace-only → keep `current` unchanged (blank = no change).
 * - If `incoming` is `"__CLEAR__"` → explicit clear, return `null`.
 * - Otherwise → treat as new secret, return `incoming`.
 */
export function mergeSecretUpdate(
  current: string | null | undefined,
  incoming: string,
): string | null {
  // Sentinel → no change
  if (MASKED_SENTINELS.has(incoming)) {
    return current ?? null;
  }

  // Explicit clear
  if (incoming === '__CLEAR__') {
    return null;
  }

  // Blank / whitespace → no change
  if (incoming.trim().length === 0) {
    return current ?? null;
  }

  // Real new value
  return incoming;
}
