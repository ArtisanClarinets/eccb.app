/**
 * Content Hash Service
 *
 * Provides content hashing for file deduplication.
 * Uses SHA-256 for content-addressable storage keys.
 */

import { createHash } from 'crypto';

import { logger } from '@/lib/logger';
import type { ContentHashResult } from './smart-upload.types';

// =============================================================================
// Hash Functions
// =============================================================================

/**
 * Compute SHA-256 hash of a buffer.
 *
 * @param buffer - Content to hash
 * @returns Hex-encoded SHA-256 hash string
 */
export function computeContentHash(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Compute content hash with algorithm specified.
 * Currently only supports SHA-256.
 *
 * @param buffer - Content to hash
 * @param algorithm - Hash algorithm (default: sha256)
 * @returns ContentHashResult with hash and algorithm
 */
export function computeHash(
  buffer: Buffer,
  algorithm: 'sha256' = 'sha256'
): ContentHashResult {
  if (algorithm !== 'sha256') {
    throw new Error(`Unsupported hash algorithm: ${algorithm}. Only SHA-256 is supported.`);
  }

  const hash = createHash(algorithm);
  hash.update(buffer);
  const hashString = hash.digest('hex');

  logger.debug('Content hash computed', {
    algorithm,
    hashLength: hashString.length,
    bufferSize: buffer.length,
  });

  return {
    hash: hashString,
    algorithm: 'sha256',
  };
}

// =============================================================================
// Browser-Side Hashing (for File API)
// =============================================================================

/**
 * Compute file hash in the browser using Web Crypto API.
 *
 * This is used when hashing files client-side before upload
 * for deduplication purposes.
 *
 * @param file - File object from input or drag-drop
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeFileHash(file: File): Promise<string> {
  logger.debug('Computing file hash in browser', {
    name: file.name,
    size: file.size,
    type: file.type,
  });

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Compute hash
  const hash = computeContentHash(buffer);

  logger.debug('Browser file hash computed', {
    name: file.name,
    hash: hash.substring(0, 8) + '...',
  });

  return hash;
}

/**
 * Compute hash of a blob in browser or Node.js environment.
 *
 * @param blob - Blob or Buffer to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeBlobHash(blob: Blob | Buffer): Promise<string> {
  let buffer: Buffer;

  if (Buffer.isBuffer(blob)) {
    buffer = blob;
  } else if (typeof Blob !== 'undefined' && blob instanceof Blob) {
    // Browser environment
    const arrayBuffer = await blob.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    throw new Error('Invalid blob type. Expected Buffer or Blob.');
  }

  return computeContentHash(buffer);
}

// =============================================================================
// Streaming Hash (for large files)
// =============================================================================

/**
 * Create a streaming hash calculator for large files.
 * This is useful for files that don't fit in memory.
 *
 * @returns Object with update method and digest method
 */
export function createStreamingHash(): {
  update: (chunk: Buffer) => void;
  digest: () => string;
} {
  const hash = createHash('sha256');

  return {
    update: (chunk: Buffer) => {
      hash.update(chunk);
    },
    digest: () => {
      return hash.digest('hex');
    },
  };
}

// =============================================================================
// File Deduplication Helpers
// =============================================================================

/**
 * Generate a content-addressable storage key from file content.
 *
 * Format: {algorithm}/{first2}/{rest}.{extension}
 * Example: sha256/ab/cdef1234567890abcdef1234567890abcdef12.pdf
 *
 * @param buffer - File content buffer
 * @param extension - File extension (without dot)
 * @returns Content-addressable storage key
 */
export function generateContentAddressableKey(
  buffer: Buffer,
  extension: string
): string {
  const hash = computeContentHash(buffer);
  const algo = 'sha256';

  // Use first 2 chars as directory, rest as filename
  const dir = hash.substring(0, 2);
  const filename = hash.substring(2);

  return `${algo}/${dir}/${filename}.${extension}`;
}

/**
 * Generate a short hash for display purposes.
 * Useful for UI elements where full hash is too long.
 *
 * @param buffer - File content buffer
 * @param length - Number of characters to include (default: 8)
 * @returns Short hash string
 */
export function generateShortHash(buffer: Buffer, length: number = 8): string {
  return computeContentHash(buffer).substring(0, length);
}

// =============================================================================
// Verification
// =============================================================================

/**
 * Verify that a buffer matches an expected hash.
 *
 * @param buffer - Content to verify
 * @param expectedHash - Expected hash value
 * @returns True if hashes match
 */
export function verifyHash(buffer: Buffer, expectedHash: string): boolean {
  const actualHash = computeContentHash(buffer);
  return actualHash === expectedHash;
}
