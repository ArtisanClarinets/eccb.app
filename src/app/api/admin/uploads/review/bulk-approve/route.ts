import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// =============================================================================
// Validation Schema
// =============================================================================

const bulkApproveSchema = z.object({
  sessionIds: z.array(z.string()).min(1, 'At least one session ID is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// =============================================================================
// POST /api/admin/uploads/review/bulk-approve - Bulk approve
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - require music:create permission
    await requirePermission('music:create');

    // Parse request body
    const body = await request.json();
    const validatedData = bulkApproveSchema.parse(body);

    const { sessionIds, metadata } = validatedData;

    // Find all sessions
    const sessions = await prisma.smartUploadSession.findMany({
      where: {
        uploadSessionId: { in: sessionIds },
        status: 'PENDING_REVIEW',
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: 'No pending sessions found for the provided IDs' },
        { status: 400 }
      );
    }

    // Update all sessions to APPROVED
    const now = new Date();
    const updateResults = await prisma.smartUploadSession.updateMany({
      where: {
        uploadSessionId: { in: sessionIds },
        status: 'PENDING_REVIEW',
      },
      data: {
        status: 'APPROVED',
        reviewedBy: session.user.id,
        reviewedAt: now,
      },
    });

    logger.info('Bulk approve completed', {
      userId: session.user.id,
      requestedCount: sessionIds.length,
      approvedCount: updateResults.count,
    });

    return NextResponse.json({
      success: true,
      approved: updateResults.count,
      message: `Successfully approved ${updateResults.count} uploads`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to bulk approve upload sessions', { error });
    return NextResponse.json(
      { error: 'Failed to bulk approve upload sessions' },
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
