'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { uploadFile, deleteFile } from '@/lib/services/storage';
import { auditLog } from '@/lib/services/audit';
import { MusicDifficulty, FileType } from '@prisma/client';
import {
  MUSIC_CREATE,
  MUSIC_EDIT,
  MUSIC_DELETE,
} from '@/lib/auth/permission-constants';
import {
  invalidateMusicCache,
} from '@/lib/cache';
import { z } from 'zod';

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

const musicPieceSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  composerId: z.string().optional(),
  arrangerId: z.string().optional(),
  publisherId: z.string().optional(),
  difficulty: z.nativeEnum(MusicDifficulty).optional(),
  duration: z.number().positive().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  catalogNumber: z.string().optional(),
  notes: z.string().optional(),
});

// Re-export actions from other files to maintain backward compatibility if needed,
// OR let the components update their imports.
// For now, we update the components to use the new files.

/**
 * Helper to determine file type from mime type
 */
function getFileType(mimeType: string): FileType {
  if (mimeType.includes('pdf')) return FileType.FULL_SCORE;
  if (mimeType.includes('audio')) return FileType.AUDIO;
  return FileType.OTHER;
}

export async function createMusicPiece(formData: FormData) {
  await requirePermission(MUSIC_CREATE);
  
  try {
    const title = formData.get('title') as string;
    const subtitle = formData.get('subtitle') as string | null;
    const composerId = formData.get('composerId') as string | null;
    const arrangerId = formData.get('arrangerId') as string | null;
    const publisherId = formData.get('publisherId') as string | null;
    const difficultyValue = formData.get('difficulty') as string | null;
    const difficulty = difficultyValue ? (difficultyValue as MusicDifficulty) : null;
    const duration = formData.get('duration') ? Number(formData.get('duration')) : null;
    const genre = formData.get('genre') as string | null;
    const style = formData.get('style') as string | null;
    const catalogNumber = formData.get('catalogNumber') as string | null;
    const notes = formData.get('notes') as string | null;
    const files = formData.getAll('files') as File[];

    const partialData = {
      title,
      subtitle: subtitle || undefined,
      composerId: composerId || undefined,
      arrangerId: arrangerId || undefined,
      publisherId: publisherId || undefined,
      difficulty,
      duration,
      genre: genre || undefined,
      style: style || undefined,
      catalogNumber: catalogNumber || undefined,
      notes: notes || undefined,
    };
    
    const parsed = musicPieceSchema.partial().safeParse(partialData);
    if (!parsed.success) {
      return { success: false, error: 'Invalid input data', details: parsed.error.issues };
    }

    // Create the music piece
    const piece = await prisma.musicPiece.create({
      data: {
        title: parsed.data.title || '',
        subtitle: parsed.data.subtitle,
        composerId: parsed.data.composerId,
        arrangerId: parsed.data.arrangerId,
        publisherId: parsed.data.publisherId,
        difficulty: parsed.data.difficulty,
        duration: parsed.data.duration,
        genre: parsed.data.genre,
        style: parsed.data.style,
        catalogNumber: parsed.data.catalogNumber,
        notes: parsed.data.notes,
      },
    });

    // Upload files if any
    const uploadedFiles = [];
    for (const file of files) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const key = `music/${piece.id}/${Date.now()}-${file.name}`;
        await uploadFile(key, Buffer.from(buffer), {
          contentType: file.type,
        });
        
        uploadedFiles.push({
          pieceId: piece.id,
          fileName: file.name,
          storageKey: key,
          mimeType: file.type,
          fileSize: file.size,
          fileType: getFileType(file.type),
        });
      }
    }

    if (uploadedFiles.length > 0) {
      await prisma.musicFile.createMany({
        data: uploadedFiles,
      });
    }

    await auditLog({
      action: 'music.create',
      entityType: 'MusicPiece',
      entityId: piece.id,
      newValues: { title: piece.title, fileCount: uploadedFiles.length },
    });

    // Invalidate caches
    await invalidateMusicCache();

    revalidatePath('/admin/music');
    revalidatePath('/member/music');
    
    return { success: true, pieceId: piece.id };
  } catch (error) {
    console.error('Failed to create music piece:', error);
    return { success: false, error: 'Failed to create music piece' };
  }
}

