import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { POST as UPLOAD_POST } from '../upload/route';
import { GET as ASSET_GET, DELETE as ASSET_DELETE, PATCH as ASSET_PATCH } from '../[id]/route';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { uploadFile, downloadFile, deleteFile } from '@/lib/services/storage';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    mediaAsset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/services/storage', () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  fileExists: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { validateCSRF } from '@/lib/csrf';

describe('Assets API', () => {
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
    (getSession as any).mockResolvedValue(mockSession);
    (checkUserPermission as any).mockResolvedValue(true);
    (validateCSRF as any).mockImplementation(() => ({ valid: true }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/assets', () => {
    it('should return 401 if not authenticated', async () => {
      (getSession as any).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/assets');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 if user lacks permission', async () => {
      (checkUserPermission as any).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/assets');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should return paginated assets', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          fileName: 'image.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
          storageKey: 'assets/asset-1.jpg',
          title: 'Test Image',
          altText: 'Alt text',
          caption: 'Caption',
          tags: ['tag1'],
          width: 800,
          height: 600,
          uploadedAt: new Date(),
          uploadedBy: 'user-123',
        },
      ];

      (prisma.mediaAsset.findMany as any).mockResolvedValue(mockAssets);
      (prisma.mediaAsset.count as any).mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/assets');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assets).toHaveLength(1);
      expect(data.assets[0].fileName).toBe('image.jpg');
      expect(data.pagination.total).toBe(1);
    });

    it('should filter by mime type', async () => {
      (prisma.mediaAsset.findMany as any).mockResolvedValue([]);
      (prisma.mediaAsset.count as any).mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/assets?mimeType=image');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mimeType: { startsWith: 'image/' },
          }),
        })
      );
    });

    it('should search by filename and title', async () => {
      (prisma.mediaAsset.findMany as any).mockResolvedValue([]);
      (prisma.mediaAsset.count as any).mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/assets?search=test');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { fileName: { contains: 'test', mode: 'insensitive' } },
              { title: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('POST /api/assets/upload', () => {
    const createMockFormData = (file: File, additionalFields: Record<string, string> = {}) => {
      const formData = new FormData();
      formData.append('file', file);
      Object.entries(additionalFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      return formData;
    };

    it('should return 401 if not authenticated', async () => {
      (getSession as any).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/assets/upload', {
        method: 'POST',
      });
      const response = await UPLOAD_POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 if user lacks CMS_EDIT permission', async () => {
      (checkUserPermission as any).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/assets/upload', {
        method: 'POST',
      });
      const response = await UPLOAD_POST(request);

      expect(response.status).toBe(403);
    });

    it('should return 400 if no file provided', async () => {
      const formData = new FormData();
      const request = new NextRequest('http://localhost/api/assets/upload', {
        method: 'POST',
        body: formData,
      });
      const response = await UPLOAD_POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should return 400 for invalid file type', async () => {
      const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      const formData = createMockFormData(file);

      const request = new NextRequest('http://localhost/api/assets/upload', {
        method: 'POST',
        body: formData,
      });
      const response = await UPLOAD_POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid file type');
    });

    it('should upload image successfully', async () => {
      const fileContent = new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, // JPEG header
        ...Array(100).fill(0),
      ]);
      const file = new File([fileContent], 'test.jpg', { type: 'image/jpeg' });
      const formData = createMockFormData(file, {
        title: 'Test Image',
        altText: 'Alt text for image',
      });

      (uploadFile as any).mockResolvedValue('assets/test-uuid.jpg');
      (prisma.mediaAsset.create as any).mockResolvedValue({
        id: 'asset-123',
        fileName: 'test.jpg',
        fileSize: 104,
        mimeType: 'image/jpeg',
        storageKey: 'assets/test-uuid.jpg',
        title: 'Test Image',
        altText: 'Alt text for image',
        caption: null,
        tags: null,
        width: null,
        height: null,
        uploadedAt: new Date(),
        uploadedBy: 'user-123',
      });

      const request = new NextRequest('http://localhost/api/assets/upload', {
        method: 'POST',
        body: formData,
      });
      const response = await UPLOAD_POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.asset.fileName).toBe('test.jpg');
      expect(uploadFile).toHaveBeenCalled();
    });
  });

  describe('GET /api/assets/[id]', () => {
    it('should return 404 if asset not found', async () => {
      (prisma.mediaAsset.findUnique as any).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/assets/asset-123');
      const response = await ASSET_GET(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });

      expect(response.status).toBe(404);
    });

    it('should return asset file', async () => {
      const mockAsset = {
        id: 'asset-123',
        fileName: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        storageKey: 'assets/asset-123.jpg',
      };

      (prisma.mediaAsset.findUnique as any).mockResolvedValue(mockAsset);
      // Return a string (S3 presigned URL) to test the redirect path
      (downloadFile as any).mockResolvedValue('https://s3.example.com/presigned-url');

      const request = new NextRequest('http://localhost/api/assets/asset-123');
      const response = await ASSET_GET(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });

      // Should redirect to S3 URL (307 Temporary Redirect)
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://s3.example.com/presigned-url');
    });
  });

  describe('DELETE /api/assets/[id]', () => {
    it('should return 401 if not authenticated', async () => {
      (getSession as any).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/assets/asset-123', {
        method: 'DELETE',
      });
      const response = await ASSET_DELETE(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 if asset not found', async () => {
      (prisma.mediaAsset.findUnique as any).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/assets/asset-123', {
        method: 'DELETE',
      });
      const response = await ASSET_DELETE(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });

      expect(response.status).toBe(404);
    });

    it('should delete asset successfully', async () => {
      const mockAsset = {
        id: 'asset-123',
        fileName: 'test.jpg',
        storageKey: 'assets/asset-123.jpg',
      };

      (prisma.mediaAsset.findUnique as any).mockResolvedValue(mockAsset);
      (deleteFile as any).mockResolvedValue(undefined);
      (prisma.mediaAsset.delete as any).mockResolvedValue(mockAsset);

      const request = new NextRequest('http://localhost/api/assets/asset-123', {
        method: 'DELETE',
      });
      const response = await ASSET_DELETE(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(deleteFile).toHaveBeenCalledWith('assets/asset-123.jpg');
      expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
      });
    });
  });

  describe('PATCH /api/assets/[id]', () => {
    it('should update asset metadata', async () => {
      const mockAsset = {
        id: 'asset-123',
        fileName: 'test.jpg',
        title: 'Old Title',
        altText: 'Old Alt',
        caption: 'Old Caption',
        tags: [],
      };

      (prisma.mediaAsset.findUnique as any).mockResolvedValue(mockAsset);
      (prisma.mediaAsset.update as any).mockResolvedValue({
        ...mockAsset,
        title: 'New Title',
        altText: 'New Alt',
        caption: 'New Caption',
      });

      const request = new NextRequest('http://localhost/api/assets/asset-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Title',
          altText: 'New Alt',
          caption: 'New Caption',
        }),
      });
      const response = await ASSET_PATCH(request, {
        params: Promise.resolve({ id: 'asset-123' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.asset.title).toBe('New Title');
    });
  });
});
