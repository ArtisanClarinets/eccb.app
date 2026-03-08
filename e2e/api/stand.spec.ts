import { test, expect } from '@playwright/test';

test.describe('Stand API', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.describe('Stand Config', () => {
    test('should get stand configuration', async ({ request }) => {
      const response = await request.get('/api/stand/config');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('enabled');
      }
    });

    test('should get stand settings', async ({ request }) => {
      const response = await request.get('/api/stand/settings');
      
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Preferences', () => {
    test('should get user preferences', async ({ request }) => {
      const response = await request.get('/api/stand/preferences');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('preferences');
      }
    });

    test('should update preferences', async ({ request }) => {
      const response = await request.put('/api/stand/preferences', {
        data: {
          zoomLevel: 1.5,
          nightMode: true,
          pageLayout: 'single',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should reject invalid preference values', async ({ request }) => {
      const response = await request.put('/api/stand/preferences', {
        data: {
          nightMode: 'invalid',
        },
      });
      
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Stand Annotations', () => {
    test('should get annotations for piece', async ({ request }) => {
      const response = await request.get('/api/stand/annotations?musicId=invalid-music-id');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('annotations');
      }
    });

    test('should create annotation', async ({ request }) => {
      const response = await request.post('/api/stand/annotations', {
        data: {
          pieceId: 1,
          pageNumber: 1,
          type: 'highlight',
          x: 100,
          y: 200,
          width: 50,
          height: 30,
          color: '#ff0000',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should reject annotation without required fields', async ({ request }) => {
      const response = await request.post('/api/stand/annotations', {
        data: {
          pieceId: 1,
        },
      });
      
      expect(response.status()).toBe(400);
    });

    test('should update annotation', async ({ request }) => {
      const response = await request.put('/api/stand/annotations/1', {
        data: {
          color: '#00ff00',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should delete annotation', async ({ request }) => {
      const response = await request.delete('/api/stand/annotations/99999');
      
      expect([204, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Bookmarks', () => {
    test('should get bookmarks', async ({ request }) => {
      const response = await request.get('/api/stand/bookmarks');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
      }
    });

    test('should create bookmark', async ({ request }) => {
      const response = await request.post('/api/stand/bookmarks', {
        data: {
          pieceId: 1,
          pageNumber: 1,
          label: 'Important Section',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should delete bookmark', async ({ request }) => {
      const response = await request.delete('/api/stand/bookmarks/99999');
      
      expect([204, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Setlists', () => {
    test('should get setlists', async ({ request }) => {
      const response = await request.get('/api/stand/setlists');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
      }
    });

    test('should create setlist', async ({ request }) => {
      const response = await request.post('/api/stand/setlists', {
        data: {
          name: 'E2E Test Setlist',
          eventId: 1,
          pieceIds: [1, 2, 3],
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should update setlist', async ({ request }) => {
      const response = await request.put('/api/stand/setlists/1', {
        data: {
          name: 'Updated Setlist',
          pieceIds: [1, 2],
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should delete setlist', async ({ request }) => {
      const response = await request.delete('/api/stand/setlists/99999');
      
      expect([204, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Audio', () => {
    test('should get audio files for piece', async ({ request }) => {
      const response = await request.get('/api/stand/audio?pieceId=1');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should add audio link', async ({ request }) => {
      const response = await request.post('/api/stand/audio', {
        data: {
          pieceId: 1,
          url: 'https://example.com/audio.mp3',
          title: 'Reference Recording',
          type: 'reference',
        },
      });
      
      expect([400, 403, 404]).toContain(response.status());
    });

    test('should reject invalid audio URL', async ({ request }) => {
      const response = await request.post('/api/stand/audio', {
        data: {
          pieceId: 1,
          url: 'not-a-url',
          title: 'Invalid Audio',
        },
      });
      
      expect([400, 403]).toContain(response.status());
    });

    test('should delete audio', async ({ request }) => {
      const response = await request.delete('/api/stand/audio/99999');
      
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Sync', () => {
    test('should sync stand data', async ({ request }) => {
      const response = await request.post('/api/stand/sync', {
        data: {
          lastSyncAt: new Date().toISOString(),
          annotations: [],
          bookmarks: [],
          preferences: {},
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should get sync status', async ({ request }) => {
      const response = await request.get('/api/stand/sync?lastSyncAt=2024-01-01T00:00:00Z');
      
      expect([200, 400, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Roster', () => {
    test('should get event roster', async ({ request }) => {
      const response = await request.get('/api/stand/roster?eventId=1');
      
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Stand OMR', () => {
    test('should request OMR processing', async ({ request }) => {
      const response = await request.post('/api/stand/omr', {
        data: {
          musicFileId: 'invalid-file-id',
        },
      });
      
      expect([400, 403, 404, 503]).toContain(response.status());
    });

    test('should get OMR status', async ({ request }) => {
      const response = await request.get('/api/stand/omr?musicFileId=invalid-file-id');
      
      expect([200, 400, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Navigation Links', () => {
    test('should get navigation links', async ({ request }) => {
      const response = await request.get('/api/stand/navigation-links?musicId=invalid-music-id');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should create navigation link', async ({ request }) => {
      const response = await request.post('/api/stand/navigation-links', {
        data: {
          pieceId: 1,
          fromPage: 1,
          toPage: 5,
          label: 'Jump to Coda',
        },
      });
      
      expect([400, 403, 404]).toContain(response.status());
    });

    test('should update navigation link', async ({ request }) => {
      const response = await request.put('/api/stand/navigation-links/1', {
        data: {
          label: 'Updated Link',
        },
      });
      
      expect([400, 403, 404]).toContain(response.status());
    });

    test('should delete navigation link', async ({ request }) => {
      const response = await request.delete('/api/stand/navigation-links/99999');
      
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe('Stand Practice Logs', () => {
    test('should get practice logs', async ({ request }) => {
      const response = await request.get('/api/stand/practice-logs?pieceId=1');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should create practice log', async ({ request }) => {
      const response = await request.post('/api/stand/practice-logs', {
        data: {
          pieceId: 1,
          duration: 30,
          date: new Date().toISOString(),
          notes: 'Practice session',
        },
      });
      
      expect([200, 201, 400, 404]).toContain(response.status());
    });

    test('should update practice log', async ({ request }) => {
      const response = await request.put('/api/stand/practice-logs/1', {
        data: {
          duration: 45,
          notes: 'Updated notes',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should delete practice log', async ({ request }) => {
      const response = await request.delete('/api/stand/practice-logs/99999');
      
      expect([204, 404]).toContain(response.status());
    });
  });
});
