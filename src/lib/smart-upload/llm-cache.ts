/**
 * Redis-backed LLM response cache for Smart Upload.
 *
 * Goal: avoid paying for identical LLM calls when the same content hash +
 * prompt template produces a deterministic response (e.g. repeated OCR-first
 * fallback on the same file, or a retry after a transient error).
 *
 * Key design:
 * - Cache key = SHA-256(provider + model + systemPrompt + userPrompt + sorted image hashes)
 * - Cached value = raw LLM text response (JSON string as returned by callVisionModel)
 * - TTL is configurable via DB setting smart_upload_llm_cache_ttl_seconds (default 24 h)
 * - Cache is a read-through write-through wrapper; callers keep the same interface
 * - Cache failures are NEVER fatal — fail open so the LLM call proceeds normally
 */

import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

const CACHE_KEY_PREFIX = 'llm-cache:su:v1:';

// ============================================================================
// Key building
// ============================================================================

export interface LlmCacheKeyInput {
  provider: string;
  model: string;
  systemPrompt?: string | null;
  userPrompt: string;
  /** Base-64 encoded images (order-independent — sorted before hashing) */
  imageBase64List?: string[];
  /** Base-64 encoded documents (PDFs) for native PDF mode (order-independent — sorted before hashing) */
  documentBase64List?: string[];
  /** Any extra stable discriminator (e.g. promptVersion) */
  extra?: string;
}

/**
 * Build a deterministic cache key from the LLM call inputs.
 * Images and documents are sorted before hashing to be order-independent.
 */
export function buildLlmCacheKey(input: LlmCacheKeyInput): string {
  const hasher = createHash('sha256');
  hasher.update(input.provider);
  hasher.update('\x00');
  hasher.update(input.model);
  hasher.update('\x00');
  hasher.update(input.systemPrompt ?? '');
  hasher.update('\x00');
  hasher.update(input.userPrompt);
  hasher.update('\x00');

  const images = (input.imageBase64List ?? []).slice().sort();
  for (const img of images) {
    // Hash each image separately to avoid huge memory spikes when concatenating
    hasher.update(createHash('sha256').update(img).digest('hex'));
    hasher.update('\x00');
  }

  // Include document hashes for native PDF mode to prevent cross-document cache collisions
  const documents = (input.documentBase64List ?? []).slice().sort();
  for (const doc of documents) {
    // Hash each document separately to avoid memory spikes with large PDFs
    hasher.update(createHash('sha256').update(doc).digest('hex'));
    hasher.update('\x00');
  }

  if (input.extra) {
    hasher.update(input.extra);
    hasher.update('\x00');
  }

  return CACHE_KEY_PREFIX + hasher.digest('hex');
}

// ============================================================================
// Read / write
// ============================================================================

/**
 * Look up a cached LLM response. Returns `null` on miss or error.
 */
export async function getCachedLlmResponse(cacheKey: string): Promise<string | null> {
  try {
    const value = await redis.get(cacheKey);
    return value;
  } catch (err) {
    logger.warn('LLM cache GET failed (non-fatal)', {
      cacheKey,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Store an LLM response in the cache. Failures are silently ignored.
 */
export async function setCachedLlmResponse(
  cacheKey: string,
  response: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    if (ttlSeconds > 0) {
      await redis.set(cacheKey, response, 'EX', ttlSeconds);
    } else {
      // ttl=0 means no expiry (persistent)
      await redis.set(cacheKey, response);
    }
  } catch (err) {
    logger.warn('LLM cache SET failed (non-fatal)', {
      cacheKey,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Invalidate a specific cache entry (e.g. after a prompt version bump).
 */
export async function invalidateLlmCacheEntry(cacheKey: string): Promise<void> {
  try {
    await redis.del(cacheKey);
  } catch {
    // Swallow — invalidation failures are not fatal
  }
}
