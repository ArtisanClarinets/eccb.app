import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
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

    // Check permission - require music:edit permission
    await requirePermission('music:edit');

    const { id } = await params;

    // Parse request body
    const body = await request.json();
    const validatedData = rejectSchema.parse(body);

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

    // Update the session status to REJECTED
    const updatedSession = await prisma.smartUploadSession.update({
      where: { uploadSessionId: id },
      data: {
        status: 'REJECTED',
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      },
    });

    logger.info('Smart upload rejected', {
      sessionId: id,
      userId: session.user.id,
      reason: validatedData.reason,
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
