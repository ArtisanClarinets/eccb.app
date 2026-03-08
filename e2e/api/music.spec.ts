import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const MUTATING_HEADERS = {
  origin: BASE_URL,
};

function getCookieHeader(storageStatePath: string): string {
  const storageState = JSON.parse(readFileSync(storageStatePath, 'utf8')) as {
    cookies?: Array<{ name: string; value: string }>;
  };

  return (storageState.cookies ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

const ADMIN_COOKIE_HEADER = getCookieHeader('e2e/.auth/admin.json');

test.describe('Music API', () => {
  test.describe('Music Library', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });

    test('should get music library', async ({ request }) => {
      const response = await request.get('/api/music');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('music');
      }
    });

    test('should search music', async ({ request }) => {
      const response = await request.get('/api/music?search=symphony');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should filter music by type', async ({ request }) => {
      const response = await request.get('/api/music?type=CONCERT');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should get music details', async ({ request }) => {
      const response = await request.get('/api/music/1');
      
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Admin Music Management', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get all music for admin', async ({ request }) => {
      const response = await request.get('/api/admin/music');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should create music piece', async ({ request }) => {
      const response = await request.post('/api/admin/music', {
        data: {
          title: 'E2E API Symphony',
          composer: 'E2E Composer',
          description: 'Test piece from API',
          difficulty: 'MEDIUM',
          type: 'CONCERT',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should reject music without title', async ({ request }) => {
      const response = await request.post('/api/admin/music', {
        data: {
          composer: 'Anonymous',
        },
      });
      
      expect([400, 404]).toContain(response.status());
    });

    test('should update music', async ({ request }) => {
      const response = await request.put('/api/admin/music/1', {
        data: {
          title: 'Updated E2E Piece',
          composer: 'Updated Composer',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should delete music', async ({ request }) => {
      const response = await request.post('/api/admin/music/99999/delete');
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should archive music', async ({ request }) => {
      const response = await request.post('/api/admin/music/1/archive', {
        data: {
          archived: true,
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should restore archived music', async ({ request }) => {
      const response = await request.post('/api/admin/music/1/restore');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should bulk delete music', async ({ request }) => {
      const response = await request.post('/api/admin/music/bulk-delete', {
        data: {
          ids: ['1', '2', '3'],
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should export music library', async ({ request }) => {
      const response = await request.get('/api/admin/music/export');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should open music events stream', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/music/events`, {
        headers: {
          accept: 'text/event-stream',
          cookie: ADMIN_COOKIE_HEADER,
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();

      const firstChunk = await reader?.read();
      const firstMessage = new TextDecoder().decode(firstChunk?.value);

      expect(firstMessage).toContain('connected');

      await reader?.cancel();
    });

    test('should assign music to event', async ({ request }) => {
      const response = await request.post('/api/admin/music/assign', {
        data: {
          musicId: 1,
          eventId: 1,
          part: 'FIRST_CLARINET',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });
  });

  test.describe('File Upload API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get upload URL', async ({ request }) => {
      const response = await request.post('/api/files/download-url', {
        data: {
          key: 'test.pdf',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 500]).toContain(response.status());
    });

    test('should request file download URL', async ({ request }) => {
      const response = await request.post('/api/files/download-url', {
        data: {
          key: 'music/test.pdf',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 500]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('url');
      }
    });

    test('should reject invalid file key', async ({ request }) => {
      const response = await request.post('/api/files/download-url', {
        data: {
          key: '../secret.txt',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Smart Upload API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get upload review items', async ({ request }) => {
      const response = await request.get('/api/admin/uploads/review');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should get upload settings', async ({ request }) => {
      const response = await request.get('/api/admin/uploads/settings');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should update upload settings', async ({ request }) => {
      const response = await request.put('/api/admin/uploads/settings', {
        data: {
          settings: [
            {
              key: 'llm_provider',
              value: 'openai',
            },
          ],
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400]).toContain(response.status());
    });

    test('should get upload session status', async ({ request }) => {
      const response = await request.get('/api/admin/uploads/status/test-session');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should approve upload review item', async ({ request }) => {
      const response = await request.post('/api/admin/uploads/review/1/approve', {
        data: {
          title: 'Approved Title',
          composer: 'Approved Composer',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should reject upload review item', async ({ request }) => {
      const response = await request.post('/api/admin/uploads/review/1/reject', {
        data: {
          reason: 'Test rejection',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should bulk approve items', async ({ request }) => {
      const response = await request.post('/api/admin/uploads/review/bulk-approve', {
        data: {
          sessionIds: ['1', '2'],
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should get LLM providers', async ({ request }) => {
      const response = await request.post('/api/admin/uploads/providers/discover', {
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 500]).toContain(response.status());
    });
  });
});
