import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mock NextResponse
vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: (body: any, init?: any) => ({
        body,
        status: init?.status || 200,
        // Add other properties if needed by the test
      }),
    },
  };
});

// Mock env
const mockEnvState = {
  SETUP_MODE: false,
  SETUP_TOKEN: undefined as string | undefined,
};

vi.mock('@/lib/env', () => ({
  env: mockEnvState,
}));

import { validateSetupRequest } from '../setup/setup-guard';

describe('validateSetupRequest', () => {
  beforeEach(() => {
    mockEnvState.SETUP_MODE = false;
    mockEnvState.SETUP_TOKEN = undefined;
  });

  it('should return 403 if SETUP_MODE is false', () => {
    mockEnvState.SETUP_MODE = false;
    const req = new Request('http://localhost');
    const res = validateSetupRequest(req) as any;

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    expect(res?.body?.error).toBe('Setup mode is disabled');
  });

  it('should return 401 if SETUP_MODE is true but token is missing and SETUP_TOKEN is configured', () => {
    mockEnvState.SETUP_MODE = true;
    mockEnvState.SETUP_TOKEN = 'secret';

    const req = new Request('http://localhost');
    const res = validateSetupRequest(req) as any;

    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
    expect(res?.body?.error).toBe('Invalid setup token');
  });

  it('should return 401 if token is incorrect', () => {
    mockEnvState.SETUP_MODE = true;
    mockEnvState.SETUP_TOKEN = 'secret';

    const req = new Request('http://localhost', {
      headers: { 'x-setup-token': 'wrong' },
    });
    const res = validateSetupRequest(req) as any;

    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });

  it('should return null (success) if token is correct', () => {
    mockEnvState.SETUP_MODE = true;
    mockEnvState.SETUP_TOKEN = 'secret';

    const req = new Request('http://localhost', {
      headers: { 'x-setup-token': 'secret' },
    });
    const res = validateSetupRequest(req);

    expect(res).toBeNull();
  });

  it('should return null (success) if SETUP_MODE is true and no token configured', () => {
    mockEnvState.SETUP_MODE = true;
    mockEnvState.SETUP_TOKEN = undefined;

    const req = new Request('http://localhost');
    const res = validateSetupRequest(req);

    expect(res).toBeNull();
  });
});