export async function updateMusicPiece(id: string, formData: FormData) {
  await requirePermission(MUSIC_EDIT);
  
  try {
    const title = formData.get('title') as string;
    const subtitle = formData.get('subtitle') as string | null;
    const composerId = formData.get('composerId') as string | null;
    const arrangerId = formData.get('arrangerId') as string | null;
    const publisherId = formData.get('publisherId') as string | null;
    const difficultyValue = formData.get('difficulty') as string | null;
    const difficulty = difficultyValue ? (difficultyValue as MusicDifficulty) : null;
    const duration = formData.get('duration') ? Number(formData.get('duration')) : null;
    const genre = formData.get('genre') as string | null;
    const style = formData.get('style') as string | null;
    const catalogNumber = formData.get('catalogNumber') as string | null;
    const notes = formData.get('notes') as string | null;

    const piece = await prisma.musicPiece.update({
      where: { id },
      data: {
        title,
        subtitle,
        composerId: composerId || null,
        arrangerId: arrangerId || null,
        publisherId: publisherId || null,
        difficulty,
        duration,
        genre,
        style,
        catalogNumber,
        notes,
      },
    });

    await auditLog({
      action: 'music.update',
      entityType: 'MusicPiece',
      entityId: piece.id,
      newValues: { title },
    });

    // Invalidate caches
    await invalidateMusicCache(id);

    revalidatePath('/admin/music');
    revalidatePath(`/admin/music/${id}`);
    revalidatePath('/member/music');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to update music piece:', error);
    return { success: false, error: 'Failed to update music piece' };
  }
}

export async function deleteMusicPiece(id: string) {
  await requirePermission(MUSIC_DELETE);
  
  try {
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
      action: 'music.delete',
      entityType: 'MusicPiece',
      entityId: id,
      newValues: { title: piece.title },
    });

    // Invalidate caches
    await invalidateMusicCache(id);

    revalidatePath('/admin/music');
    revalidatePath('/member/music');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to delete music piece:', error);
    return { success: false, error: 'Failed to delete music piece' };
  }
}

// =============================================================================
// EXPORT FUNCTIONALITY
// =============================================================================

export interface MusicExportFilters {
  search?: string;
  genre?: string;
  difficulty?: string;
  status?: string;
}

export async function exportMusicToCSV(filters: MusicExportFilters = {}) {
  await requirePermission('music:read');

  try {
    // Build where clause
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    // Filter by archived status
    if (filters.status === 'archived') {
      where.isArchived = true;
    } else if (filters.status === 'active' || !filters.status) {
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
        { title: { contains: filters.search } },
        { subtitle: { contains: filters.search } },
        { composer: { fullName: { contains: filters.search } } },
        { arranger: { fullName: { contains: filters.search } } },
        { catalogNumber: { contains: filters.search } },
      ];
    }

    const pieces = await prisma.musicPiece.findMany({
      where,
      include: {
        composer: true,
        arranger: true,
        publisher: true,
        files: {
          where: { isArchived: false },
        },
        _count: {
          select: {
            assignments: true,
            eventMusic: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    });

    // Generate CSV
    const headers = [
      'Title',
      'Subtitle',
      'Composer',
      'Arranger',
      'Publisher',
      'Genre',
      'Style',
      'Difficulty',
      'Duration (seconds)',
      'Catalog Number',
      'Notes',
      'File Count',
      'Assignment Count',
      'Archived',
      'Created At',
    ];

    const difficultyLabels: Record<string, string> = {
      GRADE_1: 'Grade 1',
      GRADE_2: 'Grade 2',
      GRADE_3: 'Grade 3',
      GRADE_4: 'Grade 4',
      GRADE_5: 'Grade 5',
      GRADE_6: 'Grade 6',
    };

    const rows = pieces.map((piece) => [
      piece.title,
      piece.subtitle || '',
      piece.composer?.fullName || '',
      piece.arranger?.fullName || '',
      piece.publisher?.name || '',
      piece.genre || '',
      piece.style || '',
      piece.difficulty ? difficultyLabels[piece.difficulty] || piece.difficulty : '',
      piece.duration?.toString() || '',
      piece.catalogNumber || '',
      piece.notes || '',
      piece.files.length.toString(),
      piece._count.assignments.toString(),
      piece.isArchived ? 'Yes' : 'No',
      piece.createdAt.toISOString().split('T')[0],
    ]);

    // Escape CSV fields
    const escapeCSV = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    await auditLog({
      action: 'music.export',
      entityType: 'MusicPiece',
      newValues: { count: pieces.length, filters },
    });

    return {
      success: true,
      data: csvContent,
      filename: `music-export-${new Date().toISOString().split('T')[0]}.csv`,
      count: pieces.length,
    };
  } catch (error) {
    console.error('Failed to export music:', error);
    return { success: false, error: 'Failed to export music' };
  }
}
