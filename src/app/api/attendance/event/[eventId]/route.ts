import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { getUserPermissions } from '@/lib/auth/permissions';
import {
  ATTENDANCE_VIEW_ALL,
  ATTENDANCE_VIEW_SECTION,
  ATTENDANCE_VIEW_OWN,
} from '@/lib/auth/permission-constants';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Get user permissions
    const permissions = await getUserPermissions(session.user.id);

    const hasAllPermission = permissions.includes(ATTENDANCE_VIEW_ALL);
    const hasSectionPermission = permissions.includes(ATTENDANCE_VIEW_SECTION);
    const hasOwnPermission = permissions.includes(ATTENDANCE_VIEW_OWN);

    if (!hasAllPermission && !hasSectionPermission && !hasOwnPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get event with attendance
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        attendance: {
          include: {
            member: {
              include: {
                sections: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Filter attendance based on permissions
    let attendance = event.attendance;

    if (!hasAllPermission && hasSectionPermission) {
      const member = await prisma.member.findFirst({
        where: { userId: session.user.id },
        include: { sections: true },
      });

      if (member) {
        const memberSectionIds = member.sections.map((s) => s.sectionId);
        attendance = attendance.filter((a) =>
          a.member.sections.some((s) => memberSectionIds.includes(s.sectionId))
        );
      }
    } else if (!hasAllPermission && !hasSectionPermission && hasOwnPermission) {
      const member = await prisma.member.findFirst({
        where: { userId: session.user.id },
      });

      if (member) {
        attendance = attendance.filter((a) => a.memberId === member.id);
      }
    }

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    console.error('Error fetching event attendance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
