import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMusicPiece, updateMusicPiece, deleteMusicPiece } from '../music';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/permissions';
import { auditLog } from '@/lib/services/audit';
import { MUSIC_CREATE, MUSIC_EDIT, MUSIC_DELETE } from '@/lib/auth/permission-constants';
import { MusicDifficulty } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    musicPiece: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

describe('Music Actions', () => {
  const mockPiece = {
    id: 'piece-1',
    title: 'Test Piece',
    difficulty: MusicDifficulty.GRADE_3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMusicPiece', () => {
    it('should create a music piece successfully with valid data', async () => {
      const input = {
        title: 'New Piece',
        difficulty: MusicDifficulty.GRADE_4,
        duration: 300,
      };

      vi.mocked(prisma.musicPiece.create).mockResolvedValue({ id: 'new-id', ...input } as any);

      const result = await createMusicPiece(input);

      expect(requirePermission).toHaveBeenCalledWith(MUSIC_CREATE);
      expect(prisma.musicPiece.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'New Piece',
          difficulty: MusicDifficulty.GRADE_4,
        }),
      });
      expect(auditLog).toHaveBeenCalled();
      expect(result.id).toBe('new-id');
    });

    it('should throw error if validation fails', async () => {
      const input = {
        title: '', // Invalid: title is required and min length 1
      };

      await expect(createMusicPiece(input as any)).rejects.toThrow();
    });

    it('should create a music piece with tags', async () => {
      const input = {
        title: 'Tagged Piece',
        tags: ['classical', 'symphony'],
      };

      vi.mocked(prisma.musicPiece.create).mockResolvedValue({ id: 'tagged-id', ...input } as any);

      const result = await createMusicPiece(input);

      expect(prisma.musicPiece.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Tagged Piece',
          tags: ['classical', 'symphony'],
        }),
      });
      expect(result.tags).toEqual(['classical', 'symphony']);
    });
  });

  describe('updateMusicPiece', () => {
    it('should update a music piece successfully with valid partial data', async () => {
      const id = 'piece-1';
      const input = {
        title: 'Updated Title',
      };

      vi.mocked(prisma.musicPiece.update).mockResolvedValue({ id, ...input } as any);

      const result = await updateMusicPiece(id, input);

      expect(requirePermission).toHaveBeenCalledWith(MUSIC_EDIT);
      expect(prisma.musicPiece.update).toHaveBeenCalledWith({
        where: { id },
        data: expect.objectContaining({
          title: 'Updated Title',
        }),
      });
      expect(auditLog).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('should throw error if validation fails for update', async () => {
      const id = 'piece-1';
      const input = {
        title: '', // Invalid if provided
      };

      await expect(updateMusicPiece(id, input as any)).rejects.toThrow();
    });
  });

  describe('deleteMusicPiece', () => {
    it('should delete a music piece successfully', async () => {
      const id = 'piece-1';
      vi.mocked(prisma.musicPiece.delete).mockResolvedValue({ id } as any);

      await deleteMusicPiece(id);

      expect(requirePermission).toHaveBeenCalledWith(MUSIC_DELETE);
      expect(prisma.musicPiece.delete).toHaveBeenCalledWith({
        where: { id },
      });
      expect(auditLog).toHaveBeenCalled();
    });
  });
});
