import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Zod schemas for validation
const rosterCreateSchema = z.object({
  eventId: z.string().min(1),
  userId: z.string().optional(),
  section: z.string().optional(),
});

const rosterUpdateSchema = z.object({
  lastSeenAt: z.string().datetime().optional(),
  section: z.string().optional(),
});

export type RosterCreateInput = z.infer<typeof rosterCreateSchema>;
export type RosterUpdateInput = z.infer<typeof rosterUpdateSchema>;

/**
 * GET /api/stand/roster
 * Returns current session roster for an event
 * Query params: eventId
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId query parameter is required' },
        { status: 400 }
      );
    }

    const roster = await prisma.standSession.findMany({
      where: {
        eventId,
        // Only show users active in the last 30 minutes
        lastSeenAt: {
          gte: new Date(Date.now() - 30 * 60 * 1000),
        },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return NextResponse.json({ roster });
  } catch (error) {
    console.error('Error fetching roster:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/roster
 * Registers presence for a user at an event
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = rosterCreateSchema.parse(body);

    const userId = validated.userId || session.user.id;

    // Check if user is attending the event
    const attendance = await prisma.attendance.findFirst({
      where: {
        eventId: validated.eventId,
        member: {
          userId: userId,
        },
      },
    });

    if (!attendance) {
      // Allow registration but don't enforce attendance check
      // This lets stand be flexible for rehearsals
    }

    const standSession = await prisma.standSession.upsert({
      where: {
        eventId_userId: {
          eventId: validated.eventId,
          userId,
        },
      },
      create: {
        eventId: validated.eventId,
        userId,
        section: validated.section,
        lastSeenAt: new Date(),
      },
      update: {
        section: validated.section,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ standSession }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error registering presence:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/stand/roster
 * Updates lastSeenAt for presence heartbeat
 */
export async function PUT(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = rosterUpdateSchema.parse(body);

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId query parameter is required' },
        { status: 400 }
      );
    }

    const standSession = await prisma.standSession.update({
      where: {
        eventId_userId: {
          eventId,
          userId: session.user.id,
        },
      },
      data: {
        ...(validated.lastSeenAt && { lastSeenAt: new Date(validated.lastSeenAt) }),
        ...(validated.section && { section: validated.section }),
        ...(!validated.lastSeenAt && { lastSeenAt: new Date() }),
      },
    });

    return NextResponse.json({ standSession });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating presence:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
