/**
 * Smart Upload Batch API Routes
 *
 * REST API endpoints for individual batch operations.
 * - GET /api/music/smart-upload/[batchId] - Get batch details
 * - PATCH /api/music/smart-upload/[batchId] - Update batch metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import {
  getBatchWithItems,
  getBatch,
} from '@/lib/services/smart-upload/smart-upload.service';
import { MUSIC_SMART_UPLOAD } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isAdmin } from '@/lib/auth/guards';

// =============================================================================
// Validation Schemas
// =============================================================================

const updateBatchSchema = z.object({
  errorSummary: z.string().max(2000).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if user can modify a batch (owner or admin)
 */
async function canModifyBatch(batchId: string, userId: string): Promise<boolean> {
  const batch = await getBatch(batchId);
  if (!batch) return false;

  // Owner can modify
  if (batch.userId === userId) return true;

  // Admins can modify any batch
  const admin = await isAdmin();
  return admin;
}

// =============================================================================
// GET /api/music/smart-upload/[batchId]
// Get batch details with items and proposals
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
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

    // Check if user can access this batch
    const canAccess = await canModifyBatch(batchId, session.user.id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get batch with items and proposals
    const result = await getBatchWithItems(batchId);

    if (!result) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Calculate progress
    const progress = result.batch.totalFiles > 0
      ? Math.round((result.batch.processedFiles / result.batch.totalFiles) * 100)
      : 0;

    // Build response
    const response = {
      batch: {
        id: result.batch.id,
        status: result.batch.status,
        currentStep: result.batch.currentStep,
        totalFiles: result.batch.totalFiles,
        processedFiles: result.batch.processedFiles,
        successFiles: result.batch.successFiles,
        failedFiles: result.batch.failedFiles,
        errorSummary: result.batch.errorSummary,
        createdAt: result.batch.createdAt,
        completedAt: result.batch.completedAt,
      },
      items: result.items.map(item => ({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        status: item.status,
        currentStep: item.currentStep,
        errorMessage: item.errorMessage,
        ocrText: item.ocrText,
        extractedMeta: item.extractedMeta,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
      })),
      proposals: result.proposals.map(proposal => ({
        id: proposal.id,
        itemId: proposal.itemId,
        title: proposal.title,
        composer: proposal.composer,
        arranger: proposal.arranger,
        publisher: proposal.publisher,
        difficulty: proposal.difficulty,
        genre: proposal.genre,
        style: proposal.style,
        instrumentation: proposal.instrumentation,
        duration: proposal.duration,
        notes: proposal.notes,
        titleConfidence: proposal.titleConfidence,
        composerConfidence: proposal.composerConfidence,
        difficultyConfidence: proposal.difficultyConfidence,
        isApproved: proposal.isApproved,
        approvedAt: proposal.approvedAt,
        approvedBy: proposal.approvedBy,
        matchedPieceId: proposal.matchedPieceId,
        isNewPiece: proposal.isNewPiece,
        corrections: proposal.corrections,
        createdAt: proposal.createdAt,
      })),
      progress,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to get Smart Upload batch', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to get batch details' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/music/smart-upload/[batchId]
// Update batch metadata
// =============================================================================

export async function PATCH(
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

    // Check if user can modify this batch
    const canModify = await canModifyBatch(batchId, session.user.id);
    if (!canModify) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const validationResult = updateBatchSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { errorSummary } = validationResult.data;

    // Check if batch exists and is not in terminal state
    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Update batch with errorSummary
    const updatedBatch = await prisma.smartUploadBatch.update({
      where: { id: batchId },
      data: {
        ...(errorSummary !== undefined && { errorSummary }),
      },
    });

    logger.info('Smart Upload batch updated', {
      userId: session.user.id,
      batchId,
      updates: { errorSummary },
    });

    return NextResponse.json({
      batch: {
        id: updatedBatch.id,
        errorSummary: updatedBatch.errorSummary,
        status: updatedBatch.status,
        updatedAt: updatedBatch.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to update Smart Upload batch', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to update batch' },
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
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
