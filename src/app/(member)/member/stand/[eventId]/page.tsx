import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StandViewer, StandLoaderData } from '@/components/member/stand/StandViewer';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Digital Music Stand',
};

interface PageProps {
  params: Promise<{ eventId: string }>;
}

// Type for annotations from database (Prisma)
interface DbAnnotation {
  id: string;
  musicId: string;
  page: number;
  layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
  strokeData: unknown;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Type for navigation links from database (Prisma)
interface DbNavigationLink {
  id: string;
  musicId: string;
  fromPage: number;
  fromX: number;
  fromY: number;
  toPage: number;
  toX: number;
  toY: number;
  label: string | null;
  createdAt: Date;
}

// Type for audio links from database (Prisma)
interface DbAudioLink {
  id: string;
  pieceId: string;
  fileKey: string;
  url: string | null;
  description: string | null;
  createdAt: Date;
}

// Transform Prisma annotation to viewer format
function transformAnnotation(annotation: DbAnnotation) {
  const strokeData = annotation.strokeData as { x?: number; y?: number; content?: string; color?: string; layer?: string } | null;
  return {
    id: annotation.id,
    pieceId: annotation.musicId,
    pageNumber: annotation.page,
    x: strokeData?.x ?? 0,
    y: strokeData?.y ?? 0,
    content: strokeData?.content ?? '',
    color: strokeData?.color ?? '#000000',
    layer: (strokeData?.layer as 'PERSONAL' | 'SECTION' | 'DIRECTOR') ?? 'PERSONAL',
    createdAt: annotation.createdAt,
  };
}

// Transform Prisma navigation link to viewer format
function transformNavigationLink(link: DbNavigationLink) {
  return {
    id: link.id,
    fromPieceId: link.musicId,
    fromPage: link.fromPage,
    fromX: link.fromX,
    fromY: link.fromY,
    toPieceId: link.musicId,
    toPage: link.toPage,
    toX: link.toX,
    toY: link.toY,
    label: link.label ?? '',
  };
}

// Transform Prisma audio link to viewer format
function transformAudioLink(link: DbAudioLink) {
  return {
    id: link.id,
    pieceId: link.pieceId,
    fileKey: link.fileKey,
    url: link.url,
    description: link.description,
    createdAt: link.createdAt,
  };
}

export default async function StandPage({ params }: PageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return notFound();
  }

  const { eventId } = await params;

  // Fetch event with music and piece files
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

  // Get piece IDs for related queries
  const pieceIds = event.music.map((m) => m.piece.id);

  // Fetch annotations for all pieces (ordered by createdAt)
  const annotations = pieceIds.length > 0
    ? await prisma.annotation.findMany({
        where: {
          musicId: { in: pieceIds },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  // Fetch navigation links for all pieces
  const navigationLinks = pieceIds.length > 0
    ? await prisma.navigationLink.findMany({
        where: {
          musicId: { in: pieceIds },
        },
      })
    : [];

  // Fetch audio links for all pieces
  const audioLinks = pieceIds.length > 0
    ? await prisma.audioLink.findMany({
        where: {
          pieceId: { in: pieceIds },
        },
      })
    : [];

  // Fetch user preferences
  const preferences = await prisma.userPreferences.findUnique({
    where: { userId: session.user.id },
  });

  // Fetch stand session roster for presence
  const roster = await prisma.standSession.findMany({
    where: { eventId },
    orderBy: { lastSeenAt: 'desc' },
  });

  // Transform data for the viewer
  const loaderData: StandLoaderData = {
    eventTitle: event.title,
    eventId,
    userId: session.user.id,
    music: event.music,
    annotations: annotations.map(transformAnnotation),
    navigationLinks: navigationLinks.map(transformNavigationLink),
    audioLinks: audioLinks.map(transformAudioLink),
    preferences: preferences
      ? {
          nightMode: preferences.nightMode,
          metronomeSettings: (preferences.metronomeSettings as Record<string, any>) ?? {},
          tunerSettings: (preferences.otherSettings as any)?.tunerSettings || {},
          pitchPipeSettings: (preferences.otherSettings as any)?.pitchPipeSettings || {},
        }
      : null,
    roster: roster.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      userId: r.userId,
      section: r.section,
      lastSeenAt: r.lastSeenAt,
    })),
  };

  return <StandViewer data={loaderData} />;
}
