import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { MUSIC_VIEW_ALL } from '@/lib/auth/permission-constants';
import { logger } from '@/lib/logger';
import type { ParsedPartRecord, CuttingInstruction, ParseStatus, SecondPassStatus } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

interface ExtractedMetadata {
  title: string;
  composer?: string;
  arranger?: string;
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
// GET /api/admin/uploads/review - List sessions for review
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission using canonical constant
    await requirePermission(MUSIC_VIEW_ALL);

    // Get search params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'PENDING_REVIEW';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    // Build where clause — default to exception sessions (PENDING_REVIEW)
    const where = {
      status: status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    };

    // Fetch sessions with pagination
    const [sessions, totalCount] = await Promise.all([
      prisma.smartUploadSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.smartUploadSession.count({ where }),
    ]);

    // Transform sessions to include extracted metadata and new fields
    const transformedSessions = sessions.map((s) => ({
      id: s.uploadSessionId,
      fileName: s.fileName,
      fileSize: s.fileSize,
      mimeType: s.mimeType,
      storageKey: s.storageKey,
      confidenceScore: s.confidenceScore,
      status: s.status,
      uploadedBy: s.uploadedBy,
      reviewedBy: s.reviewedBy,
      reviewedAt: s.reviewedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      extractedMetadata: s.extractedMetadata as ExtractedMetadata | null,
      parsedParts: s.parsedParts as ParsedPartRecord[] | null,
      parseStatus: s.parseStatus as ParseStatus | null,
      secondPassStatus: s.secondPassStatus as SecondPassStatus | null,
      autoApproved: s.autoApproved,
      cuttingInstructions: s.cuttingInstructions as CuttingInstruction[] | null,
      requiresHumanReview: s.requiresHumanReview,
      routingDecision: s.routingDecision,
    }));

    // Get counts by status
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.smartUploadSession.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.smartUploadSession.count({ where: { status: 'APPROVED' } }),
      prisma.smartUploadSession.count({ where: { status: 'REJECTED' } }),
    ]);

    return NextResponse.json({
      sessions: transformedSessions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch upload sessions', { error });
    return NextResponse.json(
      { error: 'Failed to fetch upload sessions' },
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
