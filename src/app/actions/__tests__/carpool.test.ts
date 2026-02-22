import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCarpoolEntry, deleteCarpoolEntry } from '../carpool';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { CarpoolType } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    carpoolEntry: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Carpool Actions', () => {
  const mockUserId = 'user-123';
  const mockMemberId = 'member-123';
  const mockEventId = 'event-456';

  const mockCarpoolEntry = {
    id: 'carpool-entry-789',
    eventId: mockEventId,
    memberId: mockMemberId,
    type: 'OFFER' as CarpoolType,
    seats: 3,
    location: '123 Main St',
    notes: 'Can pick up anyone along the way',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createCarpoolEntry', () => {
    const createMockFormData = (data: Record<string, string | number>) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      return formData;
    };

    it('should create a carpool offer successfully', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        userId: mockUserId,
      });
      vi.mocked(prisma.carpoolEntry.create).mockResolvedValueOnce(mockCarpoolEntry);

      const formData = createMockFormData({
        eventId: mockEventId,
        type: 'OFFER',
        seats: 3,
        location: '123 Main St',
        notes: 'Can pick up anyone along the way',
      });

      await expect(createCarpoolEntry(formData)).resolves.not.toThrow();
      expect(prisma.carpoolEntry.create).toHaveBeenCalledWith({
        data: {
          eventId: mockEventId,
          memberId: mockMemberId,
          type: 'OFFER',
          seats: 3,
          location: '123 Main St',
          notes: 'Can pick up anyone along the way',
        },
      });
    });

    it('should create a carpool request successfully', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'Jane',
        lastName: 'Smith',
        userId: mockUserId,
      });
      vi.mocked(prisma.carpoolEntry.create).mockResolvedValueOnce({
        ...mockCarpoolEntry,
        type: 'REQUEST',
        seats: 1,
        location: '',
        notes: '',
      });

      // Note: The schema requires all fields to be present (even if empty strings)
      // because FormData.get() returns null for missing fields, and Zod's optional()
      // only accepts undefined, not null
      const formData = createMockFormData({
        eventId: mockEventId,
        type: 'REQUEST',
        seats: 1,
        location: '',
        notes: '',
      });

      await expect(createCarpoolEntry(formData)).resolves.not.toThrow();
      expect(prisma.carpoolEntry.create).toHaveBeenCalledWith({
        data: {
          eventId: mockEventId,
          memberId: mockMemberId,
          type: 'REQUEST',
          seats: 1,
          location: '',
          notes: '',
        },
      });
    });

    it('should throw error when user is not authenticated', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const formData = createMockFormData({
        eventId: mockEventId,
        type: 'OFFER',
      });

      await expect(createCarpoolEntry(formData)).rejects.toThrow('Unauthorized');
    });

    it('should throw error when member is not found', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(null);

      const formData = createMockFormData({
        eventId: mockEventId,
        type: 'OFFER',
      });

      await expect(createCarpoolEntry(formData)).rejects.toThrow('Member not found');
    });

    it('should throw validation error when required fields are missing', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        userId: mockUserId,
      });

      // Missing required fields - FormData.get returns null which fails Zod validation
      const formData = new FormData();
      formData.append('eventId', mockEventId);
      formData.append('type', 'OFFER');
      // Not appending seats, location, notes - will be null

      await expect(createCarpoolEntry(formData)).rejects.toThrow();
    });
  });

  describe('deleteCarpoolEntry', () => {
    it('should delete carpool entry successfully', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        userId: mockUserId,
      });
      vi.mocked(prisma.carpoolEntry.findUnique).mockResolvedValueOnce(mockCarpoolEntry);
      vi.mocked(prisma.carpoolEntry.delete).mockResolvedValueOnce(mockCarpoolEntry);

      await expect(deleteCarpoolEntry('carpool-entry-789', mockEventId)).resolves.not.toThrow();
      expect(prisma.carpoolEntry.delete).toHaveBeenCalledWith({
        where: { id: 'carpool-entry-789' },
      });
    });

    it('should throw error when user is not authenticated', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      await expect(deleteCarpoolEntry('carpool-entry-789', mockEventId)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should throw error when member is not found', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(null);

      await expect(deleteCarpoolEntry('carpool-entry-789', mockEventId)).rejects.toThrow(
        'Member not found'
      );
    });

    it('should throw error when carpool entry is not found', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        userId: mockUserId,
      });
      vi.mocked(prisma.carpoolEntry.findUnique).mockResolvedValueOnce(null);

      await expect(deleteCarpoolEntry('non-existent', mockEventId)).rejects.toThrow(
        'Unauthorized or not found'
      );
    });

    it('should throw error when user does not own the carpool entry', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: mockUserId, email: 'test@example.com' },
      });
      vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        userId: mockUserId,
      });
      vi.mocked(prisma.carpoolEntry.findUnique).mockResolvedValueOnce({
        ...mockCarpoolEntry,
        memberId: 'different-member-id',
      });

      await expect(deleteCarpoolEntry('carpool-entry-789', mockEventId)).rejects.toThrow(
        'Unauthorized or not found'
      );
    });
  });
});
