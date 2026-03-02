/**
 * /api/stand/setlists
 *
 * GET    — list setlists owned by current user
 * POST   — create a new setlist
 * PUT    — update setlist name/description/items (owner or director)
 * DELETE — delete a setlist (owner or director)
 *
 * StandSetlist schema: id, userId, name, description?, isDefault, createdAt, updatedAt
 * StandSetlistItem:    id, setlistId, pieceId, sortOrder, notes?
 * (No eventId or isPublic fields in this schema)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { requireStandAccess } from '@/lib/stand/access';
import {
  jsonOk,
  json403,
  json404,
  json500,
  parseBody,
  cuidSchema,
} from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const setlistItemSchema = z.object({
  pieceId: cuidSchema,
  sortOrder: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});

const createSetlistSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  items: z.array(setlistItemSchema).max(200).default([]),
});

const updateSetlistSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  items: z.array(setlistItemSchema).max(200).optional(),
});

const deleteSetlistSchema = z.object({
  id: cuidSchema,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FormattedSetlist = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  ownerId: string;
  pieces: {
    id: string;
    title: string;
    composer: string | null;
    sortOrder: number;
    notes: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
};

async function formatSetlist(setlistId: string): Promise<FormattedSetlist | null> {
  const s = await prisma.standSetlist.findUnique({
    where: { id: setlistId },
    include: {
      items: {
        include: {
          piece: { select: { id: true, title: true, composer: { select: { fullName: true } } } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    isDefault: s.isDefault,
    ownerId: s.userId,
    pieces: s.items.map((i) => ({
      id: i.pieceId,
      title: i.piece.title,
      composer: i.piece.composer?.fullName ?? null,
      sortOrder: i.sortOrder,
      notes: i.notes ?? null,
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// ─── GET /api/stand/setlists ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const setlists = await prisma.standSetlist.findMany({
      where: { userId: ctx.userId },
      include: {
        items: {
          include: {
            piece: { select: { id: true, title: true, composer: { select: { fullName: true } } } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jsonOk(
      setlists.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        isDefault: s.isDefault,
        ownerId: s.userId,
        pieces: s.items.map((i) => ({
          id: i.pieceId,
          title: i.piece.title,
          composer: i.piece.composer?.fullName ?? null,
          sortOrder: i.sortOrder,
          notes: i.notes ?? null,
        })),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('[Setlists GET]', error);
    return json500();
  }
}

// ─── POST /api/stand/setlists ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = await parseBody(request, createSetlistSchema);
    if (parsed instanceof Response) return parsed;

    const { name, description, items } = parsed;

    const setlist = await prisma.standSetlist.create({
      data: {
        userId: ctx.userId,
        name,
        description: description ?? null,
        items: {
          create: items.map((item) => ({
            pieceId: item.pieceId,
            sortOrder: item.sortOrder,
            notes: item.notes ?? null,
          })),
        },
      },
    });

    const formatted = await formatSetlist(setlist.id);
    return jsonOk({ setlist: formatted }, 201);
  } catch (error) {
    console.error('[Setlists POST]', error);
    return json500();
  }
}

// ─── PUT /api/stand/setlists ──────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = await parseBody(request, updateSetlistSchema);
    if (parsed instanceof Response) return parsed;

    const { id, name, description, items } = parsed;

    // Verify ownership
    const existing = await prisma.standSetlist.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return json404('Setlist not found');
    if (existing.userId !== ctx.userId && !ctx.isDirector) return json403('Cannot edit this setlist');

    const updated = await prisma.standSetlist.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(items !== undefined
          ? {
              items: {
                deleteMany: {},
                create: items.map((item) => ({
                  pieceId: item.pieceId,
                  sortOrder: item.sortOrder,
                  notes: item.notes ?? null,
                })),
              },
            }
          : {}),
      },
    });

    const formatted = await formatSetlist(updated.id);
    return jsonOk({ setlist: formatted });
  } catch (error) {
    console.error('[Setlists PUT]', error);
    return json500();
  }
}

// ─── DELETE /api/stand/setlists ───────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = await parseBody(request, deleteSetlistSchema);
    if (parsed instanceof Response) return parsed;

    const { id } = parsed;

    const existing = await prisma.standSetlist.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return json404('Setlist not found');
    if (existing.userId !== ctx.userId && !ctx.isDirector) return json403('Cannot delete this setlist');

    await prisma.standSetlist.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (error) {
    console.error('[Setlists DELETE]', error);
    return json500();
  }
}
