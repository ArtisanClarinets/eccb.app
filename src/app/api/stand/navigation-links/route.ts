import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

// Zod schemas for validation
const navigationLinkCreateSchema = z.object({
  musicId: z.string().min(1),
  fromPage: z.number().int().positive().default(1),
  fromX: z.number().min(0).max(1),
  fromY: z.number().min(0).max(1),
  toPage: z.number().int().positive().default(1),
  toMusicId: z.string().nullable().optional(),
  toX: z.number().min(0).max(1),
  toY: z.number().min(0).max(1),
  label: z.string().optional(),
});

const _navigationLinkUpdateSchema = z.object({
  fromX: z.number().optional(),
  fromY: z.number().optional(),
  toX: z.number().optional(),
  toY: z.number().optional(),
  label: z.string().optional(),
});

export type NavigationLinkCreateInput = z.infer<typeof navigationLinkCreateSchema>;
export type NavigationLinkUpdateInput = z.infer<typeof _navigationLinkUpdateSchema>;

/**
 * GET /api/stand/navigation-links
 * Returns navigation links for a music piece
 * Query params: musicId
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const musicId = searchParams.get('musicId');

    if (!musicId) {
      return NextResponse.json(
        { error: 'musicId query parameter is required' },
        { status: 400 }
      );
    }

    const navigationLinks = await prisma.navigationLink.findMany({
      where: { musicId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ navigationLinks });
  } catch (error) {
    console.error('Error fetching navigation links:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/navigation-links
 * Creates a new navigation link (director only)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit navigation link writes
    const rateLimited = await applyRateLimit(request, 'stand-annotation');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only directors can create navigation links
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors can create navigation links' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = navigationLinkCreateSchema.parse(body);

    const navigationLink = await prisma.navigationLink.create({
      data: {
        musicId: validated.musicId,
        fromPage: validated.fromPage,
        fromX: validated.fromX,
        fromY: validated.fromY,
        toPage: validated.toPage,
        toMusicId: validated.toMusicId ?? null,
        toX: validated.toX,
        toY: validated.toY,
        label: validated.label,
      },
    });

    return NextResponse.json({ navigationLink }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating navigation link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
