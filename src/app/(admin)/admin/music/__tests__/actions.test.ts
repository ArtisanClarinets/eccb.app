import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  uploadMusicFile,
  updateMusicFile,
  getFileVersionHistory,
  archiveMusicFile,
  exportMusicToCSV,
} from '../actions';
import * as authGuards from '@/lib/auth/guards';
import * as storage from '@/lib/services/storage';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    musicPiece: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    musicFile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    musicFileVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    musicPart: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/services/storage', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Music File Actions', () => {
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com' },
    session: { id: 'session-1' },
  } as any;

  const mockPiece = {
    id: 'piece-1',
    title: 'Test Piece',
    composerId: null,
    arrangerId: null,
    publisherId: null,
    difficulty: null,
    duration: null,
    genre: null,
    style: null,
    catalogNumber: null,
    notes: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockFile = {
    id: 'file-1',
    pieceId: 'piece-1',
    fileName: 'test.pdf',
    fileType: 'PART',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storageKey: 'music/piece-1/test.pdf',
    storageUrl: null,
    version: 1,
    description: null,
    isPublic: false,
    isArchived: false,
    uploadedAt: new Date(),
    uploadedBy: 'user-1',
    versions: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authGuards.requirePermission).mockResolvedValue(mockSession);
    vi.mocked(authGuards.getSession).mockResolvedValue(mockSession);
    vi.mocked(storage.uploadFile).mockResolvedValue(undefined as any);
    vi.mocked(storage.deleteFile).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('uploadMusicFile', () => {
    it('should upload a new file successfully', async () => {
      const mockFormData = new FormData();
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      mockFormData.append('file', mockFile);
      mockFormData.append('fileType', 'PART');
      mockFormData.append('description', 'Test file');

      vi.mocked(prisma.musicFile).create.mockResolvedValue({
        id: 'file-1',
        pieceId: 'piece-1',
        fileName: 'test.pdf',
        fileType: 'PART',
        fileSize: 12,
        mimeType: 'application/pdf',
        storageKey: expect.any(String),
        storageUrl: null,
        version: 1,
        description: 'Test file',
        isPublic: false,
        isArchived: false,
        uploadedAt: expect.any(Date),
        uploadedBy: 'user-1',
      } as any);

      const result = await uploadMusicFile('piece-1', mockFormData);

      expect(result.success).toBe(true);
      expect(result.fileId).toBe('file-1');
      expect(storage.uploadFile).toHaveBeenCalled();
      expect(prisma.musicFile.create).toHaveBeenCalled();
    });

    it('should create a new version when existingFileId is provided', async () => {
      const mockFormData = new FormData();
      const mockFileObj = new File(['updated content'], 'test-v2.pdf', { type: 'application/pdf' });
      mockFormData.append('file', mockFileObj);
      mockFormData.append('existingFileId', 'file-1');
      mockFormData.append('changeNote', 'Updated version');

      vi.mocked(prisma.musicFile).findUnique.mockResolvedValue({
        ...mockFile,
        versions: [],
      } as any);

      vi.mocked(prisma.musicFileVersion).create.mockResolvedValue({
        id: 'version-1',
        fileId: 'file-1',
        version: 1,
        fileName: 'test.pdf',
        storageKey: 'music/piece-1/test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        changeNote: null,
        uploadedAt: new Date(),
        uploadedBy: 'user-1',
      } as any);

      vi.mocked(prisma.musicFile).update.mockResolvedValue({
        ...mockFile,
        version: 2,
        fileName: 'test-v2.pdf',
      } as any);

      const result = await uploadMusicFile('piece-1', mockFormData);

      expect(result.success).toBe(true);
      expect(result.version).toBe(2);
      expect(prisma.musicFileVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fileId: 'file-1',
          version: 1,
        }),
      });
    });

    it('should return error when no file is provided', async () => {
      const mockFormData = new FormData();

      const result = await uploadMusicFile('piece-1', mockFormData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No file provided');
    });

    it('should create part when instrumentId and partType are provided', async () => {
      const mockFormData = new FormData();
      const mockFileObj = new File(['test content'], 'flute.pdf', { type: 'application/pdf' });
      mockFormData.append('file', mockFileObj);
      mockFormData.append('fileType', 'PART');
      mockFormData.append('instrumentId', 'instrument-1');
      mockFormData.append('partType', 'Flute 1');

      vi.mocked(prisma.musicFile).create.mockResolvedValue({
        id: 'file-1',
        pieceId: 'piece-1',
        fileName: 'flute.pdf',
        fileType: 'PART',
        fileSize: 12,
        mimeType: 'application/pdf',
        storageKey: expect.any(String),
        storageUrl: null,
        version: 1,
        description: null,
        isPublic: false,
        isArchived: false,
        uploadedAt: expect.any(Date),
        uploadedBy: 'user-1',
      } as any);

      vi.mocked(prisma.musicPart).create.mockResolvedValue({
        id: 'part-1',
        pieceId: 'piece-1',
        instrumentId: 'instrument-1',
        partName: 'Flute 1',
        fileId: 'file-1',
        isOptional: false,
        notes: null,
      } as any);

      const result = await uploadMusicFile('piece-1', mockFormData);

      expect(result.success).toBe(true);
      expect(prisma.musicPart.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pieceId: 'piece-1',
          instrumentId: 'instrument-1',
          partName: 'Flute 1',
          fileId: 'file-1',
        }),
      });
    });
  });

  describe('updateMusicFile', () => {
    it('should update file metadata', async () => {
      vi.mocked(prisma.musicFile).findUnique.mockResolvedValue(mockFile as any);
      vi.mocked(prisma.musicFile).update.mockResolvedValue({
        ...mockFile,
        description: 'Updated description',
        fileType: 'FULL_SCORE',
        isPublic: true,
      } as any);

      const result = await updateMusicFile('file-1', {
        description: 'Updated description',
        fileType: 'FULL_SCORE',
        isPublic: true,
      });

      expect(result.success).toBe(true);
      expect(prisma.musicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: {
          description: 'Updated description',
          fileType: 'FULL_SCORE',
          isPublic: true,
        },
      });
    });

    it('should return error when file not found', async () => {
      vi.mocked(prisma.musicFile).findUnique.mockResolvedValue(null);

      const result = await updateMusicFile('non-existent', {
        description: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });
  });

  describe('getFileVersionHistory', () => {
    it('should return version history for a file', async () => {
      const mockVersions = [
        {
          id: 'version-1',
          fileId: 'file-1',
          version: 1,
          fileName: 'test.pdf',
          storageKey: 'music/piece-1/test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          changeNote: 'Initial version',
          uploadedAt: new Date(),
          uploadedBy: 'user-1',
        },
      ];

      vi.mocked(prisma.musicFileVersion).findMany.mockResolvedValue(mockVersions as any);

      const result = await getFileVersionHistory('file-1');

      expect(result.success).toBe(true);
      expect(result.versions).toHaveLength(1);
      expect(result.versions?.[0].version).toBe(1);
    });
  });

  describe('archiveMusicFile', () => {
    it('should archive a file (soft delete)', async () => {
      vi.mocked(prisma.musicFile).findUnique.mockResolvedValue(mockFile as any);
      vi.mocked(prisma.musicFile).update.mockResolvedValue({
        ...mockFile,
        isArchived: true,
      } as any);

      const result = await archiveMusicFile('file-1');

      expect(result.success).toBe(true);
      expect(prisma.musicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { isArchived: true },
      });
    });

    it('should return error when file not found', async () => {
      vi.mocked(prisma.musicFile).findUnique.mockResolvedValue(null);

      const result = await archiveMusicFile('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });
  });
});

describe('Music Export Functionality', () => {
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com' },
    session: { id: 'session-1' },
  } as any;

  const mockPieces = [
    {
      id: 'piece-1',
      title: 'Test Piece 1',
      subtitle: 'A subtitle',
      composer: { id: 'composer-1', fullName: 'John Composer' },
      arranger: { id: 'arranger-1', fullName: 'Jane Arranger' },
      publisher: { id: 'pub-1', name: 'Test Publisher' },
      genre: 'Classical',
      style: 'Symphony',
      difficulty: 'GRADE_3',
      duration: 300,
      catalogNumber: 'CAT-001',
      notes: 'Test notes',
      isArchived: false,
      createdAt: new Date('2024-01-01'),
      files: [],
      _count: { assignments: 5, eventMusic: 2 },
    },
    {
      id: 'piece-2',
      title: 'Test Piece 2',
      subtitle: null,
      composer: { id: 'composer-2', fullName: 'Bob Writer' },
      arranger: null,
      publisher: null,
      genre: 'Jazz',
      style: 'Big Band',
      difficulty: 'GRADE_4',
      duration: 240,
      catalogNumber: 'CAT-002',
      notes: null,
      isArchived: false,
      createdAt: new Date('2024-02-01'),
      files: [{ id: 'file-1' }],
      _count: { assignments: 3, eventMusic: 1 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authGuards.requirePermission).mockResolvedValue(mockSession);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('exportMusicToCSV', () => {
    it('should export music pieces to CSV with default filters', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue(mockPieces as any);

      const result = await exportMusicToCSV();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.filename).toMatch(/music-export-\d{4}-\d{2}-\d{2}\.csv/);
      expect(result.data).toContain('Title,Subtitle,Composer,Arranger,Publisher');
      expect(result.data).toContain('Test Piece 1');
      expect(result.data).toContain('Test Piece 2');
      expect(result.data).toContain('John Composer');
      expect(result.data).toContain('Bob Writer');
    });

    it('should filter by search term', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue([mockPieces[0]] as any);

      const result = await exportMusicToCSV({ search: 'Test Piece 1' });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(prisma.musicPiece.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'Test Piece 1', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter by genre', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue([mockPieces[0]] as any);

      const result = await exportMusicToCSV({ genre: 'Classical' });

      expect(result.success).toBe(true);
      expect(prisma.musicPiece.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            genre: 'Classical',
          }),
        })
      );
    });

    it('should filter by difficulty', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue([mockPieces[1]] as any);

      const result = await exportMusicToCSV({ difficulty: 'GRADE_4' });

      expect(result.success).toBe(true);
      expect(prisma.musicPiece.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            difficulty: 'GRADE_4',
          }),
        })
      );
    });

    it('should filter by archived status', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue([]);

      const result = await exportMusicToCSV({ status: 'archived' });

      expect(result.success).toBe(true);
      expect(prisma.musicPiece.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isArchived: true,
          }),
        })
      );
    });

    it('should escape CSV fields with special characters', async () => {
      const pieceWithSpecialChars = [
        {
          ...mockPieces[0],
          title: 'Test, Piece "With Quotes"',
          notes: 'Line 1\nLine 2',
        },
      ];
      vi.mocked(prisma.musicPiece).findMany.mockResolvedValue(pieceWithSpecialChars as any);

      const result = await exportMusicToCSV();

      expect(result.success).toBe(true);
      expect(result.data).toContain('"Test, Piece ""With Quotes"""');
      expect(result.data).toContain('"Line 1\nLine 2"');
    });

    it('should return error on database failure', async () => {
      vi.mocked(prisma.musicPiece).findMany.mockRejectedValue(new Error('Database error'));

      const result = await exportMusicToCSV();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to export music');
    });
  });
});
