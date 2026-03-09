import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.hoisted(() => vi.fn());
const mockRequirePermission = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockDownloadFile = vi.hoisted(() => vi.fn());
const mockRender = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/guards', () => ({
  getSession: mockGetSession,
}));
vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: mockRequirePermission,
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSession: {
      findUnique: mockFindUnique,
    },
  },
}));
vi.mock('@/lib/services/storage', () => ({
  downloadFile: mockDownloadFile,
}));
vi.mock('@/lib/services/pdf-renderer', () => ({
  renderPdfPageToImageWithInfo: mockRender,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from '../route';

const SESSION_ID = 'session-1';
const TEST_USER = { user: { id: 'admin' } };

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/api/admin/uploads/review/${SESSION_ID}/part-preview${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(TEST_USER);
  mockRequirePermission.mockResolvedValue(true);
  mockFindUnique.mockResolvedValue({
    uploadSessionId: SESSION_ID,
    parsedParts: [{ storageKey: 'part-key' }],
  });
  mockDownloadFile.mockResolvedValue('http://download/url');

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
});

describe('Part-preview route', () => {
  it('returns 400 when page index out of range', async () => {
    mockRender.mockRejectedValue(new Error('Page index 99 out of range'));
    const response = await GET(makeRequest('?partStorageKey=part-key&page=99'), { params: Promise.resolve({ id: SESSION_ID }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('Page out of range');
  });

  it('returns image when successful', async () => {
    mockRender.mockResolvedValue({ imageBase64: 'img', totalPages: 5, mimeType: 'image/png' });
    const response = await GET(makeRequest('?partStorageKey=part-key&page=2'), { params: Promise.resolve({ id: SESSION_ID }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.imageBase64).toBe('img');
  });
});
