import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createMockUser, createMockMember } from '@/lib/__tests__/test-helpers';

// Mock the modules
vi.mock('@/lib/db', () => ({
  prisma: createMockPrisma(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import after mocking
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { updateProfile, updateProfileImage, removeProfileImage } from '../actions';

const mockPrisma = prisma as unknown as ReturnType<typeof createMockPrisma>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;

describe('Profile Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateProfile', () => {
    it('should update profile with valid data', async () => {
      const mockUser = createMockUser();
      const mockMember = {
        ...createMockMember(),
        instruments: [],
        sections: [],
      };

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(mockMember);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          member: {
            update: vi.fn().mockResolvedValue({ ...mockMember, firstName: 'Updated' }),
          },
          memberInstrument: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
          memberSection: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await updateProfile({
        firstName: 'Updated',
        lastName: 'User',
        email: 'updated@example.com',
        phone: '555-1234',
        instrumentIds: [],
        sectionIds: [],
      });

      expect(mockRequireAuth).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when member not found', async () => {
      const mockUser = createMockUser();

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(null);

      await expect(
        updateProfile({
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow('Member profile not found');
    });

    it('should validate required fields', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });

      await expect(
        updateProfile({
          firstName: '',
          lastName: 'User',
        })
      ).rejects.toThrow();
    });

    it('should update instruments when provided', async () => {
      const mockUser = createMockUser();
      const mockMember = {
        ...createMockMember(),
        instruments: [{ id: 'old-instrument', instrumentId: 'inst-1', isPrimary: true }],
        sections: [],
      };

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(mockMember);

      const mockTx = {
        member: {
          update: vi.fn().mockResolvedValue(mockMember),
        },
        memberInstrument: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        memberSection: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockTx));

      await updateProfile({
        firstName: 'Test',
        lastName: 'User',
        instrumentIds: ['inst-1', 'inst-2'],
        primaryInstrumentId: 'inst-1',
        sectionIds: [],
      });

      expect(mockTx.memberInstrument.deleteMany).toHaveBeenCalled();
      expect(mockTx.memberInstrument.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ instrumentId: 'inst-1', isPrimary: true }),
          expect.objectContaining({ instrumentId: 'inst-2', isPrimary: false }),
        ]),
      });
    });

    it('should update sections when provided', async () => {
      const mockUser = createMockUser();
      const mockMember = {
        ...createMockMember(),
        instruments: [],
        sections: [{ id: 'old-section', sectionId: 'sec-1' }],
      };

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(mockMember);

      const mockTx = {
        member: {
          update: vi.fn().mockResolvedValue(mockMember),
        },
        memberInstrument: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        memberSection: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockTx));

      await updateProfile({
        firstName: 'Test',
        lastName: 'User',
        instrumentIds: [],
        sectionIds: ['sec-1', 'sec-2'],
      });

      expect(mockTx.memberSection.deleteMany).toHaveBeenCalled();
      expect(mockTx.memberSection.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ sectionId: 'sec-1' }),
          expect.objectContaining({ sectionId: 'sec-2' }),
        ]),
      });
    });
  });

  describe('updateProfileImage', () => {
    it('should upload valid image', async () => {
      const mockUser = createMockUser();
      const mockMember = createMockMember();

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(mockMember);
      mockPrisma.member.update.mockResolvedValue({
        ...mockMember,
        profilePhoto: 'data:image/png;base64,test',
      });
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        image: 'data:image/png;base64,test',
      });

      // Create a mock file
      const mockFile = new File(['test image content'], 'test.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('image', mockFile);

      const result = await updateProfileImage(formData);

      expect(result.success).toBe(true);
      expect(result.imageUrl).toContain('data:image/png;base64');
    });

    it('should reject invalid file types', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });

      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('image', mockFile);

      await expect(updateProfileImage(formData)).rejects.toThrow('Invalid file type');
    });

    it('should reject files larger than 5MB', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });

      // Create a mock file that's too large (6MB)
      const largeContent = 'x'.repeat(6 * 1024 * 1024);
      const mockFile = new File([largeContent], 'large.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('image', mockFile);

      await expect(updateProfileImage(formData)).rejects.toThrow('File size too large');
    });

    it('should throw error when no file provided', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });

      const formData = new FormData();

      await expect(updateProfileImage(formData)).rejects.toThrow('No image file provided');
    });

    it('should throw error when member not found', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(null);

      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('image', mockFile);

      await expect(updateProfileImage(formData)).rejects.toThrow('Member profile not found');
    });
  });

  describe('removeProfileImage', () => {
    it('should remove profile image', async () => {
      const mockUser = createMockUser();
      const mockMember = {
        ...createMockMember(),
        profilePhoto: 'data:image/png;base64,existing',
      };

      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(mockMember);
      mockPrisma.member.update.mockResolvedValue({
        ...mockMember,
        profilePhoto: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        image: null,
      });

      const result = await removeProfileImage();

      expect(result.success).toBe(true);
      expect(mockPrisma.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { profilePhoto: null },
        })
      );
    });

    it('should throw error when member not found', async () => {
      const mockUser = createMockUser();
      mockRequireAuth.mockResolvedValue({ user: mockUser });
      mockPrisma.member.findUnique.mockResolvedValue(null);

      await expect(removeProfileImage()).rejects.toThrow('Member profile not found');
    });
  });
});
