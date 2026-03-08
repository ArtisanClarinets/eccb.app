import { test, expect } from '@playwright/test';

test.describe('Health API', () => {
  test('should return health status', async ({ request }) => {
    const response = await request.get('/api/health');
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('components');
    expect(body).toHaveProperty('timestamp');
    
    // Check components
    expect(body.components).toHaveProperty('database');
    expect(body.components).toHaveProperty('redis');
    expect(body.components).toHaveProperty('storage');
  });

  test('should return healthy when all components work', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    
    // Should be healthy or degraded (not unhealthy)
    expect(['healthy', 'degraded']).toContain(body.status);
  });

  test('should include component health details', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    
    // Each component should have status
    Object.values(body.components).forEach((component: any) => {
      expect(component).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(component.status);
    });
  });

    test('should include latency metrics for healthy components', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();
      
      Object.entries(body.components).forEach(([, component]: [string, any]) => {
        if (component.status === 'healthy') {
          const latency = component.latencyMs ?? component.latency;

          expect(latency).toBeDefined();
          expect(typeof latency).toBe('number');
          expect(latency).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
