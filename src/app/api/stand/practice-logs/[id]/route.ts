import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { isFeatureEnabled, FEATURES } from '@/lib/feature-flags';

/**
 * DELETE /api/stand/practice-logs/[id]
 * Deletes a practice log entry (owner only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isFeatureEnabled(FEATURES.PRACTICE_TRACKING)) {
      return NextResponse.json(
        { error: 'Practice tracking is not enabled' },
        { status: 404 }
      );
    }

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.practiceLog.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only the owner can delete their practice log
    if (existing.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: Only the owner can delete this log' },
        { status: 403 }
      );
    }

    await prisma.practiceLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting practice log:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
