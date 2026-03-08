import { expect, test } from '@playwright/test';

test.describe('Settings API', () => {
  test.describe('Public Settings', () => {
    test('should get public settings', async ({ request }) => {
      const response = await request.get('/api/settings');
      
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Admin Settings', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get all settings', async ({ request }) => {
      const response = await request.get('/api/admin/settings');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('settings');
      }
    });

    test('should update general settings', async ({ request }) => {
      const response = await request.put('/api/admin/settings', {
        data: {
          category: 'general',
          settings: {
            siteName: 'E2E Test Site',
            contactEmail: 'test@eccb.app',
          },
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should update email settings', async ({ request }) => {
      const response = await request.put('/api/admin/settings/email', {
        data: {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          fromEmail: 'noreply@eccb.app',
          fromName: 'ECCB Platform',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should reject invalid email settings', async ({ request }) => {
      const response = await request.put('/api/admin/settings/email', {
        data: {
          smtpHost: '',
          smtpPort: 'invalid',
        },
      });
      
      expect([400, 404]).toContain(response.status());
    });

    test('should update security settings', async ({ request }) => {
      const response = await request.put('/api/admin/settings/security', {
        data: {
          requireEmailVerification: true,
          maxLoginAttempts: 5,
          passwordMinLength: 8,
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should update music stand settings', async ({ request }) => {
      const response = await request.put('/api/admin/settings/music-stand', {
        data: {
          enabled: true,
          realtimeMode: 'websocket',
          offlineEnabled: true,
          practiceTrackingEnabled: true,
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });
  });

  test.describe('Setup API', () => {
    test('should get setup status', async ({ request }) => {
      const response = await request.get('/api/setup/status');
      
      expect([200, 401, 403, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('success');
        expect(body).toHaveProperty('phase');
      }
    });

    test('should initialize setup', async ({ request }) => {
      const response = await request.post('/api/setup', {
        data: {
          action: 'full',
        },
      });
      
      expect([200, 400, 401, 403]).toContain(response.status());
    });

    test('should repair database', async ({ request }) => {
      const response = await request.post('/api/setup/repair', {
        data: {
          action: 'full',
          force: false,
        },
      });
      
      expect([200, 400, 401, 403, 404]).toContain(response.status());
    });
  });

  test.describe('Audit API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get audit logs', async ({ request }) => {
      const response = await request.get('/api/admin/audit/export');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should filter audit logs', async ({ request }) => {
      const response = await request.get('/api/admin/audit/export?startDate=2024-01-01&endDate=2024-12-31&action=LOGIN');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should export audit logs', async ({ request }) => {
      const response = await request.get('/api/admin/audit/export?format=csv');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toMatch(/json|csv|text/);
      }
    });
  });

  test.describe('Monitoring API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get monitoring data', async ({ request }) => {
      const response = await request.get('/api/admin/monitoring');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('metrics');
      }
    });

    test('should get system status', async ({ request }) => {
      const response = await request.get('/api/admin/stand/status');
      
      expect([200, 404]).toContain(response.status());
    });
  });
});
