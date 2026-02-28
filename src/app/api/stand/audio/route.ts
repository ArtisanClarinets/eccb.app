import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

// Zod schemas for validation
const audioCreateSchema = z.object({
  pieceId: z.string().min(1),
  fileKey: z.string().min(1),
  url: z.string().url().optional(),
  description: z.string().optional(),
});

export type AudioCreateInput = z.infer<typeof audioCreateSchema>;

/**
 * GET /api/stand/audio
 * Returns audio links for a music piece
 * Query params: pieceId
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

    const audioLinks = await prisma.audioLink.findMany({
      where: { pieceId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ audioLinks });
  } catch (error) {
    console.error('Error fetching audio links:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/audio
 * Creates a new audio link (director/librarian only)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit audio link writes
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only directors and librarians can add audio links
    const roles = await getUserRoles(session.user.id);
    const canAddAudio = roles.includes('DIRECTOR') ||
      roles.includes('SUPER_ADMIN') ||
      roles.includes('LIBRARIAN');

    if (!canAddAudio) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors and librarians can add audio links' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = audioCreateSchema.parse(body);

    // Verify the piece exists
    const piece = await prisma.musicPiece.findUnique({
      where: { id: validated.pieceId },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Music piece not found' }, { status: 404 });
    }

    const audioLink = await prisma.audioLink.create({
      data: {
        pieceId: validated.pieceId,
        fileKey: validated.fileKey,
        url: validated.url,
        description: validated.description,
      },
    });

    return NextResponse.json({ audioLink }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating audio link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
