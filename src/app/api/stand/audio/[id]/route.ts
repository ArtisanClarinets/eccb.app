/**
 * /api/stand/audio/[id]
 *
 * PUT    — update audio link (director/librarian only)
 * DELETE — delete audio link (director/librarian only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStandAccess } from '@/lib/stand/access';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const audioUpdateSchema = z.object({
  url: z.string().url().max(2000).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  fileKey: z.string().min(1).max(500).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.isLibrarian) {
      return NextResponse.json({ error: 'Forbidden: directors or librarians only' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = audioUpdateSchema.parse(body);

    const existing = await prisma.audioLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Audio link not found' }, { status: 404 });

    const audioLink = await prisma.audioLink.update({
      where: { id },
      data: {
        ...(validated.url !== undefined && { url: validated.url }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.fileKey !== undefined && { fileKey: validated.fileKey }),
      },
    });

    return NextResponse.json({ audioLink });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 });
    }
    console.error('[Audio [id] PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.isLibrarian) {
      return NextResponse.json({ error: 'Forbidden: directors or librarians only' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.audioLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Audio link not found' }, { status: 404 });

    await prisma.audioLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Audio [id] DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
