import { prisma } from '@/lib/db';
import { deleteFile, uploadFile } from './storage';
import { auditLog } from './audit';
import { MusicDifficulty, FileType, AssignmentStatus } from '@prisma/client';
import {
  cacheGet,
  cacheSet,
  cacheKeys,
  CACHE_CONFIG,
  invalidateMusicCache,
  invalidateMusicAssignmentCache,
  invalidateMusicDashboardCache,
} from '@/lib/cache';

export interface CreatePieceData {
  title: string;
  composerId?: string;
  arrangerId?: string;
  publisherId?: string;
  difficulty?: MusicDifficulty;
  duration?: number;
  genre?: string;
  style?: string;
  description?: string; // Mapped to notes?
}

export interface CreatePartData {
  pieceId: string;
  instrumentId: string;
  partName: string;
  label?: string; // Mapped to notes?
  file?: Buffer;
  fileName?: string;
  contentType?: string;
}

export interface MusicListFilters {
  search?: string;
  genre?: string;
  difficulty?: string;
  status?: string;
  isArchived?: boolean;
}

/**
 * Generate a cache key for music list filters
 */
function getMusicListFiltersKey(filters: MusicListFilters): string {
  const parts = [
    filters.search ?? '',
    filters.genre ?? '',
    filters.difficulty ?? '',
    filters.status ?? '',
    filters.isArchived?.toString() ?? '',
  ];
  return parts.join(':').replace(/:+/g, ':').replace(/^:|:$/g, '') || 'all';
}

export class MusicLibraryService {
  /**
   * Create a new music piece
   */
  static async createPiece(data: CreatePieceData) {
    const { description, ...rest } = data;
    const piece = await prisma.musicPiece.create({
      data: {
        ...rest,
        notes: description,
      },
    });

    await auditLog({
      action: 'piece.create',
      entityType: 'MusicPiece',
      entityId: piece.id,
      newValues: piece,
    });

    // Invalidate music list cache
    await invalidateMusicCache();

    return piece;
  }

  /**
   * Get a music piece by ID with caching
   */
  static async getPieceById(id: string) {
    const key = cacheKeys.musicPiece(id);
    
    return cacheGet(
      key,
      async () => {
        return prisma.musicPiece.findUnique({
          where: { id },
          include: {
            composer: true,
            arranger: true,
            publisher: true,
            files: {
              where: { isArchived: false },
              orderBy: { uploadedAt: 'desc' },
            },
            parts: {
              include: {
                instrument: true,
              },
            },
            _count: {
              select: {
                assignments: true,
              },
            },
          },
        });
      },
      CACHE_CONFIG.MUSIC_PIECE_TTL,
    );
  }

  /**
   * Get music pieces with filtering and caching
   */
  static async getMusicPieces(filters: MusicListFilters = {}) {
    const filterKey = getMusicListFiltersKey(filters);
    const key = cacheKeys.musicList(filterKey);
    
    return cacheGet(
      key,
      async () => {
        const where: Record<string, unknown> = {
          deletedAt: null,
        };

        // Filter by archived status
        if (filters.isArchived !== undefined) {
          where.isArchived = filters.isArchived;
        } else if (filters.status === 'archived') {
          where.isArchived = true;
        } else {
          where.isArchived = false;
        }

        if (filters.genre) {
          where.genre = filters.genre;
        }

        if (filters.difficulty) {
          where.difficulty = filters.difficulty;
        }

        if (filters.search) {
          where.OR = [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { subtitle: { contains: filters.search, mode: 'insensitive' } },
            { composer: { fullName: { contains: filters.search, mode: 'insensitive' } } },
            { arranger: { fullName: { contains: filters.search, mode: 'insensitive' } } },
            { catalogNumber: { contains: filters.search, mode: 'insensitive' } },
          ];
        }

        return prisma.musicPiece.findMany({
          where,
          include: {
            composer: { select: { id: true, fullName: true } },
            arranger: { select: { id: true, fullName: true } },
            publisher: { select: { id: true, name: true } },
            files: {
              where: { isArchived: false },
              select: { id: true, fileName: true, fileType: true },
            },
            _count: {
              select: {
                assignments: true,
                parts: true,
              },
            },
          },
          orderBy: { title: 'asc' },
        });
      },
      CACHE_CONFIG.MUSIC_LIST_TTL,
    );
  }

  /**
   * Update a music piece
   */
  static async updatePiece(id: string, data: Partial<CreatePieceData>) {
    const { description, ...rest } = data;
    const piece = await prisma.musicPiece.update({
      where: { id },
      data: {
        ...rest,
        notes: description,
      },
    });

    await auditLog({
      action: 'piece.update',
      entityType: 'MusicPiece',
      entityId: piece.id,
      newValues: piece,
    });

    // Invalidate cache for this piece and lists
    await invalidateMusicCache(id);

    return piece;
  }

  /**
   * Delete a music piece
   */
  static async deletePiece(id: string) {
    // Get all files for this piece
    const files = await prisma.musicFile.findMany({
      where: { pieceId: id },
    });

    // Delete files from storage
    for (const file of files) {
      await deleteFile(file.storageKey);
    }

    // Delete from database (cascading will handle related records)
    const piece = await prisma.musicPiece.delete({
      where: { id },
    });

    await auditLog({
      action: 'piece.delete',
      entityType: 'MusicPiece',
      entityId: id,
      newValues: { title: piece.title },
    });

    // Invalidate cache
    await invalidateMusicCache(id);

    return piece;
  }

