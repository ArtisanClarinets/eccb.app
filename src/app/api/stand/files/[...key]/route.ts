import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { downloadFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';
import { Readable } from 'stream';

/**
 * Authenticated stand file proxy.
 *
 * The stand page (`page.tsx`) already verified event access before rendering,
 * so this route only needs to confirm the user has an active session.
 * Files are streamed inline (not as download attachments) for the PDF viewer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const storageKey = decodeURIComponent(key.join('/'));

  // Reject path traversal
  if (storageKey.includes('..') || storageKey.includes('\0')) {
    logger.warn('Stand file proxy: invalid key', { storageKey });
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    const result = await downloadFile(storageKey);

    // S3 — redirect to presigned URL
    if (typeof result === 'string') {
      return NextResponse.redirect(result);
    }

    // Local — stream inline
    const { stream, metadata } = result;
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream;

    const headers = new Headers();
    headers.set('Content-Type', metadata.contentType);
    headers.set('Content-Length', String(metadata.size));
    // Inline display for PDF viewer, no attachment header
    headers.set('Content-Disposition', 'inline');
    // Allow aggressive caching — PDF content doesn't change
    headers.set('Cache-Control', 'private, max-age=86400, immutable');

    return new Response(webStream, { status: 200, headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'File not found') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    logger.error('Stand file proxy error', { error, storageKey });
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 });
  }
}
