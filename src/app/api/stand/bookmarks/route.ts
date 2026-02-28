import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import {
  jsonOk,
  json400,
  json401,
  json404,
  json500,
  parseBody,
  cuidSchema,
} from '@/lib/stand/http';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createBookmarkSchema = z.object({
  pieceId: cuidSchema,
  sortOrder: z.number().int().min(0).default(0),
});

const reorderSchema = z.object({
  /** Array of bookmark IDs in desired order */
  ids: z.array(cuidSchema).min(1).max(500),
});

// ─── GET /api/stand/bookmarks ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const bookmarks = await prisma.standBookmark.findMany({
      where: { userId: session.user.id },
      include: {
        piece: {
          select: {
            id: true,
            title: true,
            composer: { select: { fullName: true } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return jsonOk(
      bookmarks.map((b) => ({
        id: b.id,
        pieceId: b.pieceId,
        title: b.piece.title,
        composer: b.piece.composer?.fullName ?? null,
        sortOrder: b.sortOrder,
        createdAt: b.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('[Bookmarks GET]', error);
    return json500();
  }
}

// ─── POST /api/stand/bookmarks ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const parsed = await parseBody(request, createBookmarkSchema);
    if (parsed instanceof Response) return parsed;

    // Verify piece exists
    const piece = await prisma.musicPiece.findUnique({
      where: { id: parsed.pieceId },
      select: { id: true },
    });
    if (!piece) return json404('Piece not found');

    // Upsert — if already bookmarked, just return it
    const bookmark = await prisma.standBookmark.upsert({
      where: {
        userId_pieceId: {
          userId: session.user.id,
          pieceId: parsed.pieceId,
        },
      },
      update: { sortOrder: parsed.sortOrder },
      create: {
        userId: session.user.id,
        pieceId: parsed.pieceId,
        sortOrder: parsed.sortOrder,
      },
    });

    return jsonOk(
      {
        id: bookmark.id,
        pieceId: bookmark.pieceId,
        sortOrder: bookmark.sortOrder,
        createdAt: bookmark.createdAt.toISOString(),
      },
      201
    );
  } catch (error) {
    console.error('[Bookmarks POST]', error);
    return json500();
  }
}

// ─── PATCH /api/stand/bookmarks (reorder) ────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const parsed = await parseBody(request, reorderSchema);
    if (parsed instanceof Response) return parsed;

    // Batch update sort orders
    await prisma.$transaction(
      parsed.ids.map((id, index) =>
        prisma.standBookmark.updateMany({
          where: { id, userId: session.user.id },
          data: { sortOrder: index },
        })
      )
    );

    return jsonOk({ success: true });
  } catch (error) {
    console.error('[Bookmarks PATCH]', error);
    return json500();
  }
}

// ─── DELETE /api/stand/bookmarks ──────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');
    if (!pieceId) return json400('pieceId query parameter required');

    await prisma.standBookmark.deleteMany({
      where: { userId: session.user.id, pieceId },
    });

    return jsonOk({ success: true });
  } catch (error) {
    console.error('[Bookmarks DELETE]', error);
    return json500();
  }
}
