import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateCSRF, csrfValidationResponse, generateCSRFToken } from '../csrf';

// Mock the env module
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'development',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

describe('CSRF Validation', () => {
  describe('validateCSRF', () => {
    it('should allow GET requests without CSRF validation', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should allow HEAD requests without CSRF validation', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'HEAD',
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should allow OPTIONS requests without CSRF validation', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should validate POST requests with matching Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'http://localhost:3000',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should validate PUT requests with matching Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'PUT',
        headers: {
          'origin': 'http://localhost:3000',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should validate DELETE requests with matching Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'DELETE',
        headers: {
          'origin': 'http://localhost:3000',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should validate PATCH requests with matching Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'PATCH',
        headers: {
          'origin': 'http://localhost:3000',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should reject POST requests with mismatched Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'https://evil.com',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Origin mismatch');
    });

    it('should reject POST requests without Origin or Referer headers', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing Origin and Referer headers');
    });

    it('should validate POST requests using Referer as fallback', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'referer': 'http://localhost:3000/some-page',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });

    it('should reject POST requests with mismatched Referer origin', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'referer': 'https://evil.com/some-page',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Referer origin mismatch');
    });

    it('should reject POST requests with invalid Referer URL', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'referer': 'not-a-valid-url',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid Referer header');
    });

    it('should reject POST requests without Host header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'http://localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unable to determine expected origin');
    });

    it('should reject requests with API key header (not configured)', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'x-api-key': 'some-api-key',
          'host': 'localhost:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('API key authentication not configured');
    });

    it('should allow 127.0.0.1 as localhost in development', () => {
      const request = new NextRequest('http://127.0.0.1:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'http://127.0.0.1:3000',
          'host': '127.0.0.1:3000',
        },
      });
      
      const result = validateCSRF(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('csrfValidationResponse', () => {
    it('should return null for valid requests', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'http://localhost:3000',
          'host': 'localhost:3000',
        },
      });
      
      const response = csrfValidationResponse(request);
      expect(response).toBeNull();
    });

    it('should return 403 response for invalid requests', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'https://evil.com',
          'host': 'localhost:3000',
        },
      });
      
      const response = csrfValidationResponse(request);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should include error details in response body', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'origin': 'https://evil.com',
          'host': 'localhost:3000',
        },
      });
      
      const response = csrfValidationResponse(request);
      const body = await response?.json();
      
      expect(body).toHaveProperty('error', 'CSRF validation failed');
      expect(body).toHaveProperty('reason');
      expect(body.reason).toContain('Origin mismatch');
    });
  });

  describe('generateCSRFToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = generateCSRFToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCSRFToken());
      }
      expect(tokens.size).toBe(100);
    });
  });
});
