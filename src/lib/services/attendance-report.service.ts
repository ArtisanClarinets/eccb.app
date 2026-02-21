import { prisma } from '@/lib/db';
import { Prisma, EventType } from '@prisma/client';

export interface SectionAttendanceStats {
  id: string;
  name: string;
  memberCount: number;
  present: number;
  total: number;
  rate: number;
}

/**
 * Gets attendance statistics aggregated by section for a given date range.
 * This is optimized to avoid N+1 queries by fetching all relevant data in parallel
 * and aggregating in memory.
 */
export async function getSectionAttendanceStats(
  startDate: Date,
  endDate: Date,
  eventType?: string
): Promise<SectionAttendanceStats[]> {
  // Fetch all sections with member counts
  const sectionsPromise = prisma.section.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: { members: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Build where clause for attendance
  const where: Prisma.AttendanceWhereInput = {
    event: {
      startTime: {
        gte: startDate,
        lte: endDate,
      },
      isCancelled: false,
      ...(eventType ? { type: eventType as EventType } : {}),
    },
  };

  // Fetch all relevant attendance records including the member's sections
  // We only need the status and the member's section IDs
  const attendancePromise = prisma.attendance.findMany({
    where,
    select: {
      status: true,
      member: {
        select: {
          sections: {
            select: {
              sectionId: true,
            },
          },
        },
      },
    },
  });

  const [sections, attendanceRecords] = await Promise.all([
    sectionsPromise,
    attendancePromise,
  ]);

  // Aggregate stats by section ID
  const statsBySection: Record<string, { present: number; total: number }> = {};

  // Initialize all sections with 0 stats
  for (const section of sections) {
    statsBySection[section.id] = { present: 0, total: 0 };
  }

  // Process attendance records
  for (const record of attendanceRecords) {
    // Skip records without member or sections (should not happen due to schema, but for safety)
    if (!record.member?.sections) continue;

    for (const memberSection of record.member.sections) {
      const sectionId = memberSection.sectionId;

      // Only count for sections that exist (in case of data inconsistency or soft deletes)
      if (statsBySection[sectionId]) {
        statsBySection[sectionId].total++;
        if (record.status === 'PRESENT') {
          statsBySection[sectionId].present++;
        }
      }
    }
  }

  // Format the result
  return sections.map((section) => {
    const stats = statsBySection[section.id] || { present: 0, total: 0 };
    const rate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

    return {
      id: section.id,
      name: section.name,
      memberCount: section._count.members,
      present: stats.present,
      total: stats.total,
      rate,
    };
  });
}
