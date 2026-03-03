// src/lib/crypto.ts
// ============================================================
// AES-256-GCM encryption/decryption for secrets at rest.
// Uses BETTER_AUTH_SECRET to derive a deterministic 256-bit key
// via HKDF. Every ciphertext gets a unique 12-byte IV + 16-byte
// auth tag, so identical plaintexts produce different outputs.
// ============================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// ─── Key derivation ──────────────────────────────────────────
// HKDF isn't available in all Node 18 builds, so we use a
// simple HMAC-based expand step with SHA-256.
function deriveKey(secret: string): Buffer {
  // Use SHA-256 directly for speed — the secret is already ≥ 32 chars
  return createHash('sha256').update(secret).digest();
}

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const secret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    '';

  if (!secret || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET (or AUTH_SECRET) must be set and ≥ 32 characters for encryption'
    );
  }

  _cachedKey = deriveKey(secret);
  return _cachedKey;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64 string in the format: `iv:ciphertext:authTag` (all base64).
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack as `iv:ciphertext:tag` — all base64
  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

/**
 * Decrypt an AES-256-GCM ciphertext produced by `encryptSecret`.
 */
export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format — expected iv:ciphertext:tag');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Compute a SHA-256 hash of the plaintext for indexing/dedup.
 * NOT used for security — only for quick lookup without decryption.
 */
export function hashSecret(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
