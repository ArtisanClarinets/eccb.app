import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { validateSetupRequest } from '@/lib/setup/setup-guard';
import * as helpers from '@/lib/__tests__/test-helpers';

vi.mock('@/lib/setup/setup-guard');

// reuse helpers to construct request
function makeRequest(body: unknown) {
  const req = helpers.createMockRequest({
    method: 'POST',
    url: '/api/setup',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  // override json method to return the body
  req.json = async () => body as any;
  return req as unknown as Request;
}

describe('/api/setup route', () => {
  beforeEach(() => {
    // default guard allows
    (validateSetupRequest as vi.Mock).mockReturnValue(null);
  });

  it('returns 400 when passed an invalid action', async () => {
    const request = makeRequest({ action: 'foobar' });
    const response = await POST(request);
    const json = await (response as any).json();
    expect(json.success).toBe(false);
    // zod should reject because the action is not one of the allowed enum values
    expect(json.error).toMatch(/expected one of/);
    expect((response as any).status).toBe(400);
  });

  it('returns success for init action with valid connection', async () => {
    // mock checkMigrationStatus to not throw
    const { checkMigrationStatus } = await import('@/lib/setup/schema-automation');
    // just call real function; it will use whatever DB config is present but we
    // don't actually hit the database in this unit test, so we stub it.
    vi.spyOn(await import('@/lib/setup/schema-automation'), 'checkMigrationStatus').mockReturnValue({ applied: false, pendingCount: 0 });

    const request = makeRequest({ action: 'init', config: { host: 'localhost' } });
    const response = await POST(request);
    const json = await (response as any).json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Connection successful');
  });

  it('returns 400 for init when connection test throws', async () => {
    vi.spyOn(await import('@/lib/setup/schema-automation'), 'checkMigrationStatus').mockImplementation(() => { throw new Error('bad'); });
    const request = makeRequest({ action: 'init' });
    const response = await POST(request);
    const json = await (response as any).json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/bad/);
    expect((response as any).status).toBe(400);
  });
});