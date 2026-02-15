import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to set NODE_ENV since it's read-only
function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true,
  });
}

// Mock the module to test the headers function
describe('Security Headers Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Reset process.env
    Object.defineProperty(process, 'env', {
      value: { ...originalEnv },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original env
    Object.defineProperty(process, 'env', {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  it('should return security headers for all routes', async () => {
    // Import the config after setting up mocks
    const { default: nextConfig } = await import('../../../next.config');

    const headers = await nextConfig.headers!();

    // Should have at least 2 header rules (all routes + API routes)
    expect(headers.length).toBeGreaterThanOrEqual(2);

    // Find the all routes header rule
    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    expect(allRoutesHeader).toBeDefined();

    const securityHeaders = allRoutesHeader!.headers;

    // Check for required security headers
    const headerKeys = securityHeaders.map((h) => h.key);

    expect(headerKeys).toContain('X-Content-Type-Options');
    expect(headerKeys).toContain('X-Frame-Options');
    expect(headerKeys).toContain('X-XSS-Protection');
    expect(headerKeys).toContain('Referrer-Policy');
    expect(headerKeys).toContain('Permissions-Policy');
    expect(headerKeys).toContain('Content-Security-Policy');
  });

  it('should set X-Content-Type-Options to nosniff', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const contentTypeHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'X-Content-Type-Options'
    );

    expect(contentTypeHeader?.value).toBe('nosniff');
  });

  it('should set X-Frame-Options to SAMEORIGIN', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const frameHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'X-Frame-Options'
    );

    expect(frameHeader?.value).toBe('SAMEORIGIN');
  });

  it('should set X-XSS-Protection correctly', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const xssHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'X-XSS-Protection'
    );

    expect(xssHeader?.value).toBe('1; mode=block');
  });

  it('should set Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const referrerHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'Referrer-Policy'
    );

    expect(referrerHeader?.value).toBe('strict-origin-when-cross-origin');
  });

  it('should set Permissions-Policy with restrictive values', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const permissionsHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'Permissions-Policy'
    );

    expect(permissionsHeader?.value).toContain('camera=()');
    expect(permissionsHeader?.value).toContain('microphone=()');
    expect(permissionsHeader?.value).toContain('geolocation=()');
    expect(permissionsHeader?.value).toContain('interest-cohort=()');
  });

  it('should set Content-Security-Policy with required directives', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const cspHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'Content-Security-Policy'
    );

    expect(cspHeader?.value).toContain("default-src 'self'");
    expect(cspHeader?.value).toContain("script-src 'self'");
    expect(cspHeader?.value).toContain("style-src 'self'");
    expect(cspHeader?.value).toContain("img-src 'self'");
    expect(cspHeader?.value).toContain("frame-ancestors 'self'");
    expect(cspHeader?.value).toContain("object-src 'none'");
  });

  it('should NOT include HSTS header in development', async () => {
    setNodeEnv('development');

    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const hstsHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'Strict-Transport-Security'
    );

    expect(hstsHeader).toBeUndefined();
  });

  it('should include HSTS header in production', async () => {
    setNodeEnv('production');

    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const allRoutesHeader = headers.find((h) => h.source === '/:path*');
    const hstsHeader = allRoutesHeader!.headers.find(
      (h) => h.key === 'Strict-Transport-Security'
    );

    expect(hstsHeader).toBeDefined();
    expect(hstsHeader?.value).toContain('max-age=31536000');
    expect(hstsHeader?.value).toContain('includeSubDomains');
    expect(hstsHeader?.value).toContain('preload');
  });

  it('should set cache control headers for API routes', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const headers = await nextConfig.headers!();

    const apiHeader = headers.find((h) => h.source === '/api/:path*');
    expect(apiHeader).toBeDefined();

    const cacheControl = apiHeader!.headers.find(
      (h) => h.key === 'Cache-Control'
    );
    expect(cacheControl?.value).toBe(
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    const pragma = apiHeader!.headers.find((h) => h.key === 'Pragma');
    expect(pragma?.value).toBe('no-cache');
  });
});
