import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StandViewer } from '@/components/member/stand/StandViewer';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Digital Music Stand',
};

interface PageProps {
  params: Promise<{ eventId: string }>;
}

export default async function StandPage({ params }: PageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return notFound();
  }

  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      music: {
        include: {
          piece: {
            include: {
              files: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!event) {
    notFound();
  }

  return <StandViewer eventTitle={event.title} music={event.music} />;
}
