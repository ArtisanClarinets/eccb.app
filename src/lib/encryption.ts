/**
 * Encryption Utility
 *
 * Provides AES-256-GCM encryption for sensitive data like API keys.
 * Uses ENCRYPTION_KEY environment variable (32 bytes / 64 hex characters).
 */

import crypto from 'crypto';
import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for authentication tag
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment or throw an error
 */
function getEncryptionKey(): Buffer {
  const encryptionKey = env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Please set a 64-character hex-encoded 32-byte key. ' +
      'Example: ENCRYPTION_KEY=$(openssl rand -hex 32)'
    );
  }

  // Validate that it's a valid hex string of correct length
  if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex-encoded 32-byte key. ' +
      'Example: ENCRYPTION_KEY=$(openssl rand -hex 32)'
    );
  }

  return Buffer.from(encryptionKey, 'hex');
}

/**
 * Encrypts a plain text string using AES-256-GCM
 *
 * @param plainText - The string to encrypt
 * @returns The encrypted string (IV:authTag:cipherText in hex)
 */
export function encryptApiKey(plainText: string): string {
  if (!plainText) {
    throw new Error('Cannot encrypt empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV + AuthTag + CipherText
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted string using AES-256-GCM
 *
 * @param encrypted - The encrypted string (IV:authTag:cipherText in hex)
 * @returns The decrypted plain text string
 */
export function decryptApiKey(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty string');
  }

  const parts = encrypted.split(':');

  // Try current 3-part format: IV:authTag:cipherText
  if (parts.length === 3) {
    const [ivHex, authTagHex, cipherText] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Try legacy 2-part format: IV:cipherText (AES-256-CBC)
  if (parts.length === 2) {
    const [ivHex, cipherText] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');

    // Use AES-256-CBC for legacy format
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  throw new Error(
    `Invalid encrypted format. Expected IV:authTag:cipherText or IV:cipherText, got ${parts.length} parts`
  );
}

/**
 * Creates a SHA-256 hash of an API key for validation
 * The hash is stored for quick validation without needing to decrypt
 *
 * @param key - The API key to hash
 * @returns The hex-encoded SHA-256 hash
 */
export function hashApiKey(key: string): string {
  if (!key) {
    throw new Error('Cannot hash empty string');
  }

  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validates that a plain text key matches a stored hash
 *
 * @param plainText - The plain text key to validate
 * @param hash - The stored hash to compare against
 * @returns true if the key matches the hash
 */
export function validateApiKeyHash(plainText: string, hash: string): boolean {
  const computedHash = hashApiKey(plainText);
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(hash, 'hex')
  );
}

/**
 * Generates a new random encryption key
 * Useful for initial setup or key rotation
 *
 * @returns A 64-character hex-encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
