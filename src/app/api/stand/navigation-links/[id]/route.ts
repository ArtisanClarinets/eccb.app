/**
 * /api/stand/navigation-links/[id]
 *
 * PUT    — update navigation link (director only)
 * DELETE — delete navigation link (director only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStandAccess } from '@/lib/stand/access';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const navigationLinkUpdateSchema = z.object({
  fromPage: z.number().int().positive().optional(),
  fromX: z.number().optional(),
  fromY: z.number().optional(),
  toPage: z.number().int().positive().optional(),
  toMusicId: z.string().nullable().optional(),
  toX: z.number().optional(),
  toY: z.number().optional(),
  label: z.string().max(200).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.isLibrarian) {
      return NextResponse.json({ error: 'Forbidden: librarians only' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = navigationLinkUpdateSchema.parse(body);

    const existing = await prisma.navigationLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Navigation link not found' }, { status: 404 });

    const navigationLink = await prisma.navigationLink.update({
      where: { id },
      data: {
        ...(validated.fromPage !== undefined && { fromPage: validated.fromPage }),
        ...(validated.fromX !== undefined && { fromX: validated.fromX }),
        ...(validated.fromY !== undefined && { fromY: validated.fromY }),
        ...(validated.toPage !== undefined && { toPage: validated.toPage }),
        ...(validated.toMusicId !== undefined && { toMusicId: validated.toMusicId }),
        ...(validated.toX !== undefined && { toX: validated.toX }),
        ...(validated.toY !== undefined && { toY: validated.toY }),
        ...(validated.label !== undefined && { label: validated.label }),
      },
    });

    return NextResponse.json({ navigationLink });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 });
    }
    console.error('[NavLinks [id] PUT]', error);
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
      return NextResponse.json({ error: 'Forbidden: librarians only' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.navigationLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Navigation link not found' }, { status: 404 });

    await prisma.navigationLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[NavLinks [id] DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
