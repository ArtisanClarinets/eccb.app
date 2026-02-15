import { NextRequest, NextResponse } from 'next/server';
import { exportMembersToCSV } from '@/app/(admin)/admin/members/actions';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const filters = {
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
    sectionId: searchParams.get('section') || undefined,
    instrumentId: searchParams.get('instrument') || undefined,
    roleId: searchParams.get('role') || undefined,
  };

  const result = await exportMembersToCSV(filters);

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
