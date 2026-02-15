import { NextRequest, NextResponse } from 'next/server';
import {
  exportAttendanceToCSV,
  exportMemberAttendanceSummary,
  exportEventAttendanceSummary,
} from '@/app/(admin)/admin/attendance/actions';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const reportType = searchParams.get('type') || 'detailed';

  const filters = {
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    memberId: searchParams.get('memberId') || undefined,
    sectionId: searchParams.get('sectionId') || undefined,
    eventId: searchParams.get('eventId') || undefined,
    eventType: searchParams.get('eventType') || undefined,
    status: searchParams.get('status') as 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE' | 'LEFT_EARLY' | undefined,
  };

  let result;

  switch (reportType) {
    case 'member-summary':
      result = await exportMemberAttendanceSummary({
        startDate: filters.startDate,
        endDate: filters.endDate,
        sectionId: filters.sectionId,
      });
      break;
    case 'event-summary':
      result = await exportEventAttendanceSummary({
        startDate: filters.startDate,
        endDate: filters.endDate,
        eventType: filters.eventType,
      });
      break;
    case 'detailed':
    default:
      result = await exportAttendanceToCSV(filters);
      break;
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    );
  }

  return new NextResponse(result.data, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  });
}
