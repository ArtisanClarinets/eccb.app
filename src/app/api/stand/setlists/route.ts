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
  json500,
  parseBody,
  cuidSchema,
} from '@/lib/stand/http';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSetlistSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().default(false),
  items: z
    .array(
      z.object({
        pieceId: cuidSchema,
        sortOrder: z.number().int().min(0),
        notes: z.string().max(500).optional(),
      })
    )
    .max(200)
    .default([]),
});

const updateSetlistSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isDefault: z.boolean().optional(),
  items: z
    .array(
      z.object({
        pieceId: cuidSchema,
        sortOrder: z.number().int().min(0),
        notes: z.string().max(500).optional(),
      })
    )
    .max(200)
    .optional(),
});

// ─── GET /api/stand/setlists ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const setlists = await prisma.standSetlist.findMany({
      where: { userId: session.user.id },
      include: {
        items: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jsonOk(
      setlists.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isDefault: s.isDefault,
        items: s.items.map((i) => ({
          id: i.id,
          pieceId: i.pieceId,
          title: i.piece.title,
          composer: i.piece.composer?.fullName ?? null,
          sortOrder: i.sortOrder,
          notes: i.notes,
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

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const parsed = await parseBody(request, createSetlistSchema);
    if (parsed instanceof Response) return parsed;

    // If setting as default, un-default all others first
    if (parsed.isDefault) {
      await prisma.standSetlist.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const setlist = await prisma.standSetlist.create({
      data: {
        userId: session.user.id,
        name: parsed.name,
        description: parsed.description ?? null,
        isDefault: parsed.isDefault,
        items: {
          create: parsed.items.map((item) => ({
            pieceId: item.pieceId,
            sortOrder: item.sortOrder,
            notes: item.notes ?? null,
          })),
        },
      },
      include: {
        items: {
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
        },
      },
    });

    return jsonOk(
      {
        id: setlist.id,
        name: setlist.name,
        description: setlist.description,
        isDefault: setlist.isDefault,
        items: setlist.items.map((i) => ({
          id: i.id,
          pieceId: i.pieceId,
          title: i.piece.title,
          composer: i.piece.composer?.fullName ?? null,
          sortOrder: i.sortOrder,
          notes: i.notes,
        })),
        createdAt: setlist.createdAt.toISOString(),
        updatedAt: setlist.updatedAt.toISOString(),
      },
      201
    );
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

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const parsed = await parseBody(request, updateSetlistSchema);
    if (parsed instanceof Response) return parsed;

    // Verify ownership
    const existing = await prisma.standSetlist.findFirst({
      where: { id: parsed.id, userId: session.user.id },
    });
    if (!existing) return json400('Setlist not found');

    // If setting as default, un-default all others
    if (parsed.isDefault) {
      await prisma.standSetlist.updateMany({
        where: { userId: session.user.id, isDefault: true, id: { not: parsed.id } },
        data: { isDefault: false },
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.isDefault !== undefined) updateData.isDefault = parsed.isDefault;

    // If items provided, replace all via delete+create
    if (parsed.items !== undefined) {
      await prisma.$transaction([
        prisma.standSetlistItem.deleteMany({ where: { setlistId: parsed.id } }),
        prisma.standSetlist.update({
          where: { id: parsed.id },
          data: {
            ...updateData,
            items: {
              create: parsed.items.map((item) => ({
                pieceId: item.pieceId,
                sortOrder: item.sortOrder,
                notes: item.notes ?? null,
              })),
            },
          },
        }),
      ]);
    } else {
      await prisma.standSetlist.update({
        where: { id: parsed.id },
        data: updateData,
      });
    }

    // Fetch updated setlist
    const updated = await prisma.standSetlist.findUnique({
      where: { id: parsed.id },
      include: {
        items: {
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
        },
      },
    });

    return jsonOk({
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      isDefault: updated!.isDefault,
      items: updated!.items.map((i) => ({
        id: i.id,
        pieceId: i.pieceId,
        title: i.piece.title,
        composer: i.piece.composer?.fullName ?? null,
        sortOrder: i.sortOrder,
        notes: i.notes,
      })),
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    });
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

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return json400('id query parameter required');

    // Delete only if owned by user (cascades to items)
    await prisma.standSetlist.deleteMany({
      where: { id, userId: session.user.id },
    });

    return jsonOk({ success: true });
  } catch (error) {
    console.error('[Setlists DELETE]', error);
    return json500();
  }
}
