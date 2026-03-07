import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/stand/preferences/route';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock permissions so getUserRoles can be spied on
vi.mock('@/lib/auth/permissions', () => ({
  getUserRoles: vi.fn().mockResolvedValue([]),
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
    userPreferences: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'member-1',
        sections: [],
      }),
      findUnique: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';

const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };

describe('Preferences API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 401 if no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences')
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return existing preferences', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        nightMode: true,
        otherSettings: { tunerSettings: { a440: 442 } },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.preferences.nightMode).toBe(true);
    });

    it('should create default preferences if none exist', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.userPreferences.create).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        nightMode: false,
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences')
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.preferences.nightMode).toBe(false);
    });

    it('should reject viewing other user preferences', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences?userId=user-2')
      );

      const response = await GET(request);
      expect(response.status).toBe(403);
    });

    it('should allow directors to view other user preferences', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'dir-1' },
      });
      // ensure buildAccessContext sees a privileged role
      vi.mocked(prisma.userRole.findMany).mockResolvedValueOnce([
        { role: { type: 'DIRECTOR' } },
      ] as any);
      vi.mocked(getUserRoles).mockResolvedValueOnce(['DIRECTOR']);

      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce({
        id: 'pref-2',
        userId: 'user-2',
        nightMode: true,
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences?userId=user-2')
      );

      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.preferences.userId).toBe('user-2');
    });
  });

  describe('POST (deep merge)', () => {
    it('should deep-merge tunerSettings without wiping audioTrackerSettings', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      // Existing preferences with audioTrackerSettings
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        otherSettings: {
          audioTrackerSettings: { enabled: true, sensitivity: 0.5 },
          pitchPipeSettings: { concert: 'Bb' },
        },
      } as any);

      vi.mocked(prisma.userPreferences.upsert).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        otherSettings: {
          audioTrackerSettings: { enabled: true, sensitivity: 0.5 },
          pitchPipeSettings: { concert: 'Bb' },
          tunerSettings: { a440: 442 },
        },
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences'),
        {
          method: 'POST',
          body: JSON.stringify({
            tunerSettings: { a440: 442 },
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      // The upsert should have been called with merged otherSettings
      const call = vi.mocked(prisma.userPreferences.upsert).mock.calls[0]?.[0];
      const updateOther = call?.update?.otherSettings as Record<string, unknown>;
      const createOther = call?.create?.otherSettings as Record<string, unknown>;

      // Update path should preserve existing keys
      expect(updateOther).toHaveProperty('audioTrackerSettings');
      expect(updateOther).toHaveProperty('tunerSettings');
      // create branch is less relevant when record already exists, but it
      // should at least include the new tuner settings
      expect(createOther).toHaveProperty('tunerSettings');
    });

    it('should handle first-time creation with no existing preferences', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      // No existing preferences
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce(null);

      vi.mocked(prisma.userPreferences.upsert).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        nightMode: true,
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences'),
        {
          method: 'POST',
          body: JSON.stringify({ nightMode: true }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid body', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences'),
        {
          method: 'POST',
          body: JSON.stringify({
            audioTrackerSettings: { sensitivity: 999 }, // out of range
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH', () => {
    it('should work as an alias for POST', async () => {
      mockAuth.api.getSession.mockResolvedValue({ user: { id: 'user-1' } });
      vi.mocked(prisma.userPreferences.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.userPreferences.upsert).mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        nightMode: false,
      } as any);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/preferences'),
        {
          method: 'PATCH',
          body: JSON.stringify({ nightMode: false }),
        }
      );

      const response = await PATCH(request);
      expect(response.status).toBe(200);
    });
  });
});
