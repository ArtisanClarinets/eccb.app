import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PUT, DELETE } from '@/app/api/stand/annotations/[id]/route';
import { NextRequest } from 'next/server';

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
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock permissions
vi.mock('@/lib/auth/permissions', () => ({
  getUserRoles: vi.fn().mockResolvedValue(['MUSICIAN']),
}));

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';

const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };

describe('Annotations [id] API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createParams = (id: string) => Promise.resolve({ id });

  describe('PUT', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ strokeData: {} }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ strokeData: {} }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(404);
    });

    it('should allow owner to update their annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);
      vi.mocked(prisma.annotation.update).mockResolvedValueOnce({
        id: 'ann-1',
        strokeData: { updated: true },
        user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ strokeData: { updated: true } }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(200);
    });

    it('should reject non-owner non-director from updating', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-2' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ strokeData: { x: 1 } }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(403);
    });

    it('should reject non-director setting DIRECTOR layer', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ layer: 'DIRECTOR' }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(403);
    });

    it('should reject SECTION layer update when user has no section', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        sections: [],
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ layer: 'SECTION' }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.error).toContain('section');
    });

    it('should allow SECTION layer update when user has section membership', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        sections: [{ sectionId: 'section-clarinet' }],
      } as any);
      vi.mocked(prisma.annotation.update).mockResolvedValueOnce({
        id: 'ann-1',
        layer: 'SECTION',
        sectionId: 'section-clarinet',
        user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ layer: 'SECTION' }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(200);
      expect(prisma.annotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sectionId: 'section-clarinet',
          }),
        })
      );
    });

    it('should allow director to update any annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-2' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
        layer: 'PERSONAL',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['DIRECTOR']);
      vi.mocked(prisma.annotation.update).mockResolvedValueOnce({
        id: 'ann-1',
        user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        {
          method: 'PUT',
          body: JSON.stringify({ strokeData: { x: 1 } }),
        }
      );

      const response = await PUT(request, { params: createParams('ann-1') });
      expect(response.status).toBe(200);
    });
  });

  describe('DELETE', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: createParams('ann-1') });
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: createParams('ann-1') });
      expect(response.status).toBe(404);
    });

    it('should allow owner to delete their annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);
      vi.mocked(prisma.annotation.delete).mockResolvedValueOnce({} as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: createParams('ann-1') });
      expect(response.status).toBe(200);
    });

    it('should reject non-owner non-director from deleting', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-2' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['MUSICIAN']);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: createParams('ann-1') });
      expect(response.status).toBe(403);
    });

    it('should allow director to delete any annotation', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-2' } });
      vi.mocked(prisma.annotation.findUnique).mockResolvedValueOnce({
        id: 'ann-1',
        userId: 'user-1',
      } as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['DIRECTOR']);
      vi.mocked(prisma.annotation.delete).mockResolvedValueOnce({} as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/annotations/ann-1'),
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: createParams('ann-1') });
      expect(response.status).toBe(200);
    });
  });
});
