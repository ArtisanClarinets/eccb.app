'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/permissions';
import { auditLog } from '@/lib/services/audit';
import { z } from 'zod';
import { MUSIC_CREATE, MUSIC_EDIT, MUSIC_DELETE } from '@/lib/auth/permission-constants';
import { MusicDifficulty } from '@prisma/client';

const musicPieceSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  composerId: z.string().optional(),
  arrangerId: z.string().optional(),
  publisherId: z.string().optional(),
  difficulty: z.nativeEnum(MusicDifficulty).optional(),
  duration: z.number().int().nonnegative().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  instrumentation: z.string().optional(),
  catalogNumber: z.string().optional(),
  notes: z.string().optional(),
  performanceHistory: z.string().optional(),
  isArchived: z.boolean().optional(),
  tags: z.any().optional(),
});

const updateMusicPieceSchema = musicPieceSchema.partial();

export type CreateMusicPieceInput = z.infer<typeof musicPieceSchema>;
export type UpdateMusicPieceInput = z.infer<typeof updateMusicPieceSchema>;

export async function createMusicPiece(data: CreateMusicPieceInput) {
  await requirePermission(MUSIC_CREATE);

  const validated = musicPieceSchema.parse(data);

  const piece = await prisma.musicPiece.create({
    data: validated,
  });

  await auditLog({
    action: 'CREATE',
    entityType: 'MusicPiece',
    entityId: piece.id,
    newValues: piece,
  });

  return piece;
}

export async function updateMusicPiece(id: string, data: UpdateMusicPieceInput) {
  await requirePermission(MUSIC_EDIT);

  const validated = updateMusicPieceSchema.parse(data);

  const piece = await prisma.musicPiece.update({
    where: { id },
    data: validated,
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'MusicPiece',
    entityId: id,
    newValues: piece,
  });

  return piece;
}

export async function deleteMusicPiece(id: string) {
  await requirePermission(MUSIC_DELETE);

  const piece = await prisma.musicPiece.delete({
    where: { id },
  });

  await auditLog({
    action: 'DELETE',
    entityType: 'MusicPiece',
    entityId: id,
    oldValues: piece,
  });
}
