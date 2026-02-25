import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { z } from 'zod';

// Zod schemas for validation
const annotationCreateSchema = z.object({
  musicId: z.string().min(1),
  page: z.number().int().positive(),
  layer: z.enum(['PERSONAL', 'SECTION', 'DIRECTOR']),
  strokeData: z.record(z.string(), z.any()),
  userId: z.string().optional(),
});

const _annotationUpdateSchema = z.object({
  strokeData: z.record(z.string(), z.any()).optional(),
  layer: z.enum(['PERSONAL', 'SECTION', 'DIRECTOR']).optional(),
});

export type AnnotationCreateInput = z.infer<typeof annotationCreateSchema>;
export type AnnotationUpdateInput = z.infer<typeof _annotationUpdateSchema>;

/**
 * GET /api/stand/annotations
 * Returns annotations matching the query parameters
 * Query params: musicId, page, layer, userId
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
    const page = searchParams.get('page');
    const layer = searchParams.get('layer');
    const userId = searchParams.get('userId');

    const where: Record<string, unknown> = {};

    if (musicId) where.musicId = musicId;
    if (page) where.page = parseInt(page, 10);
    if (layer) where.layer = layer;
    if (userId) where.userId = userId;

    // If not a director, only show personal and section annotations
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('SUPER_ADMIN')) {
      // Show personal annotations (own) and section annotations
      where.OR = [
        { userId: session.user.id },
        { layer: 'SECTION' },
      ];
    }

    const annotations = await prisma.annotation.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { page: 'asc' },
    });

    return NextResponse.json({ annotations });
  } catch (error) {
    console.error('Error fetching annotations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/annotations
 * Creates a new annotation
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = annotationCreateSchema.parse(body);

    // Only directors / super-admins may write to the DIRECTOR layer
    if (validated.layer === 'DIRECTOR') {
      const roles = await getUserRoles(session.user.id);
      if (!roles.includes('DIRECTOR') && !roles.includes('SUPER_ADMIN')) {
        return NextResponse.json(
          { error: 'Forbidden: only directors may write to the DIRECTOR annotation layer' },
          { status: 403 }
        );
      }
    }

    const annotation = await prisma.annotation.create({
      data: {
        musicId: validated.musicId,
        page: validated.page,
        layer: validated.layer,
        strokeData: validated.strokeData,
        userId: validated.userId || session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating annotation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
