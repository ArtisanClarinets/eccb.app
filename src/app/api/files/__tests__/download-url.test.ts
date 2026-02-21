import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../download-url/route';
import { GET as downloadGET } from '../download/[...key]/route';
import { generateSignedToken } from '@/lib/signed-url';

// Mock dependencies
vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
  getUserRoles: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    musicFile: {
      findFirst: vi.fn(),
    },
    fileDownload: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/storage', () => ({
  generateSecureDownloadUrl: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getSession } from '@/lib/auth/guards';
import { checkUserPermission, getUserRoles } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { prisma } from '@/lib/db';
import { generateSecureDownloadUrl, downloadFile } from '@/lib/services/storage';

// Helper to create a valid session mock
function createMockSession(userId: string = 'user-1') {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      image: null,
      twoFactorEnabled: false,
      banned: false,
      banReason: null,
      banExpires: null,
      role: null,
    },
    session: {
      id: 'session-1',
      userId: userId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
      token: 'test-token',
      ipAddress: null,
      userAgent: null,
    },
  } as any;
}

describe('Download URL API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCSRF).mockImplementation(() => ({ valid: true }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // POST /api/files/download-url Tests
  // ===========================================================================

  describe('POST /api/files/download-url', () => {
    it('should return 401 for unauthenticated requests', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for missing key', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should return 400 for invalid storage key', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '../../../etc/passwd' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid file path');
    });

    it('should generate URL for admin users', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(getUserRoles).mockResolvedValue(['ADMIN']);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        member: null,
      } as any);
      vi.mocked(generateSecureDownloadUrl).mockResolvedValue('/api/files/download/music/test.pdf?token=abc123');

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
      expect(generateSecureDownloadUrl).toHaveBeenCalledWith(
        'music/test.pdf',
        expect.objectContaining({ userId: 'user-1' })
      );
    });

    it('should generate URL for users with download.all permission', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(getUserRoles).mockResolvedValue(['MUSICIAN']);
      vi.mocked(checkUserPermission).mockResolvedValue(true);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        member: null,
      } as any);
      vi.mocked(generateSecureDownloadUrl).mockResolvedValue('/api/files/download/music/test.pdf?token=abc123');

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
    });

    it('should return 403 for users without permission', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(getUserRoles).mockResolvedValue(['MUSICIAN']);
      vi.mocked(checkUserPermission).mockResolvedValue(false);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        member: { id: 'member-1' },
      } as any);
      vi.mocked(prisma.musicFile.findFirst).mockResolvedValue({
        id: 'file-1',
        storageKey: 'music/test.pdf',
        isPublic: false,
        piece: { assignments: [] },
      } as any);

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied');
    });

    it('should generate URL for public files', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(getUserRoles).mockResolvedValue(['MUSICIAN']);
      vi.mocked(checkUserPermission).mockResolvedValue(false);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        member: { id: 'member-1' },
      } as any);
      vi.mocked(prisma.musicFile.findFirst).mockResolvedValue({
        id: 'file-1',
        storageKey: 'music/test.pdf',
        isPublic: true,
        piece: { assignments: [] },
      } as any);
      vi.mocked(generateSecureDownloadUrl).mockResolvedValue('/api/files/download/music/test.pdf?token=abc123');

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
    });

    it('should generate URL for assigned users', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(getUserRoles).mockResolvedValue(['MUSICIAN']);
      vi.mocked(checkUserPermission)
        .mockResolvedValueOnce(false) // download.all
        .mockResolvedValueOnce(true); // download.assigned
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        member: { id: 'member-1' },
      } as any);
      vi.mocked(prisma.musicFile.findFirst).mockResolvedValue({
        id: 'file-1',
        storageKey: 'music/test.pdf',
        isPublic: false,
        piece: { assignments: [{ memberId: 'member-1' }] },
      } as any);
      vi.mocked(generateSecureDownloadUrl).mockResolvedValue('/api/files/download/music/test.pdf?token=abc123');

      const request = new NextRequest('http://localhost/api/files/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'music/test.pdf' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /api/files/download/[...key] Tests
  // ===========================================================================

  describe('GET /api/files/download/[...key]', () => {
    it('should return 401 for missing token', async () => {
      const request = new NextRequest('http://localhost/api/files/download/music/test.pdf');
      const params = Promise.resolve({ key: ['music', 'test.pdf'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing download token');
    });

    it('should return 410 for invalid/malformed token', async () => {
      // Invalid tokens that can't be parsed are treated as expired (410)
      // because isTokenExpired() returns true for malformed tokens
      const request = new NextRequest('http://localhost/api/files/download/music/test.pdf?token=invalid');
      const params = Promise.resolve({ key: ['music', 'test.pdf'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.error).toBe('Download link has expired');
    });

    it('should return 403 for token key mismatch', async () => {
      const token = generateSignedToken('music/different.pdf');
      const request = new NextRequest(`http://localhost/api/files/download/music/test.pdf?token=${token}`);
      const params = Promise.resolve({ key: ['music', 'test.pdf'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Token does not match requested file');
    });

    it('should return 410 for expired token', async () => {
      // Create an expired token by manipulating time
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
      
      const token = generateSignedToken('music/test.pdf', { expiresIn: 3600 });
      
      // Advance time past expiration
      vi.advanceTimersByTime(3601 * 1000);
      
      const request = new NextRequest(`http://localhost/api/files/download/music/test.pdf?token=${token}`);
      const params = Promise.resolve({ key: ['music', 'test.pdf'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.error).toBe('Download link has expired');
      
      vi.useRealTimers();
    });

    it('should return 404 for valid token but file not found', async () => {
      const token = generateSignedToken('music/test.pdf');
      
      vi.mocked(prisma.musicFile.findFirst).mockResolvedValue(null);
      
      vi.mocked(downloadFile).mockRejectedValue(new Error('File not found'));

      const request = new NextRequest(`http://localhost/api/files/download/music/test.pdf?token=${token}`);
      const params = Promise.resolve({ key: ['music', 'test.pdf'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('File not found');
    });

    it('should return 400 for invalid storage key', async () => {
      const request = new NextRequest('http://localhost/api/files/download/../../../etc/passwd?token=abc');
      const params = Promise.resolve({ key: ['..', '..', '..', 'etc', 'passwd'] });

      const response = await downloadGET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid file path');
    });
  });
});
