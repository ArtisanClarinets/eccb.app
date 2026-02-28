import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { MUSIC_EDIT } from '@/lib/auth/permission-constants';
import { logger } from '@/lib/logger';
import { cleanupSmartUploadTempFiles } from '@/lib/services/smart-upload-cleanup';
import { z } from 'zod';

// =============================================================================
// Validation Schema
// =============================================================================

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// POST /api/admin/uploads/review/[id]/reject - Reject upload
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

    // Check permission using permission constant
    await requirePermission(MUSIC_EDIT);

    const { id } = await params;

    // Parse request body
    const body = await request.json();
    const validatedData = rejectSchema.parse(body);

    // Find the session
    const uploadSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: id },
      select: { uploadSessionId: true, status: true },
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    // Only allow rejection of sessions that are pending review
    if (uploadSession.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        {
          error: 'Session is not pending review',
          currentStatus: uploadSession.status,
        },
        { status: 400 }
      );
    }

    // Prevent rejecting already-committed sessions
    const alreadyCommitted = await prisma.musicFile.findFirst({
      where: { originalUploadId: id },
      select: { id: true },
    });
    if (alreadyCommitted) {
      return NextResponse.json(
        { error: 'Session has already been committed to the library and cannot be rejected' },
        { status: 400 }
      );
    }

    // Update the session status to REJECTED, persisting rejection reason
    const updatedSession = await prisma.smartUploadSession.update({
      where: { uploadSessionId: id },
      data: {
        status: 'REJECTED',
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        // Store rejection reason in routingDecision for audit trail
        routingDecision: validatedData.reason
          ? `REJECTED: ${validatedData.reason}`
          : 'REJECTED',
      },
    });

    // Clean up temporary files after rejection (best-effort, non-fatal)
    try {
      await cleanupSmartUploadTempFiles(id);
    } catch (cleanupErr) {
      logger.warn('Failed to clean up temp files after rejection', {
        sessionId: id,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    }

    logger.info('Smart upload rejected', {
      sessionId: id,
      userId: session.user.id,
      reason: validatedData.reason ?? 'No reason provided',
    });

    return NextResponse.json({
      success: true,
      session: {
        id: updatedSession.uploadSessionId,
        status: updatedSession.status,
        reviewedAt: updatedSession.reviewedAt,
      },
      message: validatedData.reason
        ? `Upload rejected: ${validatedData.reason}`
        : 'Upload rejected successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to reject upload session', { error });
    return NextResponse.json(
      { error: 'Failed to reject upload session' },
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
