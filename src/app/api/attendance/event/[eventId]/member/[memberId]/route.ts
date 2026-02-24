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
  params: Promise<{ eventId: string; memberId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId, memberId } = await params;

    // Get user permissions
    const permissions = await getUserPermissions(session.user.id);

    const hasAllPermission = permissions.includes(ATTENDANCE_VIEW_ALL);
    const hasSectionPermission = permissions.includes(ATTENDANCE_VIEW_SECTION);
    const hasOwnPermission = permissions.includes(ATTENDANCE_VIEW_OWN);

    if (!hasAllPermission && !hasSectionPermission && !hasOwnPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check access based on permissions
    if (!hasAllPermission) {
      if (hasOwnPermission && !hasSectionPermission) {
        const member = await prisma.member.findFirst({
          where: { userId: session.user.id },
        });
        if (!member || member.id !== memberId) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }
      } else if (hasSectionPermission) {
        const member = await prisma.member.findFirst({
          where: { userId: session.user.id },
          include: { sections: true },
        });
        const targetMember = await prisma.member.findUnique({
          where: { id: memberId },
          include: { sections: true },
        });

        if (member && targetMember) {
          const memberSectionIds = member.sections.map((s) => s.sectionId);
          const hasCommonSection = targetMember.sections.some((s) =>
            memberSectionIds.includes(s.sectionId)
          );
          if (!hasCommonSection) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
          }
        }
      }
    }

    // Get the specific attendance record
    const attendance = await prisma.attendance.findUnique({
      where: {
        eventId_memberId: {
          eventId,
          memberId,
        },
      },
    });

    if (!attendance) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    console.error('Error fetching attendance record:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
