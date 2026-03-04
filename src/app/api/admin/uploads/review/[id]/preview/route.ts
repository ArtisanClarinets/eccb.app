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
// GET /api/admin/uploads/review/[id]/preview
//
// Returns a base64-encoded PNG of the specified page of the uploaded PDF so that
// admins can visually verify the extracted metadata without leaving the review
// dialog.  The image is rendered on-demand server-side using pdf-renderer.
// Supports pagination via ?page=N query parameter (0-indexed, defaults to 0).
// =============================================================================

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

    // Parse page query parameter (0-indexed, default to 0)
    const url = new URL(req.url);
    const pageParam    = url.searchParams.get('page');
    const scaleParam   = url.searchParams.get('scale');
    const maxWidthParam = url.searchParams.get('maxWidth');

    const pageIndex = pageParam ? parseInt(pageParam, 10) : 0;
    const renderScale   = scaleParam    ? Math.min(6, Math.max(1, parseFloat(scaleParam)))    : 3;
    const renderMaxWidth = maxWidthParam ? Math.min(4000, Math.max(800, parseInt(maxWidthParam, 10))) : 2000;

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

    // Download PDF bytes from storage
    let pdfBuffer: Buffer;
    const downloadResult = await downloadFile(uploadSession.storageKey);

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
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
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

    // Render requested page to JPEG base64 at the requested scale
    const imageBase64 = await renderPdfToImage(pdfBuffer, {
      pageIndex,
      quality: 90,
      maxWidth: renderMaxWidth,
      format: 'jpeg',
      scale: renderScale,
    });

    const mimeType = 'image/jpeg';

    logger.info('PDF preview generated', {
      sessionId: id,
      pageIndex,
      totalPages,
      renderScale,
      renderMaxWidth,
      imageLength: imageBase64.length,
    });

    return NextResponse.json(
      { imageBase64, totalPages, mimeType },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } }
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to generate PDF preview', { error: err.message });
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
