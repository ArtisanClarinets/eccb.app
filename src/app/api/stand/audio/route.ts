/**
 * /api/stand/audio
 *
 * GET  — list audio links for a piece (requires stand access + piece access)
 * POST — create audio link (director/librarian only)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { requireStandAccess, canAccessPiece } from '@/lib/stand/access';
import { jsonOk, json400, json403, json404, json500, parseBody, cuidSchema } from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const audioCreateSchema = z.object({
  pieceId: cuidSchema,
  fileKey: z.string().min(1).max(500),
  url: z.string().url().max(2000).nullable().optional(),
  description: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');
    if (!pieceId) return json400('pieceId query param required');

    // Verify piece access
    const hasAccess = await canAccessPiece(ctx.userId, pieceId);
    if (!hasAccess) return json404('Piece not found');

    const audioLinks = await prisma.audioLink.findMany({
      where: { pieceId },
      orderBy: { createdAt: 'desc' },
    });

    return jsonOk({ audioLinks });
  } catch (error) {
    console.error('[Audio GET]', error);
    return json500();
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    // Director/librarian only
    if (!ctx.isLibrarian) return json403('Only directors or librarians can add audio links');

    const parsed = await parseBody(request, audioCreateSchema);
    if (parsed instanceof Response) return parsed;

    const { pieceId, fileKey, url, description } = parsed;

    // Verify piece exists
    const piece = await prisma.musicPiece.findUnique({ where: { id: pieceId }, select: { id: true } });
    if (!piece) return json400('Piece not found');

    // Either fileKey or url must be non-empty (not both empty)
    if (!fileKey && !url) return json400('Either fileKey or url must be provided');

    const audioLink = await prisma.audioLink.create({
      data: { pieceId, fileKey, url: url ?? null, description: description ?? null },
    });

    return jsonOk({ audioLink }, 201);
  } catch (error) {
    console.error('[Audio POST]', error);
    return json500();
  }
}
