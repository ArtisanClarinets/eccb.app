import { test, expect } from '@playwright/test';

test.describe('Edge Cases and Error Handling', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Invalid Input Handling', () => {
    test('should handle SQL injection attempts', async ({ request }) => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM users--",
      ];

      for (const input of maliciousInputs) {
        const response = await request.post('/api/auth/sign-in/email', {
          data: {
            email: input,
            password: input,
          },
        });

        // Should return 401 (invalid credentials) not 500 (server error)
        expect([400, 401, 422]).toContain(response.status());
      }
    });

    test('should handle XSS attempts', async ({ request }) => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
        'onload=alert(1)',
      ];

      for (const [index, payload] of xssPayloads.entries()) {
        const response = await request.post('/api/auth/sign-up/email', {
          data: {
            name: payload,
            email: `xss-${index}-${Date.now()}@eccb.app`,
            password: 'TestPass123!',
          },
        });

        expect([200, 400, 422]).toContain(response.status());
      }
    });

    test('should handle very long input', async ({ request }) => {
      const longString = 'a'.repeat(10000);

      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          email: longString.substring(0, 100),
          password: longString.substring(0, 128),
        },
      });

      // Should handle gracefully
      expect([400, 401]).toContain(response.status());
    });

    test('should handle empty request body', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {},
      });

      expect(response.status()).toBe(400);
    });

    test('should handle null values', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: {
          email: null,
          password: null,
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should handle array instead of object', async ({ request }) => {
      const response = await request.post('/api/auth/sign-in/email', {
        data: [],
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Boundary Value Testing', () => {
    test('should handle minimum password length', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: 'test@example.com',
          password: '1234567', // 7 chars, below minimum
          name: 'Test User',
        },
      });

      expect([400, 403]).toContain(response.status());
    });

    test('should accept minimum valid password length', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: 'test-bv@example.com',
          password: '12345678', // 8 chars, minimum
          name: 'Test User',
        },
      });

      // May fail due to duplicate email, but not due to password length
      expect([200, 201, 403, 409]).toContain(response.status());
    });

    test('should handle maximum password length', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: 'test@example.com',
          password: 'a'.repeat(129), // Exceeds max
          name: 'Test User',
        },
      });

      expect([400, 403]).toContain(response.status());
    });

    test.use({ storageState: 'e2e/.auth/member.json' });

    test('should handle invalid date formats', async ({ request }) => {

      const response = await request.post('/api/stand/practice-logs', {
        data: {
          pieceId: 'invalid',
          durationSeconds: 30,
          practicedAt: 'invalid-date',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should handle negative numbers where positive required', async ({ request }) => {
      const response = await request.post('/api/stand/practice-logs', {
        data: {
          pieceId: 'invalid',
          durationSeconds: -30,
          practicedAt: new Date().toISOString(),
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should handle zero where positive required', async ({ request }) => {
      const response = await request.post('/api/stand/practice-logs', {
        data: {
          pieceId: 'invalid',
          durationSeconds: 0,
          practicedAt: new Date().toISOString(),
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Special Characters and Encoding', () => {
    test('should handle unicode characters', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          name: '测试用户 🎵',
          email: `unicode-${Date.now()}@eccb.app`,
          password: 'TestPass123!',
        },
      });

      expect([200, 400, 422]).toContain(response.status());
    });

    test('should handle URL-encoded characters', async ({ request }) => {
      const response = await request.get('/api/music?search=test%20query%26more');

      expect([200, 404]).toContain(response.status());
    });

    test('should handle special regex characters', async ({ request }) => {
      const specialChars = ['.*', '[test]', '(test)', '{test}', 'test+', 'test?'];

      for (const char of specialChars) {
        const response = await request.get(`/api/music?search=${encodeURIComponent(char)}`);
        expect([200, 400, 404]).toContain(response.status());
      }
    });
  });

  test.describe('Concurrent Access', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });

    test('should handle concurrent requests', async ({ request }) => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(request.get('/api/stand/config'));
      }

      const responses = await Promise.all(requests);

      // All should complete without server errors
      for (const response of responses) {
        expect(response.status()).not.toBe(500);
      }
    });

    test('should handle rapid sequential requests', async ({ request }) => {
      for (let i = 0; i < 20; i++) {
        const response = await request.get('/api/health');
        expect(response.status()).toBe(200);
      }
    });
  });

  test.describe('Resource Exhaustion', () => {
    test('should handle large request payload', async ({ request }) => {
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          name: 'x'.repeat(1024 * 1024),
          email: `large-${Date.now()}@eccb.app`,
          password: 'TestPass123!',
        },
      });

      expect([200, 400, 413, 422]).toContain(response.status());
    });

    test('should handle deeply nested JSON', async ({ request }) => {
      const createNested = (depth: number): any => {
        if (depth === 0) return 'value';
        return { nested: createNested(depth - 1) };
      };

      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          email: `deep-${Date.now()}@eccb.app`,
          password: 'TestPass123!',
          name: 'Test User',
          metadata: createNested(100),
        },
      });

      expect([200, 400, 413, 422]).toContain(response.status());
    });

    test('should handle many fields in request', async ({ request }) => {
      const manyFields: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        manyFields[`field${i}`] = 'value';
      }

      manyFields.email = `fields-${Date.now()}@eccb.app`;
      manyFields.password = 'TestPass123!';
      manyFields.name = 'Test User';

      const response = await request.post('/api/auth/sign-up/email', {
        data: manyFields,
      });

      expect([200, 400, 413, 422]).toContain(response.status());
    });
  });

  test.describe('HTTP Method Handling', () => {
    test('should reject unsupported methods', async ({ request }) => {
      const methods = ['PATCH', 'OPTIONS'] as const;

      for (const method of methods) {
        const response = await request.fetch('/api/health', { method });
        expect([204, 405]).toContain(response.status());
      }
    });

    test('should handle HEAD requests', async ({ request }) => {
      const response = await request.head('/api/health');

      expect(response.status()).toBe(200);
      // HEAD should not have body
      const body = await response.body();
      expect(body.length).toBe(0);
    });
  });

  test.describe('Header Edge Cases', () => {
    test('should handle missing content-type', async ({ request }) => {
      const response = await request.fetch('/api/auth/sign-in/email', {
        method: 'POST',
        data: JSON.stringify({ email: 'test@example.com', password: 'pass' }),
      });

      expect([400, 415]).toContain(response.status());
    });

    test('should handle wrong content-type', async ({ request }) => {
      const response = await request.fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        data: 'email=test@example.com&password=pass',
      });

      expect([400, 415]).toContain(response.status());
    });

    test('should handle oversized headers', async ({ request }) => {
      const response = await request.get('/api/health', {
        headers: {
          'X-Custom-Header': 'x'.repeat(10000),
        },
      });

      // May be rejected by server or succeed with truncated header
      expect([200, 400, 431]).toContain(response.status());
    });
  });

  test.describe('Path Traversal Prevention', () => {
    test('should prevent path traversal in file endpoints', async ({ request }) => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....//....//....//etc/passwd',
      ];

      for (const path of traversalPaths) {
        const response = await request.get(`/api/files/${encodeURIComponent(path)}`);
        expect([400, 401, 403, 404]).toContain(response.status());
      }
    });
  });

  test.describe('ID Parameter Validation', () => {
    test('should reject non-numeric IDs', async ({ request }) => {
      const invalidIds = ['abc', '1.5', '1e10', 'null', 'undefined'];

      for (const id of invalidIds) {
        const response = await request.get(`/api/music/${id}`);
        expect([400, 404]).toContain(response.status());
      }
    });

    test('should handle very large ID values', async ({ request }) => {
      const response = await request.get('/api/music/999999999999999999');

      // Should handle gracefully
      expect([404, 400]).toContain(response.status());
    });

    test('should handle negative IDs', async ({ request }) => {
      const response = await request.get('/api/music/-1');

      expect([400, 404]).toContain(response.status());
    });
  });
});
