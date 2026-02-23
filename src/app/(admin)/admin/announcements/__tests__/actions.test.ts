import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementPin,
  publishAnnouncement,
  archiveAnnouncement,
  getAnnouncement,
} from '../actions';
import { prisma } from '@/lib/db';
import { AnnouncementType, AnnouncementAudience, ContentStatus } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    announcement: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    userNotification: {
      createMany: vi.fn(),
    },
  },
}));

// Mock auth guards
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/services/email', () => ({
  sendEmail: vi.fn(),
}));

// Mock audit log to prevent header/auth issues
vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import the mocked requirePermission to configure it
import { requirePermission } from '@/lib/auth/guards';

// Define types for mocks
type MockSession = {
  user: { id: string };
  session: { id: string };
};

describe('Announcement Actions', () => {
  const mockUserId = 'user-123';
  const mockAnnouncement = {
    id: 'announcement-123',
    title: 'Test Announcement',
    content: 'Test content',
    type: 'INFO' as AnnouncementType,
    audience: 'ALL' as AnnouncementAudience,
    isUrgent: false,
    isPinned: false,
    status: 'DRAFT' as ContentStatus,
    publishAt: null,
    expiresAt: null,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    targetRoles: null,
    author: { id: mockUserId, name: 'Test User', email: 'test@example.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Configure requirePermission mock to return a valid session with user
    vi.mocked(requirePermission).mockResolvedValue({
      user: { id: mockUserId },
      session: { id: 'session-123' },
    } as MockSession);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createAnnouncement', () => {
    it('should create a draft announcement successfully', async () => {
      vi.mocked(prisma.announcement.create).mockResolvedValueOnce(mockAnnouncement);

      const result = await createAnnouncement({
        title: 'Test Announcement',
        content: 'Test content',
        type: 'INFO',
        audience: 'ALL',
        status: 'DRAFT',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('announcement-123');
      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Test Announcement',
            content: 'Test content',
            type: 'INFO',
            audience: 'ALL',
            status: 'DRAFT',
            createdBy: mockUserId,
          }),
        })
      );
    });

    it('should create and publish announcement with publishedAt date', async () => {
      vi.mocked(prisma.announcement.create).mockResolvedValueOnce({
        ...mockAnnouncement,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.userNotification.createMany).mockResolvedValueOnce({ count: 0 });

      const result = await createAnnouncement({
        title: 'Test Announcement',
        content: 'Test content',
        type: 'INFO',
        audience: 'ALL',
        status: 'PUBLISHED',
      });

      expect(result.success).toBe(true);
      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PUBLISHED',
            publishedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should return error for invalid data', async () => {
      const result = await createAnnouncement({
        title: '',
        content: 'Test content',
        type: 'INFO',
        audience: 'ALL',
        status: 'DRAFT',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle urgent announcements', async () => {
      vi.mocked(prisma.announcement.create).mockResolvedValueOnce({
        ...mockAnnouncement,
        isUrgent: true,
        type: 'URGENT',
      });
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: 'user-1', email: 'user1@example.com', name: 'User 1' } as unknown as any,
      ]);
      vi.mocked(prisma.userNotification.createMany).mockResolvedValueOnce({ count: 1 });

      const result = await createAnnouncement({
        title: 'Urgent Announcement',
        content: 'This is urgent',
        type: 'URGENT',
        audience: 'ALL',
        status: 'PUBLISHED',
        isUrgent: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('updateAnnouncement', () => {
    it('should update announcement successfully', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(mockAnnouncement);
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        title: 'Updated Title',
      });

      const result = await updateAnnouncement('announcement-123', {
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'announcement-123' },
          data: { title: 'Updated Title' },
        })
      );
    });

    it('should return error if announcement not found', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(null);

      const result = await updateAnnouncement('non-existent', {
        title: 'Updated Title',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Announcement not found');
    });

    it('should set publishedAt when publishing a draft', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(mockAnnouncement);
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.userNotification.createMany).mockResolvedValueOnce({ count: 0 });

      const result = await updateAnnouncement('announcement-123', {
        status: 'PUBLISHED',
      });

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PUBLISHED',
            publishedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('deleteAnnouncement', () => {
    it('should delete announcement successfully', async () => {
      vi.mocked(prisma.announcement.delete).mockResolvedValueOnce(mockAnnouncement);

      const result = await deleteAnnouncement('announcement-123');

      expect(result.success).toBe(true);
      expect(prisma.announcement.delete).toHaveBeenCalledWith({
        where: { id: 'announcement-123' },
      });
    });

    it('should handle delete errors', async () => {
      vi.mocked(prisma.announcement.delete).mockRejectedValueOnce(new Error('Database error'));

      const result = await deleteAnnouncement('announcement-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete announcement');
    });
  });

  describe('toggleAnnouncementPin', () => {
    it('should pin an unpinned announcement', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(mockAnnouncement);
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        isPinned: true,
      });

      const result = await toggleAnnouncementPin('announcement-123');

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPinned: true },
        })
      );
    });

    it('should unpin a pinned announcement', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce({
        ...mockAnnouncement,
        isPinned: true,
      });
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        isPinned: false,
      });

      const result = await toggleAnnouncementPin('announcement-123');

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPinned: false },
        })
      );
    });
  });

  describe('publishAnnouncement', () => {
    it('should publish a draft announcement', async () => {
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishAt: new Date(),
      });
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.userNotification.createMany).mockResolvedValueOnce({ count: 0 });

      const result = await publishAnnouncement('announcement-123');

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PUBLISHED',
            publishedAt: expect.any(Date),
            publishAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('archiveAnnouncement', () => {
    it('should archive an announcement', async () => {
      vi.mocked(prisma.announcement.update).mockResolvedValueOnce({
        ...mockAnnouncement,
        status: 'ARCHIVED',
      });

      const result = await archiveAnnouncement('announcement-123');

      expect(result.success).toBe(true);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        })
      );
    });
  });

  describe('getAnnouncement', () => {
    it('should return announcement by id', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(mockAnnouncement);

      const result = await getAnnouncement('announcement-123');

      expect(result).toEqual(mockAnnouncement);
      expect(prisma.announcement.findUnique).toHaveBeenCalledWith({
        where: { id: 'announcement-123' },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });

    it('should return null for non-existent announcement', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(null);

      const result = await getAnnouncement('non-existent');

      expect(result).toBeNull();
    });
  });
});
