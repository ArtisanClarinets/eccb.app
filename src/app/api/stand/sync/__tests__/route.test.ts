import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/stand/sync/route';
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

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    standSession: {
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn().mockResolvedValue({}),
    },
    annotation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userRole: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };

describe('Stand Sync API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync?eventId=test-event')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 if no eventId', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('eventId query parameter is required');
    });

    it('should return sync state for valid request', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1' },
      });

      // Mock member lookup for event access
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        userId: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        sections: [],
      } as any);

      vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({
        id: 'test-event',
        title: 'Test Event',
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync?eventId=test-event')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.eventId).toBe('test-event');
      expect(data.activeUsers).toBe(0);
    });
  });

  describe('POST', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync'),
        {
          method: 'POST',
          body: JSON.stringify({ eventId: 'test-event' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 if no eventId', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync'),
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('eventId is required');
    });

    it('should update sync state for valid command', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        userId: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        sections: [],
      } as any);

      vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({
        id: 'test-event',
        title: 'Test Event',
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync'),
        {
          method: 'POST',
          body: JSON.stringify({
            eventId: 'test-event',
            command: {
              type: 'command',
              action: 'setPage',
              page: 5,
            },
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.command.action).toBe('setPage');
    });

    it('should handle presence updates', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      });

      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: 'member-1',
        userId: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        sections: [],
      } as any);

      vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({
        id: 'test-event',
        title: 'Test Event',
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/sync'),
        {
          method: 'POST',
          body: JSON.stringify({
            eventId: 'test-event',
            presence: {
              type: 'presence',
              status: 'joined',
            },
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.presence.status).toBe('joined');
    });
  });
});
