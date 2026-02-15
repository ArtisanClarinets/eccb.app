import { NextRequest, NextResponse } from 'next/server';
import { exportMusicToCSV } from '@/app/(admin)/admin/music/actions';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const filters = {
    search: searchParams.get('search') || undefined,
    genre: searchParams.get('genre') || undefined,
    difficulty: searchParams.get('difficulty') || undefined,
    status: searchParams.get('status') || undefined,
  };

  const result = await exportMusicToCSV(filters);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return new NextResponse(result.data, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  });
}
