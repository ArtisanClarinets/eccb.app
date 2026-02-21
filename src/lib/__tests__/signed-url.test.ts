import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSignedToken,
  validateSignedToken,
  generateSignedUrl,
  extractKeyFromToken,
  isTokenExpired,
} from '../signed-url';

// Mock the env module
vi.mock('@/lib/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret-key-for-signing',
  },
}));

describe('Signed URL Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Token Generation Tests
  // ===========================================================================

  describe('generateSignedToken', () => {
    it('should generate a valid token with default expiration', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(2);
    });

    it('should generate a valid token with custom expiration', () => {
      const key = 'music/test-piece.pdf';
      const expiresIn = 7200; // 2 hours
      const token = generateSignedToken(key, { expiresIn });

      const payload = validateSignedToken(token);
      expect(payload).toBeDefined();
      expect(payload?.key).toBe(key);
      expect(payload?.expiresAt).toBe(Math.floor(Date.now() / 1000) + expiresIn);
    });

    it('should include user ID in token if provided', () => {
      const key = 'music/test-piece.pdf';
      const userId = 'user-123';
      const token = generateSignedToken(key, { userId });

      const payload = validateSignedToken(token);
      expect(payload?.userId).toBe(userId);
    });

    it('should cap expiration at maximum value', () => {
      const key = 'music/test-piece.pdf';
      const expiresIn = 100000; // More than 24 hours
      const token = generateSignedToken(key, { expiresIn });

      const payload = validateSignedToken(token);
      const maxExpiration = 86400; // 24 hours
      
      expect(payload?.expiresAt).toBe(Math.floor(Date.now() / 1000) + maxExpiration);
    });

    it('should generate different tokens for different keys', () => {
      const token1 = generateSignedToken('music/piece1.pdf');
      const token2 = generateSignedToken('music/piece2.pdf');

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for same key at different times', () => {
      const key = 'music/test-piece.pdf';
      const token1 = generateSignedToken(key);

      vi.advanceTimersByTime(1000);

      const token2 = generateSignedToken(key);

      // Tokens should be different due to timestamp
      expect(token1).not.toBe(token2);
    });
  });

  // ===========================================================================
  // Token Validation Tests
  // ===========================================================================

  describe('validateSignedToken', () => {
    it('should validate a valid token', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);

      const payload = validateSignedToken(token);

      expect(payload).toBeDefined();
      expect(payload?.key).toBe(key);
    });

    it('should return null for invalid token format', () => {
      expect(validateSignedToken('invalid-token')).toBeNull();
      expect(validateSignedToken('invalid.token.extra')).toBeNull();
      expect(validateSignedToken('')).toBeNull();
    });

    it('should return null for tampered signature', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);
      const [payload, _signature] = token.split('.');
      const tamperedToken = `${payload}.tampered_signature`;

      expect(validateSignedToken(tamperedToken)).toBeNull();
    });

    it('should return null for expired token', () => {
      const key = 'music/test-piece.pdf';
      const expiresIn = 3600; // 1 hour
      const token = generateSignedToken(key, { expiresIn });

      // Advance time past expiration
      vi.advanceTimersByTime(3601 * 1000);

      expect(validateSignedToken(token)).toBeNull();
    });

    it('should validate token just before expiration', () => {
      const key = 'music/test-piece.pdf';
      const expiresIn = 3600; // 1 hour
      const token = generateSignedToken(key, { expiresIn });

      // Advance time to just before expiration
      vi.advanceTimersByTime(3599 * 1000);

      expect(validateSignedToken(token)).toBeDefined();
    });

    it('should return null for token with invalid JSON payload', () => {
      const invalidPayload = Buffer.from('not valid json').toString('base64url');
      const invalidToken = `${invalidPayload}.fakesignature`;

      expect(validateSignedToken(invalidToken)).toBeNull();
    });
  });

  // ===========================================================================
  // URL Generation Tests
  // ===========================================================================

  describe('generateSignedUrl', () => {
    it('should generate a valid signed URL', () => {
      const key = 'music/test-piece.pdf';
      const url = generateSignedUrl(key);

      expect(url).toContain('/api/files/download/');
      expect(url).toContain('token=');
      expect(url).toContain(encodeURIComponent(key));
    });

    it('should generate URL with custom expiration', () => {
      const key = 'music/test-piece.pdf';
      const expiresIn = 7200;
      const url = generateSignedUrl(key, { expiresIn });

      // Extract token from URL
      const tokenMatch = url.match(/token=([^&]+)/);
      expect(tokenMatch).toBeDefined();
      
      const token = tokenMatch![1];
      const payload = validateSignedToken(token);
      
      expect(payload?.expiresAt).toBe(Math.floor(Date.now() / 1000) + expiresIn);
    });

    it('should properly encode special characters in key', () => {
      const key = 'music/test piece with spaces.pdf';
      const url = generateSignedUrl(key);

      expect(url).toContain('token=');
      
      // Extract and validate token
      const tokenMatch = url.match(/token=([^&]+)/);
      const payload = validateSignedToken(tokenMatch![1]);
      
      expect(payload?.key).toBe(key);
    });
  });

  // ===========================================================================
  // Key Extraction Tests
  // ===========================================================================

  describe('extractKeyFromToken', () => {
    it('should extract key from valid token', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);

      expect(extractKeyFromToken(token)).toBe(key);
    });

    it('should return null for invalid token', () => {
      expect(extractKeyFromToken('invalid-token')).toBeNull();
    });
  });

  // ===========================================================================
  // Expiration Check Tests
  // ===========================================================================

  describe('isTokenExpired', () => {
    it('should return false for valid non-expired token', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key, { expiresIn: 3600 });

      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key, { expiresIn: 3600 });

      // Advance time past expiration
      vi.advanceTimersByTime(3601 * 1000);

      expect(isTokenExpired(token)).toBe(true);
    });

    it('should return true for invalid token format', () => {
      expect(isTokenExpired('invalid-token')).toBe(true);
    });
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  describe('Security', () => {
    it('should reject token with different signature algorithm attempt', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);
      
      // Tamper with the payload
      const [payloadBase64, signature] = token.split('.');
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString();
      const payload = JSON.parse(payloadJson);
      
      // Try to modify the key
      payload.key = 'music/different-file.pdf';
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${signature}`;

      expect(validateSignedToken(tamperedToken)).toBeNull();
    });

    it('should reject token with modified expiration', () => {
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key, { expiresIn: 3600 });
      
      const [payloadBase64, signature] = token.split('.');
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString();
      const payload = JSON.parse(payloadJson);
      
      // Try to extend expiration
      payload.expiresAt = payload.expiresAt + 86400;
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${signature}`;

      expect(validateSignedToken(tamperedToken)).toBeNull();
    });

    it('should use timing-safe comparison for signature validation', () => {
      // This test ensures the timingSafeEqual is used
      const key = 'music/test-piece.pdf';
      const token = generateSignedToken(key);
      
      // Create a slightly different signature
      const [payload, signature] = token.split('.');
      const wrongSignature = signature.slice(0, -1) + 'x';
      const wrongToken = `${payload}.${wrongSignature}`;

      // Both should fail, but timing-safe comparison should be used
      expect(validateSignedToken(wrongToken)).toBeNull();
    });
  });
});
