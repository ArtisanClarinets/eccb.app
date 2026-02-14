import { prisma } from '@/lib/db';
import { deleteFile, uploadFile } from './storage';
import { auditLog } from './audit';
import { MusicDifficulty, FileType } from '@prisma/client';

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
      },
    });

    await auditLog({
      action: 'assignment.create',
      entityType: 'MusicAssignment',
      entityId: assignment.id,
      newValues: assignment,
    });

    return assignment;
  }

  /**
   * Get all parts for a piece
   */
  static async getPieceWithParts(id: string) {
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
  }
}
