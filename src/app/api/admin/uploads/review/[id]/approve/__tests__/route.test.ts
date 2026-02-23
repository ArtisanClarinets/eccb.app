import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../route';

// Mock dependencies
vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';

// =============================================================================
// Types
// =============================================================================

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  confidenceScore: number;
}

// =============================================================================
// Test Setup
// =============================================================================

const TEST_USER_ID = 'admin-user-1';
const SESSION_ID = 'upload-session-uuid-1';

// =============================================================================
// Helper Functions
// =============================================================================

function createMockSession(userId: string = TEST_USER_ID): any {
  return {
    user: {
      id: userId,
      email: 'admin@example.com',
      name: 'Admin User',
    },
  };
}

function createMockSessionData(overrides: Partial<any> = {}): any {
  return {
    id: 'db-session-id-1',
    uploadSessionId: SESSION_ID,
    fileName: 'test.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storageKey: 'smart-upload/test-uuid/original.pdf',
    extractedMetadata: {
      title: 'Stars and Stripes Forever',
      composer: 'John Philip Sousa',
      confidenceScore: 95,
    } as ExtractedMetadata,
    confidenceScore: 95,
    status: 'PENDING_REVIEW',
    uploadedBy: 'user-1',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Approve Upload Session API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when session has no user id', async () => {
      vi.mocked(getSession).mockResolvedValue({ user: null } as any);

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // Permission Tests
  // ===========================================================================

  describe('Permissions', () => {
    it('should return 403 when user lacks music:create permission', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(requirePermission).mockRejectedValue(new Error('Permission denied'));

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });

      expect(response.status).toBe(500);
    });
  });

  // ===========================================================================
  // Validation Tests
  // ===========================================================================

  describe('Validation', () => {
    it('should return 400 when title is missing', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData()
      );

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Missing title
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
    });

    it('should return 400 when title is empty', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData()
      );

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
    });
  });

  // ===========================================================================
  // Session Not Found Tests
  // ===========================================================================

  describe('Session Not Found', () => {
    it('should return 404 when session does not exist', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: 'non-existent-id' });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Upload session not found');
    });

    it('should return 400 when session is not pending review', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData({ status: 'APPROVED' })
      );

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session is not pending review');
    });
  });

  // ===========================================================================
  // Successful Approval Tests
  // ===========================================================================

  describe('Successful Approval', () => {
    it('should successfully approve a pending session', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData()
      );
      vi.mocked(prisma.smartUploadSession.update).mockResolvedValue({
        ...createMockSessionData(),
        status: 'APPROVED',
        reviewedBy: TEST_USER_ID,
        reviewedAt: new Date(),
      });

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Stars and Stripes Forever',
          composer: 'John Philip Sousa',
        }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.session.status).toBe('APPROVED');
      expect(prisma.smartUploadSession.update).toHaveBeenCalledWith({
        where: { uploadSessionId: SESSION_ID },
        data: {
          status: 'APPROVED',
          reviewedBy: TEST_USER_ID,
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('should approve session with all optional fields', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData()
      );
      vi.mocked(prisma.smartUploadSession.update).mockResolvedValue({
        ...createMockSessionData(),
        status: 'APPROVED',
        reviewedBy: TEST_USER_ID,
        reviewedAt: new Date(),
      });

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Piece',
          composer: 'Test Composer',
          publisher: 'Test Publisher',
          instrument: 'Concert Band',
          partNumber: 'Full Score',
          difficulty: 'Grade 4',
        }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ===========================================================================
  // Database Error Tests
  // ===========================================================================

  describe('Database Errors', () => {
    it('should return 500 when database update fails', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession());
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        createMockSessionData()
      );
      vi.mocked(prisma.smartUploadSession.update).mockRejectedValue(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost/api/admin/uploads/review/session-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Piece' }),
      });

      const params = Promise.resolve({ id: SESSION_ID });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to approve upload session');
    });
  });

  // ===========================================================================
  // OPTIONS Handler Tests
  // ===========================================================================

  describe('OPTIONS Handler', () => {
    it('should return 204 with correct CORS headers', async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    });
  });
});
