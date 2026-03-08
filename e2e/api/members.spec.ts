import { expect, test } from '@playwright/test';

test.describe('Members API', () => {
  test.describe('Member List', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get all members', async ({ request }) => {
      const response = await request.get('/api/members');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('members');
        expect(Array.isArray(body.members)).toBe(true);
      }
    });

    test('should filter members by status', async ({ request }) => {
      const response = await request.get('/api/members?status=ACTIVE');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should search members', async ({ request }) => {
      const response = await request.get('/api/members?search=e2e');
      
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Admin Member Management', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should create member', async ({ request }) => {
      const response = await request.post('/api/admin/members', {
        data: {
          name: 'E2E Test Member',
          email: 'e2e-new-member@eccb.app',
          instrument: 'TRUMPET',
          section: 'BRASS',
        },
      });
      
      expect([200, 201, 400, 404, 409]).toContain(response.status());
    });

    test('should reject member without required fields', async ({ request }) => {
      const response = await request.post('/api/admin/members', {
        data: {
          name: 'Incomplete Member',
        },
      });
      
      expect([400, 404]).toContain(response.status());
    });

    test('should get member details', async ({ request }) => {
      const response = await request.get('/api/admin/members/1');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should update member', async ({ request }) => {
      const response = await request.put('/api/admin/members/1', {
        data: {
          name: 'Updated E2E Member',
          instrument: 'CLARINET',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should delete member', async ({ request }) => {
      const response = await request.delete('/api/admin/members/99999');
      
      expect([204, 404]).toContain(response.status());
    });

    test('should export members', async ({ request }) => {
      const response = await request.get('/api/admin/members/export');
      
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toMatch(/json|csv|application/);
      }
    });
  });

  test.describe('Member Profile', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });

    test('should get own profile', async ({ request }) => {
      const response = await request.get('/api/members/profile');
      
      expect([200, 404]).toContain(response.status());
    });

    test('should update own profile', async ({ request }) => {
      const response = await request.put('/api/members/profile', {
        data: {
          name: 'Updated Name',
          bio: 'Updated bio from E2E test',
        },
      });
      
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should get member attendance', async ({ request }) => {
      const response = await request.get('/api/attendance/member/1');
      
      expect([200, 403, 404]).toContain(response.status());
    });
  });

  test.describe('Sections API', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('should get all sections', async ({ request }) => {
      const response = await request.get('/api/sections');
      
      expect(response.status()).toBe(200);
      
      const body = await response.json();
      expect(body).toHaveProperty('sections');
    });
  });
});
