import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import type { ParsedPartRecord, CuttingInstruction, ParseStatus, SecondPassStatus } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

interface ExtractedMetadata {
  title: string;
  composer?: string;
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
// GET /api/admin/uploads/review - List pending sessions
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - require music:read or music:edit permission
    const hasPermission = await checkUserPermission(session.user.id, 'music:read');
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get search params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'PENDING_REVIEW';

    // Fetch sessions with the specified status
    const sessions = await prisma.smartUploadSession.findMany({
      where: {
        status: status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

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
      // New fields
      parsedParts: s.parsedParts as ParsedPartRecord[] | null,
      parseStatus: s.parseStatus as ParseStatus | null,
      secondPassStatus: s.secondPassStatus as SecondPassStatus | null,
      autoApproved: s.autoApproved,
      cuttingInstructions: s.cuttingInstructions as CuttingInstruction[] | null,
    }));

    // Get counts by status
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.smartUploadSession.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.smartUploadSession.count({ where: { status: 'APPROVED' } }),
      prisma.smartUploadSession.count({ where: { status: 'REJECTED' } }),
    ]);

    return NextResponse.json({
      sessions: transformedSessions,
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
