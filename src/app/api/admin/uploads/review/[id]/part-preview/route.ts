import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { downloadFile } from '@/lib/services/storage';
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import { logger } from '@/lib/logger';
import { PDFDocument } from 'pdf-lib';
import type { DownloadResult } from '@/lib/services/storage';

// =============================================================================
// GET /api/admin/uploads/review/[id]/part-preview
//
// Returns a base64-encoded PNG of the specified page of a parsed part PDF from
// the SmartUploadSession. The part storage key must belong to the session's
// parsedParts JSON. Supports pagination via ?page=N query parameter (0-indexed,
// defaults to 0).
// =============================================================================

interface ParsedPart {
  storageKey?: string;
  [key: string]: unknown;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPerm = await checkUserPermission(session.user.id, 'music:read');
    if (!hasPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Parse query parameters
    const url = new URL(req.url);
    const partStorageKeyEncoded = url.searchParams.get('partStorageKey');
    const pageParam = url.searchParams.get('page');

    if (!partStorageKeyEncoded) {
      return NextResponse.json(
        { error: 'partStorageKey query parameter is required' },
        { status: 400 }
      );
    }

    // Decode the part storage key (URL-encoded)
    const partStorageKey = decodeURIComponent(partStorageKeyEncoded);

    // Parse page parameter (0-indexed, default to 0)
    const pageIndex = pageParam ? parseInt(pageParam, 10) : 0;

    if (isNaN(pageIndex) || pageIndex < 0) {
      return NextResponse.json(
        { error: 'Invalid page parameter. Must be a non-negative integer.' },
        { status: 400 }
      );
    }

    // Look up the upload session
    const uploadSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: id },
    });

    if (!uploadSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse parsedParts JSON and verify the part storage key belongs to this session
    let parsedParts: ParsedPart[] = [];
    if (uploadSession.parsedParts) {
      try {
        parsedParts = uploadSession.parsedParts as ParsedPart[];
      } catch {
        logger.warn('Failed to parse parsedParts JSON', {
          sessionId: id,
        });
      }
    }

    // Check if the provided partStorageKey belongs to this session
    const partExists = parsedParts.some((part) => part.storageKey === partStorageKey);

    if (!partExists) {
      logger.warn('Part storage key not found in session', {
        sessionId: id,
        partStorageKey,
      });
      return NextResponse.json(
        { error: 'Part not found in session' },
        { status: 404 }
      );
    }

    // Download the part PDF from storage
    let pdfBuffer: Buffer;
    const downloadResult = await downloadFile(partStorageKey);

    if (typeof downloadResult === 'string') {
      // S3 signed URL — fetch the bytes
      const res = await fetch(downloadResult);
      if (!res.ok) {
        throw new Error(`Failed to download PDF from storage: ${res.status}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    } else {
      // Local stream — collect into buffer
      pdfBuffer = await streamToBuffer((downloadResult as DownloadResult).stream);
    }

    // Get total page count using pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();

    // Validate requested page index
    if (pageIndex >= totalPages) {
      return NextResponse.json(
        {
          error: 'Page out of range',
          detail: `Requested page ${pageIndex} but PDF has ${totalPages} page(s) (0-${totalPages - 1}).`,
        },
        { status: 400 }
      );
    }

    // Render requested page to PNG base64
    const imageBase64 = await renderPdfToImage(pdfBuffer, {
      pageIndex: pageIndex,
      quality: 85,
      maxWidth: 1200,
      format: 'png',
    });

    logger.info('Part PDF preview generated', {
      sessionId: id,
      partStorageKey,
      pageIndex,
      totalPages,
      imageLength: imageBase64.length,
    });

    return NextResponse.json({ imageBase64, totalPages });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to generate part PDF preview', { error: err.message });
    return NextResponse.json(
      { error: 'Failed to generate preview', detail: err.message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const c = chunk as Buffer | string;
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
