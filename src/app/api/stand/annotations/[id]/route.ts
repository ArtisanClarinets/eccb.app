/**
 * /api/stand/annotations/[id]
 *
 * PUT    — update annotation (owner or director only)
 * DELETE — delete annotation (owner or director only)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { requireStandAccess, assertCanWriteLayer } from '@/lib/stand/access';
import { getStandSettings } from '@/lib/stand/settings';
import {
  jsonOk,
  json400,
  json404,
  json403,
  json500,
  parseBody,
  layerSchema,
} from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const annotationUpdateSchema = z.object({
  strokeData: z.record(z.string(), z.unknown()).optional(),
  layer: layerSchema.optional(),
  sectionId: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const { id } = await params;

    const existing = await prisma.annotation.findUnique({ where: { id } });
    if (!existing) return json404('Annotation not found');

    const isOwner = existing.userId === ctx.userId;
    if (!isOwner && !ctx.isDirector) return json403('Only owner or director can update');

    const parsed = await parseBody(request, annotationUpdateSchema);
    if (parsed instanceof Response) return parsed;

    const { strokeData, layer, sectionId } = parsed;

    // Layer change enforcement
    const targetLayer = layer ?? (existing.layer as 'PERSONAL' | 'SECTION' | 'DIRECTOR');
    const layerErr = assertCanWriteLayer(ctx, targetLayer, sectionId ?? existing.sectionId);
    if (layerErr) return layerErr;

    // Stroke data size check
    if (strokeData) {
      const settings = await getStandSettings();
      const strokeJson = JSON.stringify(strokeData);
      if (strokeJson.length > settings.maxStrokeDataBytes) {
        return json400(`Stroke data exceeds limit (${settings.maxStrokeDataBytes} bytes)`);
      }
    }

    // Build update data explicitly to satisfy Prisma v7 strict union types
    const updateData: {
      strokeData?: unknown;
      layer?: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
      sectionId?: string | null;
    } = {};
    if (strokeData !== undefined) updateData.strokeData = strokeData;
    if (layer !== undefined) {
      updateData.layer = layer;
      updateData.sectionId = layer === 'SECTION' ? (sectionId ?? ctx.userSectionIds[0] ?? null) : null;
    }

    const updated = await prisma.annotation.update({
      where: { id },
      data: updateData as any,
    });

    return jsonOk({ annotation: updated });
  } catch (error) {
    console.error('[Annotation PUT]', error);
    return json500();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const { id } = await params;

    const existing = await prisma.annotation.findUnique({ where: { id } });
    if (!existing) return json404('Annotation not found');

    const isOwner = existing.userId === ctx.userId;
    if (!isOwner && !ctx.isDirector) return json403('Only owner or director can delete');

    await prisma.annotation.delete({ where: { id } });
    return jsonOk({ success: true });
  } catch (error) {
    console.error('[Annotation DELETE]', error);
    return json500();
  }
}
