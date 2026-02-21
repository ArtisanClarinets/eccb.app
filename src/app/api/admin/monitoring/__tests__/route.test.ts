import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST, DELETE } from '../route';
import { auth } from '@/lib/auth/config';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import { checkUserPermission } from '@/lib/auth/permissions';

// Mock dependencies
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { groupBy: vi.fn() },
    event: { findMany: vi.fn() },
    musicPiece: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    musicFile: { aggregate: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ '1': 1 }]),
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

vi.mock('@/lib/monitoring', () => ({
  getAllMetrics: vi.fn().mockResolvedValue({}),
  getAggregatedErrors: vi.fn().mockResolvedValue([]),
  clearAggregatedErrors: vi.fn(),
  clearMetrics: vi.fn(),
  trackError: vi.fn(),
  incrementCounter: vi.fn(),
}));

vi.mock('@/lib/performance', () => ({
  startTimer: vi.fn().mockReturnValue({ end: vi.fn() }),
}));

describe('Admin Monitoring API Route', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      url: 'http://localhost/api/admin/monitoring',
      headers: new Headers(),
      json: vi.fn(),
      nextUrl: new URL('http://localhost/api/admin/monitoring'),
    } as any;
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(validateCSRF).mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET', () => {
    it('should apply rate limiting', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      );

      const response = await GET(mockRequest as NextRequest);

      expect(response.status).toBe(429);
      expect(applyRateLimit).toHaveBeenCalledWith(mockRequest, 'api');
    });
  });

  describe('POST', () => {
    it('should apply rate limiting', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      );

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(429);
      expect(applyRateLimit).toHaveBeenCalledWith(mockRequest, 'api');
    });
  });

  describe('DELETE', () => {
    it('should apply rate limiting', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      );

      const response = await DELETE(mockRequest as NextRequest);

      expect(response.status).toBe(429);
      expect(applyRateLimit).toHaveBeenCalledWith(mockRequest, 'adminAction');
    });
  });
});
