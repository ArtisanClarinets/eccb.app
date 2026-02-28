import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/stand/annotations/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock auth
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    annotation: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'annotation-1',
        musicId: 'music-1',
        page: 1,
        layer: 'PERSONAL',
        strokeData: {},
        userId: 'user-1',
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      }),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'member-1',
        sections: [],
      }),
    },
  },
}));

// Mock permissions
vi.mock('@/lib/auth/permissions', () => ({
  getUserRoles: vi.fn().mockResolvedValue(['MEMBER']),
}));

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';

const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };

describe('Annotations API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations?musicId=music-1')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return annotations for authenticated user', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(prisma.annotation.findMany).mockResolvedValueOnce([
        {
          id: 'annotation-1',
          musicId: 'music-1',
          page: 1,
          layer: 'PERSONAL',
          strokeData: { points: [] },
          userId: 'user-1',
          user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        } as any,
      ]);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations?musicId=music-1')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.annotations).toHaveLength(1);
      expect(data.annotations[0].musicId).toBe('music-1');
    });

    it('should filter annotations by query parameters', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(prisma.annotation.findMany).mockResolvedValueOnce([]);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations?musicId=music-1&page=1&layer=PERSONAL')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.annotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            musicId: 'music-1',
            page: 1,
            layer: 'PERSONAL',
          }),
        })
      );
    });

    it('should restrict non-directors to personal and section annotations', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(getUserRoles).mockResolvedValueOnce(['MEMBER']);
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        sections: [{ id: 'section-1' }],
      } as any);
      vi.mocked(prisma.annotation.findMany).mockResolvedValueOnce([]);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations?musicId=music-1')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      const callArgs = vi.mocked(prisma.annotation.findMany).mock.calls[0]?.[0];
      expect(callArgs?.where?.OR).toBeDefined();
      expect(callArgs?.where?.OR).toContainEqual({ userId: 'user-1', layer: 'PERSONAL' });
      expect(callArgs?.where?.OR).toContainEqual(expect.objectContaining({ layer: 'SECTION' }));
      expect(callArgs?.where?.OR).toContainEqual({ layer: 'DIRECTOR' });
    });

    it('should allow directors to see all annotations', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(getUserRoles).mockResolvedValueOnce(['DIRECTOR']);
      vi.mocked(prisma.annotation.findMany).mockResolvedValueOnce([]);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations?musicId=music-1')
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      const callArgs = vi.mocked(prisma.annotation.findMany).mock.calls[0]?.[0];
      // Directors should not have the OR restriction
      expect(callArgs?.where?.OR).toBeUndefined();
    });
  });

  describe('POST', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'PERSONAL',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should create annotation with valid data', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'PERSONAL',
            strokeData: { points: [{ x: 0.5, y: 0.5 }] },
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.annotation).toBeDefined();
      expect(data.annotation.musicId).toBe('music-1');
    });

    it('should return 400 for invalid layer', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'INVALID_LAYER',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
    });

    it('should return 400 for missing required fields', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            page: 1,
            // missing musicId and layer
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
    });

    it('should use session user ID when userId not provided', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'PERSONAL',
            strokeData: {},
          }),
        }
      );

      await POST(request);

      expect(prisma.annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
          }),
        })
      );
    });

    it('should use session userId even for director annotations (security)', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(getUserRoles).mockResolvedValueOnce(['DIRECTOR']);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'DIRECTOR',
            strokeData: {},
            userId: 'user-2',  // client-supplied; server should ignore this
          }),
        }
      );

      await POST(request);

      // The API always uses session.user.id, ignoring any client-supplied userId
      expect(prisma.annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',  // from session, not 'user-2' from request body
          }),
        })
      );
    });

    it('should reject SECTION layer write when user has no section membership', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      // User has no sections
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        sections: [],
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'SECTION',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('section');
    });

    it('should reject SECTION layer write when user has no member record', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      // No member record at all
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'SECTION',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('section');
    });

    it('should allow SECTION layer write when user belongs to a section', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        sections: [{ sectionId: 'section-clarinet' }],
      } as any);

      vi.mocked(prisma.annotation.create).mockResolvedValueOnce({
        id: 'annotation-2',
        musicId: 'music-1',
        page: 1,
        layer: 'SECTION',
        strokeData: {},
        userId: 'user-1',
        sectionId: 'section-clarinet',
        user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'SECTION',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      await response.json();

      expect(response.status).toBe(201);
      expect(prisma.annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sectionId: 'section-clarinet',
          }),
        })
      );
    });

    it('should reject non-directors from writing DIRECTOR layer', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations'),
        {
          method: 'POST',
          body: JSON.stringify({
            musicId: 'music-1',
            page: 1,
            layer: 'DIRECTOR',
            strokeData: {},
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('director');
    });
  });
});
