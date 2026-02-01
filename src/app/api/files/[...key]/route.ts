import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { getFileUrl } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const storageKey = key.join('/');

  try {
    // Verify access to the file
    const file = await prisma.musicFile.findFirst({
      where: { storageKey },
      include: {
        piece: {
          include: {
            assignments: {
              where: {
                member: {
                  userId: session.user.id,
                },
              },
            },
          },
        },
      },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check if user has access (assigned to the music)
    // For more complex role checks, would need to query UserRole table
    const hasAccess = file.piece.assignments.length > 0;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get presigned URL from storage
    const url = await getFileUrl(storageKey);

    // Redirect to the presigned URL
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to get file:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}
