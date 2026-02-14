import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';

const rsvpSchema = z.object({
  eventId: z.string(),
  memberId: z.string(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, 'rsvp');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Validate CSRF
    const csrfResult = validateCSRF(request);
    if (!csrfResult.valid) {
      return NextResponse.json(
        { error: 'CSRF validation failed', reason: csrfResult.reason },
        { status: 403 }
      );
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventId, memberId, status } = rsvpSchema.parse(body);

    // Verify the member belongs to the current user
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        userId: session.user.id,
      },
    });

    if (!member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verify the event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Upsert attendance record
    const attendance = await prisma.attendance.upsert({
      where: {
        eventId_memberId: {
          eventId,
          memberId,
        },
      },
      update: {
        status: status as AttendanceStatus,
        markedAt: new Date(),
      },
      create: {
        eventId,
        memberId,
        status: status as AttendanceStatus,
        markedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    console.error('Error updating RSVP:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
