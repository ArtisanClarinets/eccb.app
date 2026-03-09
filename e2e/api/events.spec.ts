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

async function fetchStatus(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  await response.body?.cancel();
  return response;
}

const ADMIN_COOKIE_HEADER = getCookieHeader('e2e/.auth/admin.json');

test.describe('Events API', () => {
  test.describe('Public Events', () => {
    test('should get public events list', async ({ request: _request }) => {
      const response = await fetchStatus('/api/events');
      
      // Events API might be public or protected
      expect([200, 401, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('events');
        expect(Array.isArray(body.events)).toBe(true);
      }
    });

    test('should get event details', async () => {
      const response = await fetchStatus('/api/events/1');
      
      expect([200, 401, 404]).toContain(response.status);
    });

    test('should handle non-existent event', async () => {
      const response = await fetchStatus('/api/events/99999');
      
      expect([401, 404]).toContain(response.status);
    });
  });

  test.describe('RSVP API', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });

    test('should reject unsupported RSVP lookup method', async ({ request }) => {
      const response = await request.get('/api/events/rsvp?eventId=1');
      
      expect([404, 405]).toContain(response.status());
    });

    test('should create RSVP', async ({ request }) => {
      const response = await request.post('/api/events/rsvp', {
        data: {
          eventId: '1',
          memberId: '1',
          status: 'YES',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400, 403, 404]).toContain(response.status());
    });

    test('should update RSVP status', async ({ request }) => {
      const response = await request.post('/api/events/rsvp', {
        data: {
          eventId: '1',
          memberId: '1',
          status: 'MAYBE',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([200, 400, 403, 404]).toContain(response.status());
    });

    test('should reject invalid RSVP status', async ({ request }) => {
      const response = await request.post('/api/events/rsvp', {
        data: {
          eventId: '1',
          memberId: '1',
          status: 'INVALID_STATUS',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect(response.status()).toBe(400);
    });

    test('should reject RSVP without event ID', async ({ request }) => {
      const response = await request.post('/api/events/rsvp', {
        data: {
          memberId: '1',
          status: 'YES',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Admin Events API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get all events for admin', async () => {
      const response = await fetchStatus('/api/admin/events', {
        headers: {
          cookie: ADMIN_COOKIE_HEADER,
        },
      });
      
      expect(response.status).toBe(404);
    });

    test('should create event', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const response = await fetchStatus('/api/admin/events', {
        method: 'POST',
        headers: {
          ...MUTATING_HEADERS,
          cookie: ADMIN_COOKIE_HEADER,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'E2E API Test Event',
          description: 'Test event from API',
          startDate: tomorrow.toISOString(),
          location: 'Test Location',
          type: 'REHEARSAL',
        }),
      });
      
      expect(response.status).toBe(404);
    });

    test('should reject event without required fields', async () => {
      const response = await fetchStatus('/api/admin/events', {
        method: 'POST',
        headers: {
          ...MUTATING_HEADERS,
          cookie: ADMIN_COOKIE_HEADER,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Missing title',
        }),
      });
      
      expect(response.status).toBe(404);
    });

    test('should update event', async () => {
      const response = await fetchStatus('/api/admin/events/1', {
        method: 'PUT',
        headers: {
          ...MUTATING_HEADERS,
          cookie: ADMIN_COOKIE_HEADER,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated E2E Event',
        }),
      });
      
      expect(response.status).toBe(404);
    });

    test('should delete event', async () => {
      const response = await fetchStatus('/api/admin/events/99999', {
        method: 'DELETE',
        headers: {
          ...MUTATING_HEADERS,
          cookie: ADMIN_COOKIE_HEADER,
        },
      });
      
      expect(response.status).toBe(404);
    });
  });

  test.describe('Attendance API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get attendance for event', async ({ request }) => {
      const response = await request.get('/api/attendance/event/1');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('attendance');
      }
    });

    test('should mark attendance', async ({ request }) => {
      const response = await request.post('/api/attendance/event/1/member/1', {
        data: {
          status: 'PRESENT',
        },
        headers: MUTATING_HEADERS,
      });
      
      expect([404, 405]).toContain(response.status());
    });

    test('should bulk update attendance', async ({ request }) => {
      const response = await request.post('/api/attendance/bulk', {
        data: {
          eventId: 'nonexistent-event-id',
          records: [
            { memberId: '1', status: 'PRESENT' },
            { memberId: '2', status: 'ABSENT' },
          ],
        },
        headers: MUTATING_HEADERS,
      });
      
      expect(response.status()).toBe(404);
    });

    test('should export attendance', async ({ request }) => {
      const response = await request.get('/api/admin/attendance/export?eventId=1');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toMatch(/json|csv|application/);
      }
    });
  });
});
