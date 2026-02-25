import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { z } from 'zod';

const navigationLinkUpdateSchema = z.object({
  fromPage: z.number().int().positive().optional(),
  fromX: z.number().optional(),
  fromY: z.number().optional(),
  toPage: z.number().int().positive().optional(),
  toMusicId: z.string().nullable().optional(),
  toX: z.number().optional(),
  toY: z.number().optional(),
  label: z.string().optional(),
});

export type NavigationLinkUpdateInput = z.infer<typeof navigationLinkUpdateSchema>;

/**
 * PUT /api/stand/navigation-links/[id]
 * Updates a navigation link (director only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only directors can update navigation links
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors can update navigation links' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = navigationLinkUpdateSchema.parse(body);

    const existing = await prisma.navigationLink.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Navigation link not found' }, { status: 404 });
    }

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
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating navigation link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stand/navigation-links/[id]
 * Deletes a navigation link (director only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only directors can delete navigation links
    const roles = await getUserRoles(session.user.id);
    if (!roles.includes('DIRECTOR') && !roles.includes('SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors can delete navigation links' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await prisma.navigationLink.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Navigation link not found' }, { status: 404 });
    }

    await prisma.navigationLink.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting navigation link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