  /**
   * Add a part to a piece
   */
  static async addPart(data: CreatePartData) {
    let fileId: string | undefined;

    if (data.file && data.fileName) {
      const storageKey = `music/${data.pieceId}/${Date.now()}-${data.fileName}`;
      await uploadFile(storageKey, data.file, {
        contentType: data.contentType || 'application/pdf',
      });

      const musicFile = await prisma.musicFile.create({
        data: {
          pieceId: data.pieceId,
          fileName: data.fileName,
          fileType: FileType.PART,
          fileSize: data.file ? data.file.length : 0,
          mimeType: data.contentType || 'application/pdf',
          storageKey,
        },
      });
      fileId = musicFile.id;
    }

    const part = await prisma.musicPart.create({
      data: {
        pieceId: data.pieceId,
        instrumentId: data.instrumentId,
        partName: data.partName,
        notes: data.label,
        fileId,
      },
    });

    await auditLog({
      action: 'part.create',
      entityType: 'MusicPart',
      entityId: part.id,
      newValues: part,
    });

    // Invalidate piece cache
    await invalidateMusicCache(data.pieceId);

    return part;
  }

  /**
   * Assign a part to a member
   */
  static async assignPart(memberId: string, pieceId: string, partName: string, assignedById: string) {
    const assignment = await prisma.musicAssignment.create({
      data: {
        memberId,
        pieceId,
        partName,
        assignedBy: assignedById,
        assignedAt: new Date(),
        status: AssignmentStatus.ASSIGNED,
      },
    });

    await auditLog({
      action: 'assignment.create',
      entityType: 'MusicAssignment',
      entityId: assignment.id,
      newValues: assignment,
    });

    // Invalidate assignment cache
    await invalidateMusicAssignmentCache(pieceId, memberId);

    return assignment;
  }

  /**
   * Get all parts for a piece with caching
   */
  static async getPieceWithParts(id: string) {
    const key = cacheKeys.musicPiece(id);
    
    return cacheGet(
      key,
      async () => {
        return prisma.musicPiece.findUnique({
          where: { id },
          include: {
            parts: {
              include: {
                instrument: true,
              },
            },
          },
        });
      },
      CACHE_CONFIG.MUSIC_PIECE_TTL,
    );
  }

  /**
   * Get assignments for a piece or member with caching
   */
  static async getAssignments(options: { pieceId?: string; memberId?: string }) {
    const key = cacheKeys.musicAssignments(options.pieceId, options.memberId);
    
    return cacheGet(
      key,
      async () => {
        const where: Record<string, unknown> = {};
        
        if (options.pieceId) {
          where.pieceId = options.pieceId;
        }
        
        if (options.memberId) {
          where.memberId = options.memberId;
        }

        return prisma.musicAssignment.findMany({
          where,
          include: {
            piece: {
              select: {
                id: true,
                title: true,
                catalogNumber: true,
              },
            },
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        });
      },
      CACHE_CONFIG.MUSIC_ASSIGNMENT_TTL,
    );
  }

  /**
   * Delete a part
   */
  static async deletePart(id: string) {
    const part = await prisma.musicPart.findUnique({
      where: { id },
      include: { file: true },
    });

    if (part?.file?.storageKey) {
      await deleteFile(part.file.storageKey);
    }

    await prisma.musicPart.delete({
      where: { id },
    });

    await auditLog({
      action: 'part.delete',
      entityType: 'MusicPart',
      entityId: id,
    });

    // Invalidate piece cache if we have the piece ID
    if (part?.pieceId) {
      await invalidateMusicCache(part.pieceId);
    }
  }

  /**
   * Get librarian dashboard statistics with caching
   */
  static async getLibrarianDashboardStats() {
    const key = cacheKeys.musicDashboard();
    
    return cacheGet(
      key,
      async () => {
        const now = new Date();
        
        // Get counts by status
        const statusCounts = await prisma.musicAssignment.groupBy({
          by: ['status'],
          _count: true,
        });

        // Get overdue assignments
        const overdueCount = await prisma.musicAssignment.count({
          where: {
            status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.PICKED_UP] },
            dueDate: { lt: now },
          },
        });

        // Get recent activity (last 7 days)
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentActivity = await prisma.musicAssignmentHistory.count({
          where: {
            performedAt: { gte: weekAgo },
          },
        });

        // Get missing parts count
        const missingCount = await prisma.musicAssignment.count({
          where: {
            status: AssignmentStatus.LOST,
          },
        });

        // Get pending pickups
        const pendingPickups = await prisma.musicAssignment.count({
          where: {
            status: AssignmentStatus.ASSIGNED,
          },
        });

        // Get pending returns
        const pendingReturns = await prisma.musicAssignment.count({
          where: {
            status: AssignmentStatus.PICKED_UP,
          },
        });

        // Format status counts
        const statusMap: Record<string, number> = {
          ASSIGNED: 0,
          PICKED_UP: 0,
          RETURNED: 0,
          OVERDUE: 0,
          LOST: 0,
          DAMAGED: 0,
        };
        
        for (const item of statusCounts) {
          statusMap[item.status] = item._count;
        }

        return {
          statusCounts: statusMap,
          overdueCount,
          recentActivity,
          missingCount,
          pendingPickups,
          pendingReturns,
        };
      },
      CACHE_CONFIG.MUSIC_DASHBOARD_TTL,
    );
  }

  /**
   * Invalidate all music-related caches
   */
  static async invalidateAllCaches(): Promise<void> {
    await invalidateMusicCache();
    await invalidateMusicAssignmentCache();
    await invalidateMusicDashboardCache();
  }
}
