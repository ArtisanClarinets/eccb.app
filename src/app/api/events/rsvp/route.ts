import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';

// Accept both human-friendly RSVP values (YES/NO/MAYBE) and raw attendance
// statuses so both the member UI and admin tools work without a mismatch.
const rsvpSchema = z.object({
  eventId: z.string(),
  memberId: z.string(),
  status: z.enum(['YES', 'NO', 'MAYBE', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
});

/** Map friendly RSVP strings to the AttendanceStatus enum values stored in DB */
function mapRsvpStatus(status: string): AttendanceStatus {
  switch (status) {
    case 'YES':
      return 'PRESENT' as AttendanceStatus;
    case 'NO':
      return 'ABSENT' as AttendanceStatus;
    case 'MAYBE':
      return 'EXCUSED' as AttendanceStatus;
    default:
      return status as AttendanceStatus;
  }
}

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
    const attendanceStatus = mapRsvpStatus(status);

    // Verify the member belongs to the current user
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        userId: session.user.id,
      },
      include: {
        instruments: true, // Need instruments for sub matching
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
        status: attendanceStatus,
        markedAt: new Date(),
      },
      create: {
        eventId,
        memberId,
        status: attendanceStatus,
        markedAt: new Date(),
      },
    });

    // Check if we need to notify subs
    if (attendanceStatus === 'ABSENT' && event.type === 'CONCERT') {
      // Find subs who play the same instruments
      const instrumentIds = member.instruments.map(i => i.instrumentId);

      if (instrumentIds.length > 0) {
        const potentialSubs = await prisma.member.findMany({
          where: {
            isSubstitute: true,
            instruments: {
              some: {
                instrumentId: {
                  in: instrumentIds
                }
              }
            }
          },
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        });

        if (potentialSubs.length > 0) {
          // In a real app, send emails here via a queue or service
          console.log(`[SubFinder] Notify ${potentialSubs.length} subs for ${member.firstName} ${member.lastName} at ${event.title}`);
          // await sendSubNotifications(potentialSubs, event, member);
        }
      }
    }

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    console.error('Error updating RSVP:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
