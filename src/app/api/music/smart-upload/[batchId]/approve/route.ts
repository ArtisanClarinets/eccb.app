/**
 * Smart Upload Approve API Route
 *
 * Approve proposals and enqueue ingestion.
 * - POST /api/music/smart-upload/[batchId]/approve
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import {
  getBatch,
  getBatchWithItems,
  approveProposal,
  updateProposal,
  updateBatchStatus,
} from '@/lib/services/smart-upload/smart-upload.service';
import { MUSIC_SMART_UPLOAD_APPROVE } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { addJob } from '@/lib/jobs/queue';
import { SMART_UPLOAD_JOBS, type SmartUploadIngestPayload } from '@/lib/jobs/definitions';
import { SmartUploadStatus } from '@prisma/client';

// =============================================================================
// Validation Schemas
// =============================================================================

const approveProposalSchema = z.object({
  proposals: z.array(z.object({
    id: z.string().cuid(),
    corrections: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
});

// =============================================================================
// POST /api/music/smart-upload/[batchId]/approve
// Approve proposals and enqueue ingestion
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

  // Check for approve permission (higher privilege required)
  const hasApprovePermission = await checkUserPermission(session.user.id, MUSIC_SMART_UPLOAD_APPROVE);
  if (!hasApprovePermission) {
    logger.warn('Smart Upload approve denied: missing approve permission', {
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: 'Forbidden: Smart Upload approval permission required' },
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

    // Check batch status - must be NEEDS_REVIEW
    if (batch.status !== SmartUploadStatus.NEEDS_REVIEW) {
      return NextResponse.json(
        { error: 'Batch is not in review status', code: 'INVALID_BATCH_STATUS' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const validationResult = approveProposalSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { proposals } = validationResult.data;

    // Verify proposals belong to this batch and are not already approved
    const proposalIds = proposals.map(p => p.id);
    const existingProposals = await prisma.smartUploadProposal.findMany({
      where: {
        id: { in: proposalIds },
        batchId,
      },
    });

    if (existingProposals.length !== proposalIds.length) {
      return NextResponse.json(
        { error: 'One or more proposals not found in this batch' },
        { status: 400 }
      );
    }

    // Check for already approved proposals
    const alreadyApproved = existingProposals.filter(p => p.isApproved);
    if (alreadyApproved.length > 0) {
      return NextResponse.json(
        { error: 'One or more proposals are already approved' },
        { status: 400 }
      );
    }

    // Process each proposal
    for (const proposalInput of proposals) {
      const proposal = existingProposals.find(p => p.id === proposalInput.id);
      if (!proposal) continue;

      // Apply corrections if provided
      if (proposalInput.corrections && Object.keys(proposalInput.corrections).length > 0) {
        await updateProposal(proposalInput.id, proposalInput.corrections);
      }

      // Approve the proposal
      await approveProposal(proposalInput.id, session.user.id);
    }

    // Get updated batch to check if all proposals are approved
    const result = await getBatchWithItems(batchId);
    if (!result) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const allApproved = result.proposals.every(p => p.isApproved);

    if (allApproved) {
      // All proposals approved - enqueue ingestion job
      const ingestPayload: SmartUploadIngestPayload = {
        batchId,
        approvedBy: session.user.id,
      };

      const job = await addJob(SMART_UPLOAD_JOBS.INGEST, ingestPayload);

      logger.info('Enqueued ingestion job after approval', {
        batchId,
        approvedBy: session.user.id,
        jobId: job.id,
      });

      // Update batch status to INGESTING
      await updateBatchStatus(batchId, SmartUploadStatus.INGESTING);

      return NextResponse.json({
        success: true,
        jobId: job.id,
        message: 'Proposals approved. Ingestion job enqueued.',
      });
    }

    // Not all proposals approved yet
    const approvedCount = result.proposals.filter(p => p.isApproved).length;
    const totalCount = result.proposals.length;

    return NextResponse.json({
      success: true,
      message: `Approved ${approvedCount} of ${totalCount} proposals`,
      remaining: totalCount - approvedCount,
    });
  } catch (error) {
    logger.error('Failed to approve Smart Upload proposals', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to approve proposals' },
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
