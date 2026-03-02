import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStandAccess, canAccessPiece } from '@/lib/stand/access';
import { applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/stand/metadata
 * Returns OMR metadata for a music piece (tempo, key, measure positions)
 * Query params: pieceId
 * 
 * This endpoint returns the musical metadata stored in the MusicPiece model,
 * including tempo, key signature, time signature, and other relevant info.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-file');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');

    if (!pieceId) {
      return NextResponse.json(
        { error: 'pieceId query parameter is required' },
        { status: 400 }
      );
    }

    const hasAccess = await canAccessPiece(ctx.userId, pieceId);
    if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const piece = await prisma.musicPiece.findUnique({
      where: { id: pieceId },
      select: {
        id: true,
        title: true,
        tempo: true,
        keySignature: true,
        timeSignature: true,
        difficulty: true,
        duration: true,
        instrumentation: true,
        // Also get parts for additional metadata
        parts: {
          select: {
            id: true,
            partName: true,
            instrumentId: true,
            partLabel: true,
          },
        },
      },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Music piece not found' }, { status: 404 });
    }

    // Format the metadata response
    const metadata = {
      pieceId: piece.id,
      title: piece.title,
      tempo: piece.tempo,
      key: piece.keySignature,
      timeSignature: piece.timeSignature,
      difficulty: piece.difficulty,
      duration: piece.duration,
      instrumentation: piece.instrumentation,
      parts: piece.parts.map((part) => ({
        id: part.id,
        name: part.partName,
        label: part.partLabel,
        instrumentId: part.instrumentId,
      })),
    };

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
