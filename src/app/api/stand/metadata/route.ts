import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';

/**
 * GET /api/stand/metadata
 * Returns OMR metadata for a music piece (tempo, key, measure positions)
 * Query params: pieceId
 * 
 * This endpoint returns the musical metadata stored in the MusicPiece model,
 * including tempo, key signature, time signature, and other relevant info.
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');

    if (!pieceId) {
      return NextResponse.json(
        { error: 'pieceId query parameter is required' },
        { status: 400 }
      );
    }

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
