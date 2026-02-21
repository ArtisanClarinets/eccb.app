/**
 * Smart Upload API Routes
 *
 * REST API endpoints for Smart Upload feature.
 * - POST /api/music/smart-upload - Create a new batch
 * - GET /api/music/smart-upload - List user's batches
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import { createBatch, listUserBatches, getBatch } from '@/lib/services/smart-upload/smart-upload.service';
import { MUSIC_SMART_UPLOAD } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isAdmin } from '@/lib/auth/guards';
import { isSmartUploadEnabled } from '@/lib/services/smart-upload-settings';

// =============================================================================
// Validation Schemas
// =============================================================================

const createBatchSchema = z.object({
  // Currently no fields needed - batch is created with defaults
});

const listBatchesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  status: z.enum(['CREATED', 'UPLOADING', 'PROCESSING', 'NEEDS_REVIEW', 'INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED']).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if user can access a batch (owner or admin)
 */
async function canAccessBatch(batchId: string, userId: string): Promise<boolean> {
  const batch = await getBatch(batchId);
  if (!batch) return false;

  // Owner can always access
  if (batch.userId === userId) return true;

  // Admins can access any batch
  const admin = await isAdmin();
  return admin;
}

/**
 * Check if feature is enabled (database with env fallback)
 */
async function checkFeatureEnabled(): Promise<boolean> {
  const dbEnabled = await isSmartUploadEnabled();
  return dbEnabled ?? env.SMART_UPLOAD_ENABLED;
}

// =============================================================================
// POST /api/music/smart-upload
// Create a new Smart Upload batch
// =============================================================================

export async function POST(request: NextRequest) {
  // Apply rate limiting - 10 batches per hour per user
  const rateLimitResponse = await applyRateLimit(request, 'upload');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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

  // Check feature flag from database (with fallback to env)
  const isFeatureEnabled = await checkFeatureEnabled();
  if (!isFeatureEnabled) {
    logger.warn('Smart Upload access denied: feature disabled', {
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: 'Feature not available', code: 'FEATURE_DISABLED' },
      { status: 403 }
    );
  }

  // Check permission
  const hasPermission = await checkUserPermission(session.user.id, MUSIC_SMART_UPLOAD);
  if (!hasPermission) {
    logger.warn('Smart Upload denied: missing permission', { userId: session.user.id });
    return NextResponse.json(
      { error: 'Forbidden: Smart Upload permission required' },
      { status: 403 }
    );
  }

  try {
    // Parse request body
    const body = await request.json();
    const validationResult = createBatchSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Check user's recent batch creation rate (max 10 per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentBatchCount = await prisma.smartUploadBatch.count({
      where: {
        userId: session.user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentBatchCount >= 10) {
      logger.warn('Rate limit exceeded: too many batches', {
        userId: session.user.id,
        recentCount: recentBatchCount,
      });
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 batches per hour.' },
        { status: 429 }
      );
    }

    // Create the batch
    const batch = await createBatch(session.user.id);

    logger.info('Smart Upload batch created', {
      userId: session.user.id,
      batchId: batch.id,
    });

    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      message: 'Batch created successfully. Use the upload endpoint to add files.',
    });
  } catch (error) {
    logger.error('Failed to create Smart Upload batch', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET /api/music/smart-upload
// List user's batches
// =============================================================================

export async function GET(request: NextRequest) {
  // Check authentication
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check feature flag from database (with fallback to env)
  const isFeatureEnabled = await checkFeatureEnabled();
  if (!isFeatureEnabled) {
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
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      limit: searchParams.get('limit') || '20',
      offset: searchParams.get('offset') || '0',
      status: searchParams.get('status') || undefined,
    };

    const queryValidation = listBatchesQuerySchema.safeParse(queryParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryValidation.error.flatten() },
        { status: 400 }
      );
    }

    const { limit, offset, status } = queryValidation.data;

    // Check if user is admin (can see all batches)
    const admin = await isAdmin();

    // Build query - initialize with proper type
    const baseWhere = admin && !status
      ? {} // Admins see all if no status filter
      : { userId: session.user.id }; // Regular users see only their own

    // Add status filter if provided
    const where = status
      ? { ...baseWhere, status } as { userId: string; status: string }
      : baseWhere;

    // Get batches with pagination
    const [batches, total] = await Promise.all([
      prisma.smartUploadBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          status: true,
          currentStep: true,
          totalFiles: true,
          processedFiles: true,
          successFiles: true,
          failedFiles: true,
          createdAt: true,
          completedAt: true,
          errorSummary: true,
        },
      }),
      prisma.smartUploadBatch.count({ where }),
    ]);

    const hasMore = offset + batches.length < total;

    return NextResponse.json({
      batches,
      total,
      hasMore,
    });
  } catch (error) {
    logger.error('Failed to list Smart Upload batches', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to list batches' },
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
