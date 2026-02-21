/**
 * Smart Upload Settings Service Tests
 *
 * Tests for the smart-upload-settings service functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    aIProvider: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    aPIKey: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    aIModel: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    modelParameter: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    settingsAuditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encryptApiKey: vi.fn((key) => `encrypted-${key}`),
  decryptApiKey: vi.fn((key) => key.replace('encrypted-', '')),
  hashApiKey: vi.fn((key) => `hash-${key}`),
}));

vi.mock('@/lib/ai/provider-config', () => ({
  getProviderConfig: vi.fn((providerId) => ({
    providerId,
    baseUrl: 'https://api.example.com',
    headerFormat: 'bearer',
    apiKeyHeaderName: 'Authorization',
    testEndpoint: '/models',
    modelsEndpoint: '/models',
  })),
  PROVIDER_CONFIGS: [],
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { prisma } from '@/lib/db';
import {
  isSmartUploadEnabled,
  setSmartUploadEnabled,
  getSetting,
  setSetting,
  getProviders,
  getEnabledProviders,
  saveApiKey,
  getDecryptedApiKey,
  hasValidApiKey,
  getModelsForProvider,
  getDefaultModel,
  logAudit,
  getSettingsStatus,
} from '../smart-upload-settings';

describe('Smart Upload Settings Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isSmartUploadEnabled', () => {
    it('should return true when enabled setting is "true"', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        key: 'enabled',
        value: 'true',
      });

      const result = await isSmartUploadEnabled();
      expect(result).toBe(true);
    });

    it('should return false when enabled setting is "false"', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        key: 'enabled',
        value: 'false',
      });

      const result = await isSmartUploadEnabled();
      expect(result).toBe(false);
    });

    it('should return false when setting does not exist', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await isSmartUploadEnabled();
      expect(result).toBe(false);
    });
  });

  describe('setSmartUploadEnabled', () => {
    it('should upsert the enabled setting', async () => {
      (prisma.smartUploadSetting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await setSmartUploadEnabled(true, 'user-123');

      expect(prisma.smartUploadSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'enabled' },
        update: {
          value: 'true',
          updatedBy: 'user-123',
        },
        create: {
          key: 'enabled',
          value: 'true',
          description: 'Master toggle for Smart Upload feature',
          category: 'feature',
          updatedBy: 'user-123',
        },
      });
    });

    it('should log audit entry on enable', async () => {
      (prisma.smartUploadSetting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await setSmartUploadEnabled(true, 'user-123');

      expect(prisma.settingsAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'SmartUploadSetting',
          entityId: 'enabled',
          action: 'ENABLE',
          newValue: 'true',
          changedBy: 'user-123',
        }),
      });
    });
  });

  describe('getSetting', () => {
    it('should return setting value when found', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        key: 'test-key',
        value: 'test-value',
      });

      const result = await getSetting('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null when setting not found', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getSetting('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('should upsert a setting', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.smartUploadSetting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await setSetting('new-key', 'new-value', 'user-123', 'Description');

      expect(prisma.smartUploadSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'new-key' },
        update: {
          value: 'new-value',
          updatedBy: 'user-123',
        },
        create: {
          key: 'new-key',
          value: 'new-value',
          description: 'Description',
          category: 'general',
          updatedBy: 'user-123',
        },
      });
    });

    it('should log audit for new settings', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.smartUploadSetting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await setSetting('key', 'value', 'user-123');

      expect(prisma.settingsAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'SmartUploadSetting',
          action: 'CREATE',
        }),
      });
    });
  });

  describe('getProviders', () => {
    it('should return all providers sorted by sortOrder', async () => {
      const mockProviders = [
        { id: '1', providerId: 'openai', displayName: 'OpenAI', sortOrder: 1 },
        { id: '2', providerId: 'anthropic', displayName: 'Anthropic', sortOrder: 2 },
      ];
      (prisma.aIProvider.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProviders);

      const result = await getProviders();

      expect(result).toEqual(mockProviders);
      expect(prisma.aIProvider.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('getEnabledProviders', () => {
    it('should return only enabled providers', async () => {
      const mockProviders = [
        { id: '1', providerId: 'openai', isEnabled: true },
      ];
      (prisma.aIProvider.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProviders);

      const result = await getEnabledProviders();

      expect(result).toEqual(mockProviders);
      expect(prisma.aIProvider.findMany).toHaveBeenCalledWith({
        where: { isEnabled: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('saveApiKey', () => {
    it('should encrypt and save API key', async () => {
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'provider-1',
        providerId: 'openai',
        apiKeys: [],
      });
      (prisma.aPIKey.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.aPIKey.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await saveApiKey('provider-1', 'sk-test-key', 'user-123');

      expect(prisma.aPIKey.create).toHaveBeenCalledWith({
        data: {
          providerId: 'provider-1',
          encryptedKey: 'encrypted-sk-test-key',
          keyHash: 'hash-sk-test-key',
          isValid: false,
          isActive: true,
          createdBy: 'user-123',
        },
      });
    });

    it('should deactivate existing active keys before saving new one', async () => {
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'provider-1',
        providerId: 'openai',
        apiKeys: [{ id: 'key-1', isActive: true }],
      });
      (prisma.aPIKey.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.aPIKey.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await saveApiKey('provider-1', 'sk-test-key', 'user-123');

      expect(prisma.aPIKey.updateMany).toHaveBeenCalledWith({
        where: { providerId: 'provider-1', isActive: true },
        data: { isActive: false },
      });
    });

    it('should throw error when provider not found', async () => {
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(saveApiKey('invalid-provider', 'sk-key', 'user-123'))
        .rejects.toThrow('Provider not found: invalid-provider');
    });
  });

  describe('getDecryptedApiKey', () => {
    it('should return decrypted API key', async () => {
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'key-1',
        encryptedKey: 'encrypted-sk-test',
      });

      const result = await getDecryptedApiKey('provider-1');
      expect(result).toBe('sk-test');
    });

    it('should return null when no API key exists', async () => {
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getDecryptedApiKey('provider-1');
      expect(result).toBeNull();
    });
  });

  describe('hasValidApiKey', () => {
    it('should return true when valid API key exists', async () => {
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'key-1',
        isValid: true,
      });

      const result = await hasValidApiKey('provider-1');
      expect(result).toBe(true);
    });

    it('should return false when no API key exists', async () => {
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await hasValidApiKey('provider-1');
      expect(result).toBe(false);
    });

    it('should return false when API key is invalid', async () => {
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'key-1',
        isValid: false,
      });

      const result = await hasValidApiKey('provider-1');
      expect(result).toBe(false);
    });
  });

  describe('getModelsForProvider', () => {
    it('should return models for a provider', async () => {
      const mockModels = [
        { id: 'model-1', modelId: 'gpt-4', displayName: 'GPT-4' },
      ];
      (prisma.aIModel.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockModels);

      const result = await getModelsForProvider('provider-1');

      expect(result).toEqual(mockModels);
      expect(prisma.aIModel.findMany).toHaveBeenCalledWith({
        where: { providerId: 'provider-1' },
        orderBy: [{ isDefault: 'desc' }, { displayName: 'asc' }],
        include: { parameters: { orderBy: { name: 'asc' } } },
      });
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model for provider', async () => {
      const mockModel = { id: 'model-1', modelId: 'gpt-4', isDefault: true };
      (prisma.aIModel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockModel);

      const result = await getDefaultModel('provider-1');

      expect(result).toEqual(mockModel);
      expect(prisma.aIModel.findFirst).toHaveBeenCalledWith({
        where: { providerId: 'provider-1', isDefault: true },
      });
    });

    it('should return null when no default model exists', async () => {
      (prisma.aIModel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getDefaultModel('provider-1');
      expect(result).toBeNull();
    });
  });

  describe('logAudit', () => {
    it('should create audit log entry', async () => {
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await logAudit({
        entityType: 'AIProvider',
        entityId: 'provider-1',
        action: 'ENABLE',
        userId: 'user-123',
      });

      expect(prisma.settingsAuditLog.create).toHaveBeenCalledWith({
        data: {
          entityType: 'AIProvider',
          entityId: 'provider-1',
          action: 'ENABLE',
          fieldName: null,
          oldValue: null,
          newValue: null,
          changedBy: 'user-123',
          ipAddress: null,
          userAgent: null,
        },
      });
    });

    it('should not throw when audit logging fails', async () => {
      (prisma.settingsAuditLog.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(logAudit({
        entityType: 'Test',
        entityId: 'id',
        action: 'ACTION',
      })).resolves.not.toThrow();
    });
  });

  describe('getSettingsStatus', () => {
    it('should return full settings status', async () => {
      (prisma.smartUploadSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        key: 'enabled',
        value: 'true',
      });
      (prisma.smartUploadSetting.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { key: 'enabled', value: 'true' },
      ]);
      (prisma.aIProvider.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'p1', providerId: 'openai', displayName: 'OpenAI', isEnabled: true, isDefault: true, sortOrder: 1, description: '', capabilities: null },
      ]);
      (prisma.aPIKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

      const result = await getSettingsStatus();

      expect(result.smartUploadEnabled).toBe(true);
      expect(result.settings).toEqual({ enabled: 'true' });
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].hasValidApiKey).toBe(true);
    });
  });
});
