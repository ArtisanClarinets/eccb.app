/**
 * Smart Upload Settings API Route Tests
 *
 * Tests for the admin smart-upload-settings API endpoints.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';
import { GET as PROVIDERS_GET, PUT as PROVIDERS_PUT } from '../providers/route';
import { POST as API_KEY_POST } from '../providers/[providerId]/api-key/route';
import { POST as VALIDATE_KEY_POST } from '../providers/[providerId]/validate-key/route';

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
    },
    aPIKey: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    aIModel: {
      findMany: vi.fn(),
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

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/services/smart-upload-settings', () => ({
  getSettingsStatus: vi.fn().mockResolvedValue({
    smartUploadEnabled: true,
    settings: {},
    providers: [],
  }),
  setSetting: vi.fn().mockResolvedValue(undefined),
  setSmartUploadEnabled: vi.fn().mockResolvedValue(undefined),
  getProviders: vi.fn().mockResolvedValue([]),
  enableProvider: vi.fn().mockResolvedValue(undefined),
  setDefaultProvider: vi.fn().mockResolvedValue(undefined),
  saveApiKey: vi.fn().mockResolvedValue(undefined),
  validateApiKey: vi.fn().mockResolvedValue({ valid: true }),
  hasValidApiKey: vi.fn().mockResolvedValue(false),
  getProvider: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getSettingsStatus,
  setSetting,
  setSmartUploadEnabled,
  getProviders,
  saveApiKey,
  validateApiKey,
} from '@/lib/services/smart-upload-settings';
import { prisma } from '@/lib/db';

describe('Smart Upload Settings API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'admin@test.com',
  };

  const mockSession = {
    user: mockUser,
    session: { id: 'session-123' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    
    // Reset default mock implementations
    (getSettingsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartUploadEnabled: true,
      settings: {},
      providers: [],
    });
    (setSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (setSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('GET /api/admin/smart-upload-settings', () => {
    it('should return 401 if not authenticated', async () => {
      (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 if user lacks permission', async () => {
      (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should return settings when authenticated', async () => {
      (getSettingsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        smartUploadEnabled: true,
        settings: { enabled: 'true' },
        providers: [
          {
            id: 'p1',
            displayName: 'OpenAI',
            description: 'OpenAI Provider',
            isEnabled: true,
            isDefault: true,
            sortOrder: 1,
            hasValidApiKey: true,
            capabilities: { vision: true, structuredOutput: true },
            defaultModel: 'gpt-4',
          },
        ],
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.smartUploadEnabled).toBe(true);
      expect(data.providers).toHaveLength(1);
    });

    it('should not expose API keys in response', async () => {
      (getSettingsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        smartUploadEnabled: true,
        settings: {},
        providers: [],
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings');
      const response = await GET(request);
      const data = await response.json();

      // Verify no sensitive data is returned
      expect(JSON.stringify(data)).not.toContain('encryptedKey');
      expect(JSON.stringify(data)).not.toContain('sk-');
    });
  });

  describe('PUT /api/admin/smart-upload-settings', () => {
    it('should return 401 if not authenticated', async () => {
      (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 if user lacks edit permission', async () => {
      (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(403);
    });

    it('should update enabled status', async () => {
      (setSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (getSettingsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        smartUploadEnabled: true,
        settings: {},
        providers: [],
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(setSmartUploadEnabled).toHaveBeenCalledWith(true, 'user-123');
    });

    it('should update individual settings', async () => {
      (setSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (getSettingsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        smartUploadEnabled: true,
        settings: { testKey: 'testValue' },
        providers: [],
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { testKey: 'testValue' } }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(setSetting).toHaveBeenCalledWith('testKey', 'testValue', 'user-123');
    });

    it('should return 400 for invalid request body', async () => {
      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'not-a-boolean' }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/admin/smart-upload-settings/providers', () => {
    it('should return providers list', async () => {
      (getProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'p1', providerId: 'openai', displayName: 'OpenAI', isEnabled: true },
      ]);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers');
      const response = await PROVIDERS_GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.providers).toHaveLength(1);
    });

    it('should require authentication', async () => {
      (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers');
      const response = await PROVIDERS_GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/admin/smart-upload-settings/providers/:providerId/api-key', () => {
    it('should save and validate API key', async () => {
      (validateApiKey as ReturnType<typeof vi.fn>).mockResolvedValue({ valid: true });
      (saveApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (prisma.aPIKey.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p1',
        providerId: 'openai',
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers/p1/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-test-key' }),
      });
      const response = await API_KEY_POST(request, { params: Promise.resolve({ providerId: 'p1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(saveApiKey).toHaveBeenCalledWith('p1', 'sk-test-key', 'user-123');
    });

    it('should reject invalid API key', async () => {
      (validateApiKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: false,
        error: 'Invalid API key',
      });
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p1',
        providerId: 'openai',
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers/p1/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'invalid-key' }),
      });
      const response = await API_KEY_POST(request, { params: Promise.resolve({ providerId: 'p1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid API key');
    });

    it('should require admin permission for saving key', async () => {
      (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers/p1/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-test' }),
      });
      const response = await API_KEY_POST(request, { params: Promise.resolve({ providerId: 'p1' }) });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/admin/smart-upload-settings/providers/:providerId/validate-key', () => {
    it('should validate API key without saving', async () => {
      (validateApiKey as ReturnType<typeof vi.fn>).mockResolvedValue({ valid: true });
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p1',
        providerId: 'openai',
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers/p1/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-test-key' }),
      });
      const response = await VALIDATE_KEY_POST(request, { params: Promise.resolve({ providerId: 'p1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
      // Should validate but not save
      expect(validateApiKey).toHaveBeenCalledWith('p1', 'sk-test-key');
    });

    it('should return validation error for invalid key', async () => {
      (validateApiKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: false,
        error: 'Rate limit exceeded',
      });
      (prisma.aIProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p1',
        providerId: 'openai',
      });

      const request = new NextRequest('http://localhost/api/admin/smart-upload-settings/providers/p1/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'invalid-key' }),
      });
      const response = await VALIDATE_KEY_POST(request, { params: Promise.resolve({ providerId: 'p1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toBe('Rate limit exceeded');
    });
  });
});
