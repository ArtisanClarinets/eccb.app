import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{
    instrument: string;
    partName: string;
  }>;
}

// =============================================================================
// Validation Schema
// =============================================================================

const approveSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  composer: z.string().optional(),
  publisher: z.string().optional(),
  instrument: z.string().optional(),
  partNumber: z.string().optional(),
  difficulty: z.string().optional(),
});

// =============================================================================
// POST /api/admin/uploads/review/[id]/approve - Approve and create MusicPiece/MusicPart
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - require music:create permission
    await requirePermission('music:create');

    const { id } = await params;

    // Parse request body
    const body = await request.json();
    const validatedData = approveSchema.parse(body);

    // Find the session
    const uploadSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: id },
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    if (uploadSession.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        { error: 'Session is not pending review' },
        { status: 400 }
      );
    }

    // Get the extracted metadata
    const extractedMetadata = uploadSession.extractedMetadata as ExtractedMetadata | null;

    // TODO: Implement actual approval logic here
    // This is where you would:
    // 1. Create a MusicPiece record
    // 2. Create MusicPart records for each instrument
    // 3. Copy the file to the music library storage
    // 4. Create MusicFile record linking to the piece
    //
    // For now, we just mark the session as approved

    // Update the session status
    const updatedSession = await prisma.smartUploadSession.update({
      where: { uploadSessionId: id },
      data: {
        status: 'APPROVED',
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      },
    });

    logger.info('Smart upload approved', {
      sessionId: id,
      userId: session.user.id,
      title: validatedData.title,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: updatedSession.uploadSessionId,
        status: updatedSession.status,
        reviewedAt: updatedSession.reviewedAt,
      },
      message: `Successfully approved "${validatedData.title}". Music piece creation will be implemented.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to approve upload session', { error });
    return NextResponse.json(
      { error: 'Failed to approve upload session' },
      { status: 500 }
    );
  }
}

// =============================================================================
// OPTIONS handler for CORS
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
