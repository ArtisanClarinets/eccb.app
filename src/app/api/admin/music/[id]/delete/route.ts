import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { MUSIC_EDIT } from '@/lib/auth/permission-constants';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/music/[id]/delete
 * Soft delete (move to trash) a music piece
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requirePermission(MUSIC_EDIT);

    const { id } = await params;

    const piece = await prisma.musicPiece.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Music piece not found' }, { status: 404 });
    }

    if (piece.deletedAt) {
      return NextResponse.json(
        { error: 'Music piece is already in trash' },
        { status: 400 }
      );
    }

    const updated = await prisma.musicPiece.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, title: true, deletedAt: true },
    });

    logger.info('Music piece moved to trash', {
      pieceId: id,
      title: piece.title,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      piece: updated,
      message: 'Music moved to trash',
    });
  } catch (error) {
    logger.error('Failed to delete music piece', { error });
    return NextResponse.json(
      { error: 'Failed to delete music piece' },
      { status: 500 }
    );
  }
}
