import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sections = await prisma.section.findMany({
      include: {
        _count: {
          select: {
            members: {
              where: {
                member: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Transform the count to match expected format
    const formattedSections = sections.map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description,
      _count: {
        members: section._count.members,
      },
    }));

    return NextResponse.json({ sections: formattedSections });
  } catch (error) {
    console.error('Failed to fetch sections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sections' },
      { status: 500 }
    );
  }
}
