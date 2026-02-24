import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MusicLibraryService } from '../music.service';
import {
  cacheGet,
  cacheSet,
  cacheKeys as _cacheKeys,
  CACHE_CONFIG,
  invalidateMusicCache,
  invalidateMusicAssignmentCache,
  invalidateMusicDashboardCache,
} from '@/lib/cache';

// Mock the cache module
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheKeys: {
    musicPiece: vi.fn((id) => `eccb:music:piece:${id}`),
    musicList: vi.fn((filters) => `eccb:music:list:${filters}`),
    musicAssignments: vi.fn((pieceId, memberId) => `eccb:music:assignments:${pieceId ?? 'all'}:${memberId ?? 'all'}`),
    musicDashboard: vi.fn(() => 'eccb:music:dashboard'),
  },
  CACHE_CONFIG: {
    MUSIC_LIST_TTL: 300,
    MUSIC_PIECE_TTL: 600,
    MUSIC_ASSIGNMENT_TTL: 180,
    MUSIC_DASHBOARD_TTL: 120,
  },
  invalidateMusicCache: vi.fn(),
  invalidateMusicAssignmentCache: vi.fn(),
  invalidateMusicDashboardCache: vi.fn(),
}));

// Mock the prisma module
vi.mock('@/lib/db', () => ({
  prisma: {
    musicPiece: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    musicFile: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    musicPart: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    musicAssignment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    musicAssignmentHistory: {
      count: vi.fn(),
    },
  },
}));

// Mock the storage module
vi.mock('../storage', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

// Mock the audit module
vi.mock('../audit', () => ({
  auditLog: vi.fn(),
}));

const mockCacheGet = vi.mocked(cacheGet);
const _mockCacheSet = vi.mocked(cacheSet);
const mockInvalidateMusicCache = vi.mocked(invalidateMusicCache);
const mockInvalidateMusicAssignmentCache = vi.mocked(invalidateMusicAssignmentCache);
const mockInvalidateMusicDashboardCache = vi.mocked(invalidateMusicDashboardCache);

describe('MusicLibraryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getPieceById', () => {
    it('should call cacheGet with correct key and TTL', async () => {
      const mockPiece = { id: 'piece-123', title: 'Test Piece' };
      mockCacheGet.mockResolvedValueOnce(mockPiece);

      const result = await MusicLibraryService.getPieceById('piece-123');

      expect(mockCacheGet).toHaveBeenCalledWith(
        'eccb:music:piece:piece-123',
        expect.any(Function),
        CACHE_CONFIG.MUSIC_PIECE_TTL,
      );
      expect(result).toEqual(mockPiece);
    });
  });

  describe('getMusicPieces', () => {
    it('should call cacheGet with correct list key and TTL', async () => {
      const mockPieces = [{ id: 'piece-1', title: 'Piece 1' }];
      mockCacheGet.mockResolvedValueOnce(mockPieces);

      const result = await MusicLibraryService.getMusicPieces({});

      expect(mockCacheGet).toHaveBeenCalledWith(
        expect.stringContaining('eccb:music:list:'),
        expect.any(Function),
        CACHE_CONFIG.MUSIC_LIST_TTL,
      );
      expect(result).toEqual(mockPieces);
    });

    it('should use filter key based on filters', async () => {
      mockCacheGet.mockResolvedValueOnce([]);

      await MusicLibraryService.getMusicPieces({ genre: 'classical' });

      expect(mockCacheGet).toHaveBeenCalledWith(
        expect.stringContaining('classical'),
        expect.any(Function),
        CACHE_CONFIG.MUSIC_LIST_TTL,
      );
    });
  });

  describe('getAssignments', () => {
    it('should call cacheGet with correct key for piece assignments', async () => {
      const mockAssignments = [{ id: 'assign-1', pieceId: 'piece-123' }];
      mockCacheGet.mockResolvedValueOnce(mockAssignments);

      const result = await MusicLibraryService.getAssignments({ pieceId: 'piece-123' });

      expect(mockCacheGet).toHaveBeenCalledWith(
        'eccb:music:assignments:piece-123:all',
        expect.any(Function),
        CACHE_CONFIG.MUSIC_ASSIGNMENT_TTL,
      );
      expect(result).toEqual(mockAssignments);
    });

    it('should call cacheGet with correct key for member assignments', async () => {
      const mockAssignments = [{ id: 'assign-1', memberId: 'member-456' }];
      mockCacheGet.mockResolvedValueOnce(mockAssignments);

      const result = await MusicLibraryService.getAssignments({ memberId: 'member-456' });

      expect(mockCacheGet).toHaveBeenCalledWith(
        'eccb:music:assignments:all:member-456',
        expect.any(Function),
        CACHE_CONFIG.MUSIC_ASSIGNMENT_TTL,
      );
      expect(result).toEqual(mockAssignments);
    });

    it('should call cacheGet with correct key for piece and member assignments', async () => {
      const mockAssignments = [{ id: 'assign-1', pieceId: 'piece-123', memberId: 'member-456' }];
      mockCacheGet.mockResolvedValueOnce(mockAssignments);

      const result = await MusicLibraryService.getAssignments({
        pieceId: 'piece-123',
        memberId: 'member-456',
      });

      expect(mockCacheGet).toHaveBeenCalledWith(
        'eccb:music:assignments:piece-123:member-456',
        expect.any(Function),
        CACHE_CONFIG.MUSIC_ASSIGNMENT_TTL,
      );
      expect(result).toEqual(mockAssignments);
    });
  });

  describe('getLibrarianDashboardStats', () => {
    it('should call cacheGet with correct key and TTL', async () => {
      const mockStats = {
        statusCounts: { ASSIGNED: 5, PICKED_UP: 3 },
        overdueCount: 2,
        recentActivity: 10,
        missingCount: 1,
        pendingPickups: 5,
        pendingReturns: 3,
      };
      mockCacheGet.mockResolvedValueOnce(mockStats);

      const result = await MusicLibraryService.getLibrarianDashboardStats();

      expect(mockCacheGet).toHaveBeenCalledWith(
        'eccb:music:dashboard',
        expect.any(Function),
        CACHE_CONFIG.MUSIC_DASHBOARD_TTL,
      );
      expect(result).toEqual(mockStats);
    });
  });

  describe('invalidateAllCaches', () => {
    it('should call all invalidation functions', async () => {
      await MusicLibraryService.invalidateAllCaches();

      expect(mockInvalidateMusicCache).toHaveBeenCalled();
      expect(mockInvalidateMusicAssignmentCache).toHaveBeenCalled();
      expect(mockInvalidateMusicDashboardCache).toHaveBeenCalled();
    });
  });
});
