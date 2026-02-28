import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const annotationUpdateSchema = z.object({
  strokeData: z.record(z.string(), z.any()).optional(),
  layer: z.enum(['PERSONAL', 'SECTION', 'DIRECTOR']).optional(),
  sectionId: z.string().nullable().optional(),
});

export type AnnotationUpdateInput = z.infer<typeof annotationUpdateSchema>;

/**
 * PUT /api/stand/annotations/[id]
 * Updates an annotation (only by owner or director)
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

    const { id } = await params;
    const body = await request.json();
    const validated = annotationUpdateSchema.parse(body);

    // Get existing annotation
    const existing = await prisma.annotation.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
    }

    // Check permission: owner or director can update
    const roles = await getUserRoles(session.user.id);
    const isOwner = existing.userId === session.user.id;
    const isDirector = roles.includes('DIRECTOR') || roles.includes('SUPER_ADMIN');

    if (!isOwner && !isDirector) {
      return NextResponse.json(
        { error: 'Forbidden: Only owner or director can update annotations' },
        { status: 403 }
      );
    }

    // Non-directors cannot change to DIRECTOR layer
    if (validated.layer === 'DIRECTOR' && !isDirector) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors can set DIRECTOR layer' },
        { status: 403 }
      );
    }

    // SECTION layer requires section membership
    let serverSectionId: string | null | undefined = undefined;
    if (validated.layer === 'SECTION') {
      const member = await prisma.member.findFirst({
        where: { userId: session.user.id },
        select: { sections: { select: { sectionId: true }, take: 1 } },
      });
      serverSectionId = member?.sections[0]?.sectionId ?? null;

      if (!serverSectionId) {
        return NextResponse.json(
          { error: 'Forbidden: you must belong to a section to write SECTION annotations' },
          { status: 403 }
        );
      }
    }

    const annotation = await prisma.annotation.update({
      where: { id },
      data: {
        ...(validated.strokeData !== undefined && {
          strokeData: validated.strokeData as Prisma.InputJsonValue,
        }),
        ...(validated.layer && { layer: validated.layer }),
        // Use server-computed sectionId for SECTION layer, otherwise preserve client value
        ...(serverSectionId !== undefined
          ? { sectionId: serverSectionId }
          : validated.sectionId !== undefined
            ? { sectionId: validated.sectionId }
            : {}),
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

    return NextResponse.json({ annotation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating annotation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stand/annotations/[id]
 * Deletes an annotation (only by owner or director)
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

    const { id } = await params;

    // Get existing annotation
    const existing = await prisma.annotation.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
    }

    // Check permission: owner or director can delete
    const roles = await getUserRoles(session.user.id);
    const isOwner = existing.userId === session.user.id;
    const isDirector = roles.includes('DIRECTOR') || roles.includes('SUPER_ADMIN');

    if (!isOwner && !isDirector) {
      return NextResponse.json(
        { error: 'Forbidden: Only owner or director can delete annotations' },
        { status: 403 }
      );
    }

    await prisma.annotation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting annotation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
