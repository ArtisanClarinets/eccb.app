import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getStandSettings } from '@/lib/stand/settings';

// Mock stand access helpers and export placeholders
vi.mock('@/lib/stand/access', () => ({
  requireStandAccess: vi.fn(),
  canAccessPiece: vi.fn(),
}));

let GET: typeof import('@/app/api/stand/practice-logs/route').GET;
let POST: typeof import('@/app/api/stand/practice-logs/route').POST;


// Mock feature flags — enabled by default
vi.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(true),
  FEATURES: {
    PRACTICE_TRACKING: 'FEATURE_PRACTICE_TRACKING',
    MUSIC_STAND: 'FEATURE_MUSIC_STAND',
  },
}));

// Mock auth
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock stand settings helper
vi.mock('@/lib/stand/settings', () => ({
  getStandSettings: vi.fn().mockResolvedValue({
    practiceTrackingEnabled: true,
    maxStrokeDataBytes: 1000000,
    maxAnnotationsPerPage: 100,
    // include any other fields used by test code if necessary
  }),
}));

// Mock headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock rate limit — always allow
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    practiceLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    musicPiece: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'member-1',
        sections: [],
      }),
    },
    event: {
      findFirst: vi.fn(),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

// Mock permissions
vi.mock('@/lib/auth/permissions', () => ({
  getUserRoles: vi.fn().mockResolvedValue(['MUSICIAN']),
}));

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };

describe('Practice Logs API', () => {
  beforeEach(async () => {
    // reset implementations to ensure no carryover from other tests
    vi.resetAllMocks();
    vi.mocked(isFeatureEnabled).mockReturnValue(true);

    // restore default stand settings mock after reset
    const settingsModule = await import('@/lib/stand/settings');
    vi.mocked(settingsModule.getStandSettings).mockResolvedValue({
      practiceTrackingEnabled: true,
      maxStrokeDataBytes: 1000000,
      maxAnnotationsPerPage: 100,
    });

    // Provide default stand access context
    const access = await import('@/lib/stand/access');
    vi.mocked(access.requireStandAccess).mockResolvedValue({
      userId: 'user-1',
      roles: [],
      isPrivileged: false,
      isDirector: false,
      isLibrarian: false,
      isSectionLeader: false,
      userSectionIds: [],
      memberId: 'member-1',
    });
    vi.mocked(access.canAccessPiece).mockResolvedValue(true);

    // import route after mocks applied
    const mod = await import('@/app/api/stand/practice-logs/route');
    GET = mod.GET;
    POST = mod.POST;
  });

  describe('GET', () => {
    it('should return 404 when feature is disabled', async () => {
      vi.mocked(getStandSettings).mockResolvedValueOnce({ practiceTrackingEnabled: false });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs')
      );

      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);
      // simulate guard returning unauthorized response
      const access = await import('@/lib/stand/access');
      vi.mocked(access.requireStandAccess).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      );

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs')
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return practice logs for authenticated user', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          pieceId: 'piece-1',
          durationSeconds: 1800,
          notes: 'Good session',
          piece: { id: 'piece-1', title: 'Test Piece', composer: { name: 'Bach' } },
        },
      ];

      vi.mocked(prisma.practiceLog.findMany).mockResolvedValueOnce(mockLogs as any);
      vi.mocked(prisma.practiceLog.count).mockResolvedValueOnce(1);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.logs).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('should scope logs to own user for non-directors', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.practiceLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.practiceLog.count).mockResolvedValueOnce(0);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs?userId=user-2')
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      // Should have been called with user-1, not user-2
      expect(prisma.practiceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        })
      );
    });

    it('should respect limit and offset query params', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.practiceLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.practiceLog.count).mockResolvedValueOnce(0);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs?limit=10&offset=25')
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      expect(prisma.practiceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 25,
        })
      );
    });
  });

  describe('POST', () => {
    it('should return 404 when feature is disabled', async () => {
      vi.mocked(getStandSettings).mockResolvedValueOnce({ practiceTrackingEnabled: false });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'piece-1',
            durationSeconds: 1800,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(404);
    });

    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);
      const access = await import('@/lib/stand/access');
      vi.mocked(access.requireStandAccess).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      );

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'piece-1',
            durationSeconds: 1800,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should create a practice log with valid data', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      vi.mocked(prisma.musicPiece.findUnique).mockResolvedValueOnce({
        id: 'piece-1',
      } as any);

      vi.mocked(prisma.practiceLog.create).mockResolvedValueOnce({
        id: 'log-1',
        userId: 'user-1',
        pieceId: 'piece-1',
        durationSeconds: 1800,
        notes: null,
        piece: { id: 'piece-1', title: 'Test Piece' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'piece-1',
            durationSeconds: 1800,
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.log).toBeDefined();
      expect(data.log.pieceId).toBe('piece-1');
    });

    it('should return 404 for non-existent piece', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      const access = await import('@/lib/stand/access');
      vi.mocked(access.canAccessPiece).mockResolvedValueOnce(false);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'nonexistent',
            durationSeconds: 1800,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid duration', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'piece-1',
            durationSeconds: -1,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should always use session userId (prevent spoofing)', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      vi.mocked(prisma.musicPiece.findUnique).mockResolvedValueOnce({
        id: 'piece-1',
      } as any);

      vi.mocked(prisma.practiceLog.create).mockResolvedValueOnce({
        id: 'log-1',
        userId: 'user-1',
        piece: { id: 'piece-1', title: 'Test' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/practice-logs'),
        {
          method: 'POST',
          body: JSON.stringify({
            pieceId: 'piece-1',
            durationSeconds: 600,
          }),
        }
      );

      await POST(request);

      expect(prisma.practiceLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
          }),
        })
      );
    });
  });
});
