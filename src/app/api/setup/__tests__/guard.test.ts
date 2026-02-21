import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { checkSetupAllowed } from '@/lib/setup/setup-guard';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    SETUP_MODE: false,
    SETUP_TOKEN: 'valid-token',
    NODE_ENV: 'test',
  },
}));

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

describe('Setup Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default env state
    (env as any).SETUP_MODE = false;
    (env as any).SETUP_TOKEN = 'valid-token';
  });

  it('blocks access when SETUP_MODE is false', async () => {
    (env as any).SETUP_MODE = false;
    const req = new NextRequest('http://localhost/api/setup');

    const result = await checkSetupAllowed(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    const body = await result?.json();
    expect(body.error).toContain('Setup mode is disabled');
  });

  it('blocks access when SETUP_TOKEN is missing', async () => {
    (env as any).SETUP_MODE = true;
    const req = new NextRequest('http://localhost/api/setup');

    const result = await checkSetupAllowed(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    const body = await result?.json();
    expect(body.error).toContain('Invalid or missing setup token');
  });

  it('blocks access when SETUP_TOKEN is invalid', async () => {
    (env as any).SETUP_MODE = true;
    const req = new NextRequest('http://localhost/api/setup', {
      headers: { 'x-setup-token': 'wrong-token' },
    });

    const result = await checkSetupAllowed(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it('allows access when SETUP_MODE is true and token is valid', async () => {
    (env as any).SETUP_MODE = true;
    (prisma.user.count as any).mockResolvedValue(0); // Not initialized

    const req = new NextRequest('http://localhost/api/setup', {
      headers: { 'x-setup-token': 'valid-token' },
    });

    const result = await checkSetupAllowed(req);
    expect(result).toBeNull(); // Allowed
  });
});
