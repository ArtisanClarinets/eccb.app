/**
 * Smart Upload API Route Tests
 *
 * Tests for the smart-upload API routes, specifically the feature toggle integration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadBatch: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'batch-123',
        status: 'CREATED',
        userId: 'user-123',
      }),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/smart-upload/smart-upload.service', () => ({
  createBatch: vi.fn().mockResolvedValue({
    id: 'batch-123',
    status: 'CREATED',
  }),
  listUserBatches: vi.fn().mockResolvedValue([]),
  getBatch: vi.fn(),
}));

vi.mock('@/lib/services/smart-upload-settings', () => ({
  isSmartUploadEnabled: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getSession, isAdmin } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import { isSmartUploadEnabled } from '@/lib/services/smart-upload-settings';
import { prisma } from '@/lib/db';
import { MUSIC_SMART_UPLOAD } from '@/lib/auth/permission-constants';

describe('Smart Upload API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'user@test.com',
  };

  const mockSession = {
    user: mockUser,
    session: { id: 'session-123' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (validateCSRF as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (applyRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (isAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  describe('POST /api/music/smart-upload', () => {
    it('should return 403 when feature is disabled', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('FEATURE_DISABLED');
      expect(data.error).toBe('Feature not available');
    });

    it('should create batch when feature is enabled', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (prisma.smartUploadBatch.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'batch-123',
        status: 'CREATED',
        userId: 'user-123',
      });

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.batchId).toBe('batch-123');
    });

    it('should return 401 when not authenticated', async () => {
      (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 when user lacks permission', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (checkUserPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('permission');
    });

    it('should enforce rate limiting', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (prisma.smartUploadBatch.count as ReturnType<typeof vi.fn>).mockResolvedValue(10); // At limit

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Rate limit');
    });

    it('should reject invalid CSRF', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (validateCSRF as ReturnType<typeof vi.fn>).mockReturnValue({ valid: false, reason: 'invalid token' });

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/music/smart-upload', () => {
    it('should return 403 when feature is disabled', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/music/smart-upload');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('FEATURE_DISABLED');
    });

    it('should return batches when feature is enabled', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (prisma.smartUploadBatch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'batch-1', status: 'COMPLETE', createdAt: new Date() },
      ]);
      (prisma.smartUploadBatch.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/music/smart-upload');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.batches).toHaveLength(1);
    });

    it('should return 401 when not authenticated', async () => {
      (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/music/smart-upload');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should filter batches by status', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (prisma.smartUploadBatch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.smartUploadBatch.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/music/smart-upload?status=COMPLETE');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.smartUploadBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'COMPLETE',
          }),
        })
      );
    });

    it('should allow admin to see all batches', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (isAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (prisma.smartUploadBatch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.smartUploadBatch.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/music/smart-upload');
      const response = await GET(request);

      expect(response.status).toBe(200);
      // Admin should see all batches (empty where clause)
      expect(prisma.smartUploadBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );
    });
  });

  describe('Feature Toggle Integration', () => {
    it('should check database for feature enabled status', async () => {
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await POST(request);

      expect(isSmartUploadEnabled).toHaveBeenCalled();
    });

    it('should prioritize database setting over environment variable', async () => {
      // When isSmartUploadEnabled returns a value, it should be used
      // regardless of env.SMART_UPLOAD_ENABLED
      (isSmartUploadEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/music/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });
  });
});
