import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

function getCookieHeader(storageStatePath: string): string {
  const storageState = JSON.parse(readFileSync(storageStatePath, 'utf8')) as {
    cookies?: Array<{ name: string; value: string }>;
  };

  return (storageState.cookies ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

const ADMIN_COOKIE_HEADER = getCookieHeader('e2e/.auth/admin.json');

test.describe('Auth API', () => {
  test.describe('Better Auth Endpoints', () => {
    test('should have sign-in endpoint available', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          email: 'invalid@example.com',
          password: 'wrongpassword',
        },
      });

      // Should return error for invalid credentials
      expect(response.status()).toBe(401);
    });

    test('should return error for invalid credentials', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: expect.stringMatching(/invalid email or password/i),
      });
    });

    test('should return error for missing email', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          password: 'password123',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should return error for missing password', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          email: 'test@example.com',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should create a new account with a unique email', async ({ request }) => {
      const email = `signup-${Date.now()}@eccb.app`;
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email,
          password: 'TestPass123!',
          name: 'Test User',
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.user).toMatchObject({
        email,
        name: 'Test User',
      });
    });

    test('should reject weak password', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: 'newuser@test.com',
          password: '123',
          name: 'Test User',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'PASSWORD_TOO_SHORT',
        message: expect.stringMatching(/password.*short/i),
      });
    });

    test('should return not found for disabled forgot password endpoint', async ({ request }) => {
      const response = await request.post('/api/auth/forgot-password', {
        data: {
          email: 'e2e-user@eccb.app',
        },
      });

      expect(response.status()).toBe(404);
    });

    test('should reject invalid email format', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: 'not-an-email',
          password: 'TestPass123!',
          name: 'Test User',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should return null from the current session endpoint when unauthenticated', async ({ request }) => {
      const response = await request.get('/api/auth/get-session');

      expect(response.status()).toBe(200);
      expect(await response.json()).toBeNull();
    });

    test('should return CSRF token', async ({ request }) => {
      const response = await request.get('/api/auth/csrf');

      // CSRF endpoint might exist
      expect([200, 404]).toContain(response.status());
    });

    test('should handle OAuth provider not found', async ({ request }) => {
      const response = await request.get('/api/auth/sign-in/social?provider=nonexistent');

      expect([400, 404]).toContain(response.status());
    });
  });

  test.describe('Protected API Endpoints', () => {
    test('should reject unauthenticated access to admin endpoints', async ({ request }) => {
      const endpoints = [
        '/api/admin/jobs',
        '/api/admin/monitoring',
        '/api/admin/stand/status',
      ];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint);
        expect([401, 403]).toContain(response.status());
      }
    });

    test('should reject unauthenticated access to member endpoints', async ({ request }) => {
      const endpoints = [
        '/api/members',
        '/api/stand/preferences',
        '/api/stand/bookmarks',
      ];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint);
        expect([401, 403]).toContain(response.status());
      }
    });

    test('should reject unauthenticated access to file upload', async ({ request }) => {
      const response = await request.post('/api/files/upload', {
        data: {},
      });

      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('Authenticated API Access', () => {
    test.use({ storageState: 'e2e/.auth/user.json' });

    test('should access protected endpoints with valid session', async ({ request }) => {
      const response = await request.get('/api/auth/get-session');

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('email');
    });

    test('should access member data', async ({ request }) => {
      const response = await request.get('/api/members');

      // Should succeed with valid session
      expect([200, 403]).toContain(response.status());
    });

    test('should access stand preferences', async ({ request }) => {
      const response = await request.get('/api/stand/preferences');

      expect([200, 404]).toContain(response.status());
    });

    test('should access me permissions', async ({ request }) => {
      const response = await request.get('/api/me/permissions');

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('permissions');
    });
  });

  test.describe('Admin API Access', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should access admin jobs endpoint', async ({ request }) => {
      const response = await request.get('/api/admin/jobs');

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('queues');
    });

    test('should access admin monitoring endpoint', async ({ request }) => {
      const response = await fetch(`${BASE_URL}/api/admin/monitoring`, {
        headers: {
          cookie: ADMIN_COOKIE_HEADER,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('health');
    });

    test('should access admin stand status endpoint', async ({ request }) => {
      const response = await request.get('/api/admin/stand/status');

      expect(response.status()).toBe(200);
    });
  });

  test.describe('Rate Limiting', () => {
    test('should enforce rate limits on login attempts', async ({ request }) => {
      const responses = [];

      for (let i = 0; i < 5; i++) {
        responses.push(
          await request.post('/api/auth/sign-in/email', {
            data: {
              email: 'test@example.com',
              password: 'wrong',
            },
            timeout: 30000,
          })
        );
      }

      const rateLimitedCount = responses.filter(r => r.status() === 429).length;
      if (process.env.NODE_ENV === 'production') {
        expect(rateLimitedCount).toBeGreaterThan(0);
      } else {
        expect(rateLimitedCount).toBe(0);
      }
    });
  });

  test.describe('Security Headers', () => {
    test('should include security headers on auth endpoints', async ({ request }) => {
      const response = await request.get('/api/auth/get-session');

      const headers = response.headers();
      
      // Check for common security headers
      expect(headers['x-content-type-options'] || headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['x-frame-options'] || headers['X-Frame-Options']).toBe('DENY');
    });

    test('should set secure cookies in production mode', async ({ request }) => {
      const response = await request.get('/api/auth/get-session');
      
      const setCookie = response.headers()['set-cookie'];
      if (setCookie) {
        // Cookie should be HttpOnly
        expect(setCookie).toMatch(/HttpOnly/i);
        // Cookie should have SameSite
        expect(setCookie).toMatch(/SameSite/i);
      }
    });
  });
});
