import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateSetting, updateSettings } from '../actions';

// Mock Next.js cache functions
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    systemSetting: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', email: 'admin@test.com' },
  }),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe('Settings Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateSetting', () => {
    it('should create a new setting when it does not exist', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.create.mockResolvedValue({
        id: 'setting-1',
        key: 'band_name',
        value: 'Test Band',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      });

      const result = await updateSetting('band_name', 'Test Band');

      expect(result.success).toBe(true);
      expect(mockPrisma.systemSetting.create).toHaveBeenCalledWith({
        data: {
          key: 'band_name',
          value: 'Test Band',
          updatedBy: 'admin-id',
        },
      });
    });

    it('should update an existing setting', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'band_name',
        value: 'Old Band Name',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'old-admin-id',
      });
      mockPrisma.systemSetting.update.mockResolvedValue({
        id: 'setting-1',
        key: 'band_name',
        value: 'New Band Name',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      });

      const result = await updateSetting('band_name', 'New Band Name');

      expect(result.success).toBe(true);
      expect(mockPrisma.systemSetting.update).toHaveBeenCalledWith({
        where: { key: 'band_name' },
        data: {
          value: 'New Band Name',
          updatedBy: 'admin-id',
        },
      });
    });

    it('should return error on database failure', async () => {
      mockPrisma.systemSetting.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await updateSetting('band_name', 'Test Band');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update setting');
    });
  });

  describe('updateSettings', () => {
    it('should update multiple settings', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.create.mockResolvedValue({
        id: 'setting-1',
        key: 'test-key',
        value: 'test-value',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      });

      const settings = {
        band_name: 'Test Band',
        contact_email: 'test@example.com',
      };

      const result = await updateSettings(settings);

      expect(result.success).toBe(true);
      expect(mockPrisma.systemSetting.create).toHaveBeenCalledTimes(2);
    });

    it('should handle mix of create and update operations', async () => {
      // First setting exists
      mockPrisma.systemSetting.findUnique
        .mockResolvedValueOnce({
          id: 'setting-1',
          key: 'band_name',
          value: 'Old Name',
          description: null,
          updatedAt: new Date(),
          updatedBy: 'old-admin',
        })
        // Second setting does not exist
        .mockResolvedValueOnce(null);

      mockPrisma.systemSetting.update.mockResolvedValue({
        id: 'setting-1',
        key: 'band_name',
        value: 'New Name',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      });
      mockPrisma.systemSetting.create.mockResolvedValue({
        id: 'setting-2',
        key: 'contact_email',
        value: 'test@example.com',
        description: null,
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      });

      const settings = {
        band_name: 'New Name',
        contact_email: 'test@example.com',
      };

      const result = await updateSettings(settings);

      expect(result.success).toBe(true);
      expect(mockPrisma.systemSetting.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.systemSetting.create).toHaveBeenCalledTimes(1);
    });

    it('should return error on database failure', async () => {
      mockPrisma.systemSetting.findUnique.mockRejectedValue(new Error('Database error'));

      const settings = {
        band_name: 'Test Band',
      };

      const result = await updateSettings(settings);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update settings');
    });

    it('should handle empty settings object', async () => {
      const result = await updateSettings({});

      expect(result.success).toBe(true);
      expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
    });
  });
});
