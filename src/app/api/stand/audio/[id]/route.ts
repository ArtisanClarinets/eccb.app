import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { z } from 'zod';

const audioUpdateSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().optional(),
  fileKey: z.string().min(1).optional(),
});

export type AudioUpdateInput = z.infer<typeof audioUpdateSchema>;

function isPrivilegedRole(roles: string[]): boolean {
  return (
    roles.includes('DIRECTOR') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('LIBRARIAN')
  );
}

/**
 * PUT /api/stand/audio/[id]
 * Updates an audio link (director/librarian only)
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

    const roles = await getUserRoles(session.user.id);
    if (!isPrivilegedRole(roles)) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors and librarians can update audio links' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = audioUpdateSchema.parse(body);

    const existing = await prisma.audioLink.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Audio link not found' }, { status: 404 });
    }

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
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating audio link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/stand/audio/[id]
 * Deletes an audio link (director/librarian only)
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

    const roles = await getUserRoles(session.user.id);
    if (!isPrivilegedRole(roles)) {
      return NextResponse.json(
        { error: 'Forbidden: Only directors and librarians can delete audio links' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await prisma.audioLink.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Audio link not found' }, { status: 404 });
    }

    await prisma.audioLink.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting audio link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
