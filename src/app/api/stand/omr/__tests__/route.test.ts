import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

// Mock dependencies
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    userPreferences: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    musicFile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    musicPiece: {
      update: vi.fn(),
    },
    $extends: vi.fn(),
    $disconnect: vi.fn(),
    $connect: vi.fn(),
    $on: vi.fn(),
  },
}));

// Mock fetch for AI provider calls
global.fetch = vi.fn();

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
const mockAuth = auth as unknown as { api: { getSession: ReturnType<typeof vi.fn> } };
const mockPrisma = prisma as any;

describe('OMR API Route', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  };

  const mockUserPrefs = {
    userId: 'user-123',
    otherSettings: {
      omrApiKey: 'test-api-key',
      omrProvider: 'openai',
    },
  };

  const mockMusicFile = {
    id: 'file-123',
    fileKey: 'music/sheet.pdf',
    extractedMetadata: null,
    musicPieceId: 'piece-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/stand/omr', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr?musicFileId=file-123'),
        { method: 'GET' }
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 400 when musicFileId is missing', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);

      const request = new NextRequest(new URL('http://localhost:3000/api/stand/omr'), {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it('should return 404 when music file not found', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.musicFile.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr?musicFileId=file-123'),
        { method: 'GET' }
      );

      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it('should return processed: false when no metadata exists', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.musicFile.findUnique.mockResolvedValue({
        ...mockMusicFile,
        extractedMetadata: null,
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr?musicFileId=file-123'),
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.processed).toBe(false);
    });

    it('should return metadata when already processed', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.musicFile.findUnique.mockResolvedValue({
        ...mockMusicFile,
        extractedMetadata: JSON.stringify({
          tempo: 120,
          keySignature: 'C major',
          processedAt: '2024-01-01T00:00:00.000Z',
          provider: 'openai',
        }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr?musicFileId=file-123'),
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.processed).toBe(true);
      expect(data.metadata.tempo).toBe(120);
    });
  });

  describe('POST /api/stand/omr', () => {
    it('should return 403 when API key not configured', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId: 'user-123',
        otherSettings: {}, // No API key
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr'),
        { method: 'POST', body: JSON.stringify({ musicFileId: 'file-123' }) }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('API_KEY_REQUIRED');
    });

    it('should return cached metadata when already processed', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.userPreferences.findUnique.mockResolvedValue(mockUserPrefs);
      mockPrisma.musicFile.findUnique.mockResolvedValue({
        ...mockMusicFile,
        extractedMetadata: JSON.stringify({
          tempo: 120,
          keySignature: 'C major',
          processedAt: '2024-01-01T00:00:00.000Z',
          provider: 'openai',
        }),
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr'),
        { method: 'POST', body: JSON.stringify({ musicFileId: 'file-123' }) }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(true);
      expect(data.metadata.tempo).toBe(120);
    });

    it('should process OMR when forceReprocess is true', async () => {
      mockAuth.api.getSession.mockResolvedValue(mockSession);
      mockPrisma.userPreferences.findUnique.mockResolvedValue(mockUserPrefs);
      mockPrisma.musicFile.findUnique.mockResolvedValue(mockMusicFile);
      mockPrisma.musicFile.update.mockResolvedValue({});
      mockPrisma.musicPiece.update.mockResolvedValue({});

      // Mock fetch for both file retrieval and OpenAI API.
      // Return a simple PNG image (to avoid pdfjs-dist conversion)
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo, opts?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/api/files/')) {
          // Return a simple PNG image buffer instead of PDF to skip conversion
          const pngBuffer = Buffer.from([137, 80, 78, 71]); // PNG magic: ‰PNG
          return {
            ok: true,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => pngBuffer.buffer,
          } as unknown as Response;
        }
        // Otherwise assume OpenAI analysis request
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    tempo: 140,
                    keySignature: 'G major',
                    timeSignature: '4/4',
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/stand/omr'),
        {
          method: 'POST',
          body: JSON.stringify({ musicFileId: 'file-123', forceReprocess: true }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(false);
      expect(data.metadata.tempo).toBe(140);
    });
  });
});
