/**
 * /api/stand/bookmarks
 *
 * GET    — list bookmarks for the current user (sorted by sortOrder)
 * POST   — create/upsert a bookmark for a piece
 * PATCH  — reorder bookmarks
 * DELETE — remove a bookmark by pieceId query param (or all via ?all=true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { requireStandAccess } from '@/lib/stand/access';
import {
  jsonOk,
  json400,
  json404,
  json500,
  parseBody,
  cuidSchema,
} from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createBookmarkSchema = z.object({
  pieceId: cuidSchema,
  sortOrder: z.number().int().min(0).default(0),
});

const reorderSchema = z.object({
  ids: z.array(cuidSchema).min(1).max(500),
});

// ─── GET /api/stand/bookmarks ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const bookmarks = await prisma.standBookmark.findMany({
      where: { userId: ctx.userId },
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

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = await parseBody(request, createBookmarkSchema);
    if (parsed instanceof Response) return parsed;

    const piece = await prisma.musicPiece.findUnique({
      where: { id: parsed.pieceId },
      select: { id: true },
    });
    if (!piece) return json404('Piece not found');

    const bookmark = await prisma.standBookmark.upsert({
      where: { userId_pieceId: { userId: ctx.userId, pieceId: parsed.pieceId } },
      update: { sortOrder: parsed.sortOrder },
      create: { userId: ctx.userId, pieceId: parsed.pieceId, sortOrder: parsed.sortOrder },
    });

    return jsonOk(
      { id: bookmark.id, pieceId: bookmark.pieceId, sortOrder: bookmark.sortOrder, createdAt: bookmark.createdAt.toISOString() },
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

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = await parseBody(request, reorderSchema);
    if (parsed instanceof Response) return parsed;

    await prisma.$transaction(
      parsed.ids.map((id, index) =>
        prisma.standBookmark.updateMany({
          where: { id, userId: ctx.userId },
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

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');
    if (!pieceId) return json400('pieceId query parameter required');

    await prisma.standBookmark.deleteMany({ where: { userId: ctx.userId, pieceId } });

    return jsonOk({ success: true });
  } catch (error) {
    console.error('[Bookmarks DELETE]', error);
    return json500();
  }
}
