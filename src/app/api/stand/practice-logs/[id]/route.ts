/**
 * /api/stand/practice-logs/[id]
 *
 * GET    — get a single practice log entry
 * PUT    — update a practice log entry (owner only)
 * DELETE — delete a practice log entry (owner or director)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { requireStandAccess } from '@/lib/stand/access';
import { getStandSettings } from '@/lib/stand/settings';
import { jsonOk, json400, json403, json404, json500, parseBody } from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  durationSeconds: z.number().int().positive().max(86_400).optional(),
  notes: z.string().max(2000).nullable().optional(),
  practicedAt: z.string().datetime().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const { id } = await params;
    const log = await prisma.practiceLog.findUnique({
      where: { id },
      include: { piece: { select: { id: true, title: true } } },
    });

    if (!log) return json404();
    if (log.userId !== ctx.userId && !ctx.isDirector) return json404();

    return jsonOk({ log });
  } catch (error) {
    console.error('[PracticeLog GET]', error);
    return json500();
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const settings = await getStandSettings();
    if (!settings.practiceTrackingEnabled) return json404('Practice tracking is disabled');

    const { id } = await params;
    const log = await prisma.practiceLog.findUnique({ where: { id } });
    if (!log) return json404();
    if (log.userId !== ctx.userId) return json403('Only log owner can update');

    const parsed = await parseBody(request, updateSchema);
    if (parsed instanceof Response) return parsed;

    const updated = await prisma.practiceLog.update({
      where: { id },
      data: {
        ...(parsed.durationSeconds !== undefined ? { durationSeconds: parsed.durationSeconds } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
        ...(parsed.practicedAt !== undefined ? { practicedAt: new Date(parsed.practicedAt) } : {}),
      },
    });

    return jsonOk({ log: updated });
  } catch (error) {
    console.error('[PracticeLog PUT]', error);
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
    const log = await prisma.practiceLog.findUnique({ where: { id } });
    if (!log) return json404();
    if (log.userId !== ctx.userId && !ctx.isDirector) return json403('Only owner or director can delete');

    await prisma.practiceLog.delete({ where: { id } });
    return jsonOk({ success: true });
  } catch (error) {
    console.error('[PracticeLog DELETE]', error);
    return json500();
  }
}
