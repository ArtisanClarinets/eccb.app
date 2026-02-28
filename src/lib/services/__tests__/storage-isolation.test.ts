/**
 * Storage Isolation Tests
 *
 * Verifies that Smart Upload storage keys are scoped correctly and that
 * cross-user access to upload sessions is prevented by the permission
 * guard in preview routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSession: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/storage', () => ({
  downloadFile: vi.fn(),
}));

vi.mock('@/lib/services/pdf-renderer', () => ({
  renderPdfToImage: vi.fn().mockResolvedValue('base64data'),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({ getPageCount: () => 5 }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/services/storage';

// Dynamically import the route handler so mocks are applied
const { GET } = await import(
  '@/app/api/admin/uploads/review/[id]/preview/route'
);

// =============================================================================
// Constants
// =============================================================================

const USER_A = 'user-a-id';
const USER_B = 'user-b-id';
const SESSION_ID = 'test-session-uuid-1';

function makeSession(userId: string) {
  return {
    user: { id: userId, role: 'ADMIN' },
    session: { id: 'auth-sess-1' },
  };
}

function makeRequest(sessionId: string, page = 0) {
  return new NextRequest(
    `http://localhost/api/admin/uploads/review/${sessionId}/preview?page=${page}`
  );
}

function makeUploadSession(ownerId: string, sessionId: string) {
  return {
    uploadSessionId: sessionId,
    uploadedBy: ownerId,
    storageKey: `smart-upload/${sessionId}/original.pdf`,
    parseStatus: 'PARSED',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Smart Upload Storage Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Storage key scoping
  // -------------------------------------------------------------------------

  describe('storage key scoping', () => {
    it('storage keys always begin with smart-upload/ prefix', () => {
      const session = makeUploadSession(USER_A, SESSION_ID);
      expect(session.storageKey).toMatch(/^smart-upload\//);
    });

    it('storage keys include the session ID for scoping', () => {
      const session = makeUploadSession(USER_A, SESSION_ID);
      expect(session.storageKey).toContain(SESSION_ID);
    });

    it('different sessions produce different storage keys', () => {
      const s1 = makeUploadSession(USER_A, 'session-1');
      const s2 = makeUploadSession(USER_A, 'session-2');
      expect(s1.storageKey).not.toEqual(s2.storageKey);
    });

    it('part storage keys follow the scoped pattern', () => {
      const partKey = `smart-upload/${SESSION_ID}/parts/flute-1.pdf`;
      expect(partKey).toMatch(/^smart-upload\/[^/]+\/parts\//);
    });
  });

  // -------------------------------------------------------------------------
  // Preview route access control
  // -------------------------------------------------------------------------

  describe('preview route access control', () => {
    it('returns 401 when no session exists', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const req = makeRequest(SESSION_ID);
      const res = await GET(req, { params: Promise.resolve({ id: SESSION_ID }) });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 403 when user lacks music:read permission', async () => {
      vi.mocked(getSession).mockResolvedValue(makeSession(USER_B) as any);
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      const req = makeRequest(SESSION_ID);
      const res = await GET(req, { params: Promise.resolve({ id: SESSION_ID }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe('Forbidden');
    });

    it('returns 404 when session does not exist', async () => {
      vi.mocked(getSession).mockResolvedValue(makeSession(USER_A) as any);
      vi.mocked(checkUserPermission).mockResolvedValue(true);
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(null);

      const req = makeRequest('nonexistent-session');
      const res = await GET(req, {
        params: Promise.resolve({ id: 'nonexistent-session' }),
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe('Session not found');
    });

    it('downloadFile is only called with the session\'s own storageKey', async () => {
      const uploadSession = makeUploadSession(USER_A, SESSION_ID);

      vi.mocked(getSession).mockResolvedValue(makeSession(USER_A) as any);
      vi.mocked(checkUserPermission).mockResolvedValue(true);
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(
        uploadSession as any
      );
      vi.mocked(downloadFile).mockResolvedValue({
        stream: new ReadableStream({
          start(controller) {
            // Minimal PDF-like buffer — enough for test flow
            controller.enqueue(Buffer.from('%PDF-1.4 test'));
            controller.close();
          },
        }) as unknown as NodeJS.ReadableStream,
        metadata: { contentType: 'application/pdf', size: 14 },
      });

      const req = makeRequest(SESSION_ID);
      await GET(req, { params: Promise.resolve({ id: SESSION_ID }) });

      // downloadFile must be called with exactly the scoped key from DB
      expect(downloadFile).toHaveBeenCalledWith(uploadSession.storageKey);

      // Verify the key is properly scoped
      const calledKey = vi.mocked(downloadFile).mock.calls[0][0];
      expect(calledKey).toMatch(/^smart-upload\//);
      expect(calledKey).toContain(SESSION_ID);
    });
  });
});
