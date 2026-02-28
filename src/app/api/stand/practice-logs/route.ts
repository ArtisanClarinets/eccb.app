import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { applyRateLimit } from '@/lib/rate-limit';
import { isFeatureEnabled, FEATURES } from '@/lib/feature-flags';
import { z } from 'zod';

const practiceLogCreateSchema = z.object({
  pieceId: z.string().min(1),
  assignmentId: z.string().optional(),
  durationSeconds: z.number().int().positive().max(86400), // max 24h
  notes: z.string().max(2000).optional(),
  practicedAt: z.string().datetime().optional(),
});

/**
 * GET /api/stand/practice-logs
 * Returns practice logs for the current user (or all users for directors)
 * Query params: pieceId, userId (director-only), limit, offset
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const pieceId = searchParams.get('pieceId');
    const userId = searchParams.get('userId');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const roles = await getUserRoles(session.user.id);
    const isDirector =
      roles.includes('DIRECTOR') ||
      roles.includes('SUPER_ADMIN') ||
      roles.includes('ADMIN');

    // Non-directors can only see their own logs
    const targetUserId =
      isDirector && userId ? userId : session.user.id;

    const where: Record<string, unknown> = { userId: targetUserId };
    if (pieceId) where.pieceId = pieceId;

    const [logs, total] = await Promise.all([
      prisma.practiceLog.findMany({
        where,
        include: {
          piece: { select: { id: true, title: true, composer: { select: { fullName: true } } } },
        },
        orderBy: { practicedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.practiceLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, limit, offset });
  } catch (error) {
    console.error('Error fetching practice logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/practice-logs
 * Creates a new practice log entry
 */
export async function POST(request: NextRequest) {
  try {
    if (!isFeatureEnabled(FEATURES.PRACTICE_TRACKING)) {
      return NextResponse.json(
        { error: 'Practice tracking is not enabled' },
        { status: 404 }
      );
    }

    // Rate limit practice log writes
    const rateLimited = await applyRateLimit(request, 'stand-practice');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = practiceLogCreateSchema.parse(body);

    // Verify the piece exists
    const piece = await prisma.musicPiece.findUnique({
      where: { id: validated.pieceId },
      select: { id: true },
    });

    if (!piece) {
      return NextResponse.json(
        { error: 'Music piece not found' },
        { status: 404 }
      );
    }

    const log = await prisma.practiceLog.create({
      data: {
        userId: session.user.id,
        pieceId: validated.pieceId,
        assignmentId: validated.assignmentId ?? null,
        durationSeconds: validated.durationSeconds,
        notes: validated.notes ?? null,
        practicedAt: validated.practicedAt
          ? new Date(validated.practicedAt)
          : new Date(),
      },
      include: {
        piece: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating practice log:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
