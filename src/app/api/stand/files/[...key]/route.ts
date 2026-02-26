import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { downloadFile } from '@/lib/services/storage';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getUserRoles } from '@/lib/auth/permissions';
import { Readable } from 'stream';

const PRIVILEGED_ROLE_TYPES = ['DIRECTOR', 'SUPER_ADMIN', 'ADMIN', 'STAFF'];

/**
 * Authenticated & event-scoped stand file proxy.
 *
 * Requires:
 *   - Active session (any authenticated user)
 *   - `?eventId=<id>` query param (used to scope the access check)
 *
 * Security checks:
 *   1. The requesting user is a privileged role OR is an active Member
 *   2. The requested storageKey belongs to a PDF file of a piece in the given event
 *
 * Falls back to session-only check when no eventId provided (for backwards
 * compatibility with direct admin / library access).
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

  // If eventId specified, verify the file belongs to that event
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (eventId) {
    const userId = session.user.id;

    // Privileged roles skip the per-event file check
    const roles = await getUserRoles(userId);
    const isPrivileged = roles.some((r) => PRIVILEGED_ROLE_TYPES.includes(r));

    if (!isPrivileged) {
      // Must be an active member
      const member = await prisma.member.findFirst({ where: { userId } });
      if (!member) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Verify the storageKey belongs to a PDF of a piece included in this event
      const eventFile = await prisma.musicFile.findFirst({
        where: {
          storageKey,
          mimeType: 'application/pdf',
          isArchived: false,
          piece: {
            eventMusic: { some: { eventId } },
          },
        },
        select: { id: true },
      });

      // Also check MusicPart storageKey (parts can also be served)
      const eventPart = eventFile
        ? null
        : await prisma.musicPart.findFirst({
            where: {
              storageKey,
              piece: {
                eventMusic: { some: { eventId } },
              },
            },
            select: { id: true },
          });

      if (!eventFile && !eventPart) {
        logger.warn('Stand file proxy: key not in event', { storageKey, eventId, userId });
        return NextResponse.json({ error: 'File not found in this event' }, { status: 403 });
      }
    }
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
    headers.set('Content-Disposition', 'inline');
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

