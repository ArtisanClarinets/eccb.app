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

    // Optimization: Bulk query MusicFile to identify already committed sessions
    const committedFiles = await prisma.musicFile.findMany({
      where: {
        originalUploadId: { in: uploadSessions.map((s) => s.uploadSessionId) },
      },
      select: { originalUploadId: true },
    });

    const committedSessionIds = new Set(
      committedFiles.map((f) => f.originalUploadId).filter((id): id is string => !!id)
    );

    const toReject = uploadSessions.filter((s) => !committedSessionIds.has(s.uploadSessionId));
    const rejected: string[] = toReject.map((s) => s.uploadSessionId);
    const skipped: { id: string; reason: string }[] = uploadSessions
      .filter((s) => committedSessionIds.has(s.uploadSessionId))
      .map((s) => ({
        id: s.uploadSessionId,
        reason: 'Session has already been committed to the library',
      }));

    if (toReject.length > 0) {
      // Optimization: Batch update all eligible sessions
      await prisma.smartUploadSession.updateMany({
        where: {
          uploadSessionId: { in: rejected },
        },
        data: {
          status: 'REJECTED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          routingDecision: reason ? `REJECTED: ${reason}` : 'REJECTED',
        },
      });

      // Parallelize cleanup and logging (off the critical path for DB locks)
      // Note: cleanupSmartUploadTempFiles handles its own internal DB work and errors
      await Promise.all(
        rejected.map(async (sessionId) => {
          try {
            await cleanupSmartUploadTempFiles(sessionId);
            logger.info('Smart upload rejected (bulk)', {
              sessionId,
              userId: session.user.id,
              reason: reason ?? 'No reason provided',
            });
          } catch (cleanupErr) {
            logger.warn('Failed to clean up temp files after bulk rejection', {
              sessionId,
              error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          }
        })
      );
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
