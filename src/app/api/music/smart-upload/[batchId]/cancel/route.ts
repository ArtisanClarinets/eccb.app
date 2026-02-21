/**
 * Smart Upload Cancel API Route
 *
 * Cancel a batch and cleanup resources.
 * - POST /api/music/smart-upload/[batchId]/cancel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { getBatch, cancelBatch } from '@/lib/services/smart-upload/smart-upload.service';
import { deleteFile } from '@/lib/services/storage';
import { MUSIC_SMART_UPLOAD } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { SmartUploadStatus } from '@prisma/client';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Cleanup uploaded files for a batch
 * NOTE: Intended for future use when implementing async file cleanup
 */
async function _cleanupBatchFiles(batchId: string): Promise<void> {
  // Get all items with storage keys
  const items = await prisma.smartUploadItem.findMany({
    where: { batchId },
    select: { storageKey: true },
  });

  // Delete each file from storage
  for (const item of items) {
    if (item.storageKey) {
      try {
        await deleteFile(item.storageKey);
      } catch (error) {
        logger.warn('Failed to delete file during cleanup', {
          batchId,
          storageKey: item.storageKey,
          error,
        });
      }
    }
  }
}

// =============================================================================
// POST /api/music/smart-upload/[batchId]/cancel
// Cancel batch and cleanup
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  // Validate CSRF
  const csrfResult = validateCSRF(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: 'CSRF validation failed', reason: csrfResult.reason },
      { status: 403 }
    );
  }

  // Check authentication
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check feature flag
  if (!env.SMART_UPLOAD_ENABLED) {
    return NextResponse.json(
      { error: 'Feature not available', code: 'FEATURE_DISABLED' },
      { status: 403 }
    );
  }

  // Check permission
  const hasPermission = await checkUserPermission(session.user.id, MUSIC_SMART_UPLOAD);
  if (!hasPermission) {
    return NextResponse.json(
      { error: 'Forbidden: Smart Upload permission required' },
      { status: 403 }
    );
  }

  try {
    const { batchId } = await params;

    // Get batch
    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Check if user owns the batch OR is an admin
    const { isAdmin } = await import('@/lib/auth/guards');
    const admin = await isAdmin();

    if (batch.userId !== session.user.id && !admin) {
      return NextResponse.json(
        { error: 'Forbidden: Not the batch owner' },
        { status: 403 }
      );
    }

    // Check if batch is already in terminal state
    const terminalStatuses: SmartUploadStatus[] = [
      SmartUploadStatus.COMPLETE,
      SmartUploadStatus.FAILED,
      SmartUploadStatus.CANCELLED,
    ];

    if (terminalStatuses.includes(batch.status)) {
      return NextResponse.json(
        { error: 'Batch is already in terminal state', code: 'INVALID_BATCH_STATUS' },
        { status: 400 }
      );
    }

    // Cancel the batch (updates status and cancels pending items)
    await cancelBatch(batchId);

    // Optionally cleanup files (could be async for performance)
    // For now, we'll just log - actual cleanup can be handled by a background job
    const itemsWithFiles = await prisma.smartUploadItem.count({
      where: {
        batchId,
        storageKey: { not: null },
      },
    });

    if (itemsWithFiles > 0) {
      logger.info('Files remain in storage after cancel', {
        batchId,
        fileCount: itemsWithFiles,
      });
      // TODO: Enqueue cleanup job to delete files asynchronously
    }

    logger.info('Smart Upload batch cancelled', {
      userId: session.user.id,
      batchId,
      previousStatus: batch.status,
    });

    return NextResponse.json({
      success: true,
      message: 'Batch cancelled successfully',
    });
  } catch (error) {
    logger.error('Failed to cancel Smart Upload batch', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to cancel batch' },
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
