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

const bulkRejectSchema = z.object({
  sessionIds: z.array(z.string()).min(1, 'At least one session ID is required'),
  reason: z.string().optional(),
});

// =============================================================================
// POST /api/admin/uploads/review/bulk-reject
//
// Rejects multiple upload sessions at once. Sessions that have already been
// committed to the library are skipped.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    await requirePermission(MUSIC_EDIT);

    // Parse body
    const body = await request.json();
    const { sessionIds, reason } = bulkRejectSchema.parse(body);

    // Load all pending sessions to validate before rejecting
    const uploadSessions = await prisma.smartUploadSession.findMany({
      where: {
        uploadSessionId: { in: sessionIds },
        status: 'PENDING_REVIEW',
      },
      select: {
        uploadSessionId: true,
        status: true,
      },
    });

    if (uploadSessions.length === 0) {
      return NextResponse.json(
        { error: 'No pending sessions found for the provided IDs' },
        { status: 400 }
      );
    }

    const rejected: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const uploadSession of uploadSessions) {
      try {
        // Prevent rejecting already-committed sessions
        const alreadyCommitted = await prisma.musicFile.findFirst({
          where: { originalUploadId: uploadSession.uploadSessionId },
          select: { id: true },
        });

        if (alreadyCommitted) {
          skipped.push({
            id: uploadSession.uploadSessionId,
            reason: 'Session has already been committed to the library',
          });
          continue;
        }

        // Update the session status to REJECTED
        const updatedSession = await prisma.smartUploadSession.update({
          where: { uploadSessionId: uploadSession.uploadSessionId },
          data: {
            status: 'REJECTED',
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            // Store rejection reason in routingDecision for audit trail
            routingDecision: reason
              ? `REJECTED: ${reason}`
              : 'REJECTED',
          },
        });

        rejected.push(uploadSession.uploadSessionId);

        // Clean up temporary files after rejection (best-effort, non-fatal)
        try {
          await cleanupSmartUploadTempFiles(uploadSession.uploadSessionId);
        } catch (cleanupErr) {
          logger.warn('Failed to clean up temp files after rejection', {
            sessionId: uploadSession.uploadSessionId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }

        logger.info('Smart upload rejected (bulk)', {
          sessionId: uploadSession.uploadSessionId,
          userId: session.user.id,
          reason: reason ?? 'No reason provided',
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Bulk reject: failed to reject session', {
          sessionId: uploadSession.uploadSessionId,
          error: error.message,
        });
        skipped.push({
          id: uploadSession.uploadSessionId,
          reason: `Rejection error: ${error.message}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      rejected: rejected.length,
      skipped: skipped.length,
      rejectedIds: rejected,
      skippedDetails: skipped,
      message: `Rejected ${rejected.length} upload(s).${skipped.length > 0 ? ` Skipped ${skipped.length} (see skippedDetails).` : ''}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to bulk reject upload sessions', { error });
    return NextResponse.json(
      { error: 'Failed to bulk reject upload sessions' },
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
