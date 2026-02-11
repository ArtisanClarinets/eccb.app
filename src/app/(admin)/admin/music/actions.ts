'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission, getSession } from '@/lib/auth/guards';
import { uploadFile, deleteFile } from '@/lib/services/storage';
import { auditLog } from '@/lib/services/audit';
import { MusicDifficulty, FileType } from '@prisma/client';

export async function createMusicPiece(formData: FormData) {
  const session = await requirePermission('music:create');
  
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

    // Create the music piece
    const piece = await prisma.musicPiece.create({
      data: {
        title,
        subtitle,
        composerId: composerId || undefined,
        arrangerId: arrangerId || undefined,
        publisherId: publisherId || undefined,
        difficulty,
        duration,
        genre,
        style,
        catalogNumber,
        notes,
        isArchived: false,
      },
    });

    // Upload files if any
    const uploadedFiles = [];
    for (const file of files) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const key = `music/${piece.id}/${Date.now()}-${file.name}`;
        await uploadFile(
          Buffer.from(buffer),
          key,
          file.type
        );
        
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
      newValues: { title, fileCount: uploadedFiles.length },
    });

    revalidatePath('/admin/music');
    revalidatePath('/member/music');
    
    return { success: true, pieceId: piece.id };
  } catch (error) {
    console.error('Failed to create music piece:', error);
    return { success: false, error: 'Failed to create music piece' };
  }
}

export async function updateMusicPiece(id: string, formData: FormData) {
  const session = await requirePermission('music:update');
  
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
  const session = await requirePermission('music:delete');
  
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

    revalidatePath('/admin/music');
    revalidatePath('/member/music');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to delete music piece:', error);
    return { success: false, error: 'Failed to delete music piece' };
  }
}

export async function uploadMusicFile(musicPieceId: string, formData: FormData) {
  const session = await requirePermission('music:update');
  
  try {
    const file = formData.get('file') as File;
    const partType = formData.get('partType') as string | null;
    const instrumentId = formData.get('instrumentId') as string | null;

    if (!file || file.size === 0) {
      return { success: false, error: 'No file provided' };
    }

    const buffer = await file.arrayBuffer();
    const key = `music/${musicPieceId}/${Date.now()}-${file.name}`;
    await uploadFile(
      Buffer.from(buffer),
      key,
      file.type
    );

    const musicFile = await prisma.musicFile.create({
      data: {
        pieceId: musicPieceId,
        fileName: file.name,
        storageKey: key,
        mimeType: file.type,
        fileSize: file.size,
        fileType: getFileType(file.type),
      },
    });

    await auditLog({
      action: 'music.file.upload',
      entityType: 'MusicFile',
      entityId: musicFile.id,
      newValues: { fileName: file.name, pieceId: musicPieceId },
    });

    revalidatePath(`/admin/music/${musicPieceId}`);
    
    return { success: true, fileId: musicFile.id };
  } catch (error) {
    console.error('Failed to upload music file:', error);
    return { success: false, error: 'Failed to upload file' };
  }
}

export async function deleteMusicFile(fileId: string) {
  const session = await requirePermission('music:update');
  
  try {
    const file = await prisma.musicFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return { success: false, error: 'File not found' };
    }

    await deleteFile(file.storageKey);
    await prisma.musicFile.delete({ where: { id: fileId } });

    await auditLog({
      action: 'music.file.delete',
      entityType: 'MusicFile',
      entityId: fileId,
      newValues: { fileName: file.fileName, pieceId: file.pieceId },
    });

    revalidatePath(`/admin/music/${file.pieceId}`);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to delete music file:', error);
    return { success: false, error: 'Failed to delete file' };
  }
}

export async function assignMusicToMembers(
  pieceId: string,
  memberIds: string[],
  notes?: string
) {
  const session = await requirePermission('music:assign');
  
  try {
    // Create assignments
    await prisma.musicAssignment.createMany({
      data: memberIds.map((memberId) => ({
        pieceId,
        memberId,
        assignedBy: session.user.id,
        notes,
      })),
      skipDuplicates: true,
    });

    await auditLog({
      action: 'music.assign',
      entityType: 'MusicPiece',
      entityId: pieceId,
      newValues: { memberCount: memberIds.length },
    });

    revalidatePath(`/admin/music/${pieceId}`);
    revalidatePath('/member/music');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to assign music:', error);
    return { success: false, error: 'Failed to assign music' };
  }
}

export async function unassignMusicFromMember(
  pieceId: string,
  memberId: string
) {
  const session = await requirePermission('music:assign');
  
  try {
    await prisma.musicAssignment.deleteMany({
      where: {
        pieceId,
        memberId,
      },
    });

    await auditLog({
      action: 'music.unassign',
      entityType: 'MusicPiece',
      entityId: pieceId,
      newValues: { memberId },
    });

    revalidatePath(`/admin/music/${pieceId}`);
    revalidatePath('/member/music');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to unassign music:', error);
    return { success: false, error: 'Failed to unassign music' };
  }
}

function getFileType(mimeType: string): FileType {
  if (mimeType.includes('pdf')) return FileType.FULL_SCORE;
  if (mimeType.includes('audio')) return FileType.AUDIO;
  return FileType.OTHER;
}
