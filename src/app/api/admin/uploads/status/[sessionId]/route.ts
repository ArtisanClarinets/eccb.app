import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/permissions';
import { MUSIC_VIEW_ALL } from '@/lib/auth/permission-constants';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/uploads/status/[sessionId]
 *
 * Get the status of a smart upload session.
 * Used for polling progress from the frontend.
 *
 * Requires `music.view.all` permission.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requirePermission(MUSIC_VIEW_ALL);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { sessionId } = await params;

    const session = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: sessionId },
      select: {
        id: true,
        uploadSessionId: true,
        status: true,
        parseStatus: true,
        secondPassStatus: true,
        confidenceScore: true,
        routingDecision: true,
        requiresHumanReview: true,
        fileName: true,
        fileSize: true,
        extractedMetadata: true,
        parsedParts: true,
        cuttingInstructions: true,
        autoApproved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    logger.error('Error fetching upload status', { error });
    return NextResponse.json(
      { error: 'Failed to fetch upload status' },
      { status: 500 }
    );
  }
}
