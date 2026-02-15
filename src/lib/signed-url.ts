import crypto from 'crypto';
import { env } from '@/lib/env';

// =============================================================================
// Types
// =============================================================================

export interface SignedUrlToken {
  key: string;
  expiresAt: number;
  userId?: string;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  userId?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_EXPIRATION = 3600; // 1 hour
const MAX_EXPIRATION = 86400; // 24 hours

// =============================================================================
// Token Generation & Validation
// =============================================================================

/**
 * Get the secret key for signing tokens.
 * Uses BETTER_AUTH_SECRET if available, otherwise generates a deterministic key.
 */
function getSigningKey(): string {
  const secret = env.BETTER_AUTH_SECRET || 'eccb-signed-url-secret-key';
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32);
}

/**
 * Generate a signed URL token for local storage file downloads.
 * 
 * @param key - The storage key (file path)
 * @param options - Token options including expiration time
 * @returns A signed token string
 */
export function generateSignedToken(
  key: string,
  options: SignedUrlOptions = {}
): string {
  const expiresIn = Math.min(
    options.expiresIn || DEFAULT_EXPIRATION,
    MAX_EXPIRATION
  );
  
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  
  const payload: SignedUrlToken = {
    key,
    expiresAt,
    userId: options.userId,
  };
  
  // Encode payload
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64url');
  
  // Generate signature
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(payloadBase64)
    .digest('base64url');
  
  // Return token as payload.signature
  return `${payloadBase64}.${signature}`;
}

/**
 * Validate a signed URL token.
 * 
 * @param token - The token to validate
 * @returns The decoded token payload if valid, null otherwise
 */
export function validateSignedToken(token: string): SignedUrlToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    
    const [payloadBase64, signature] = parts;
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', getSigningKey())
      .update(payloadBase64)
      .digest('base64url');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      return null;
    }
    
    // Decode payload
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString();
    const payload: SignedUrlToken = JSON.parse(payloadJson);
    
    // Check expiration
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a signed download URL for local storage.
 * 
 * @param key - The storage key (file path)
 * @param options - URL options including expiration time
 * @returns A signed URL path
 */
export function generateSignedUrl(
  key: string,
  options: SignedUrlOptions = {}
): string {
  const token = generateSignedToken(key, options);
  return `/api/files/download/${encodeURIComponent(key)}?token=${token}`;
}

/**
 * Extract storage key from a signed URL token.
 * This is useful for logging and validation.
 * 
 * @param token - The signed token
 * @returns The storage key if valid, null otherwise
 */
export function extractKeyFromToken(token: string): string | null {
  const payload = validateSignedToken(token);
  return payload?.key || null;
}

/**
 * Check if a token is expired without validating signature.
 * Useful for providing better error messages.
 * 
 * @param token - The token to check
 * @returns True if the token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return true;
    }
    
    const [payloadBase64] = parts;
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString();
    const payload: SignedUrlToken = JSON.parse(payloadJson);
    
    return payload.expiresAt < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}
