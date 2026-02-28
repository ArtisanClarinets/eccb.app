import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StandViewer, StandLoaderData } from '@/components/member/stand/StandViewer';
import { auth } from '@/lib/auth/config';
import { getUserRoles } from '@/lib/auth/permissions';
import { isFeatureEnabled, FEATURES } from '@/lib/feature-flags';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Digital Music Stand',
};

interface PageProps {
  params: Promise<{ eventId: string }>;
}

/** Privileged role types that can access any event's stand */
const PRIVILEGED_ROLE_TYPES = ['DIRECTOR', 'SUPER_ADMIN', 'ADMIN', 'STAFF'];

/**
 * Check whether a user may open a music stand.
 *
 * Access policy (open / practice-friendly):
 *   - Directors / admins / staff always have access.
 *   - Any active Member may open the stand for any published event with music,
 *     without needing an attendance/RSVP record. This lets members practice on
 *     their own time and browse the full library stand.
 */
async function canAccessEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  // Check privileged roles first (no further checks needed)
  const privilegedRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: { type: { in: PRIVILEGED_ROLE_TYPES as any } },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (privilegedRole) return true;

  // Any member with an active record can view a published event's stand.
  const member = await prisma.member.findFirst({ where: { userId } });
  if (!member) return false;

  // Verify the event exists and is published (or has ended — allow reviewing past events)
  const event = await prisma.event.findFirst({
    where: { id: eventId, isPublished: true },
    select: { id: true },
  });
  return !!event;
}

export default async function StandPage({ params }: PageProps) {
  // Kill-switch: if the stand feature is disabled, show 404
  if (!isFeatureEnabled(FEATURES.MUSIC_STAND)) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const { eventId } = await params;
  const userId = session.user.id;

  // ── Authorization ─────────────────────────────────────────────
  const hasAccess = await canAccessEvent(userId, eventId);
  if (!hasAccess) {
    notFound();
  }

  // ── Parallel data fetches ─────────────────────────────────────
  const [event, roles, member] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: {
        music: {
          include: {
            piece: {
              include: {
                files: {
                  where: { mimeType: 'application/pdf', isArchived: false },
                  select: {
                    id: true,
                    mimeType: true,
                    storageKey: true,
                    storageUrl: true,
                    pageCount: true,
                    partLabel: true,
                    instrumentName: true,
                    section: true,
                    partNumber: true,
                  },
                },
                parts: {
                  include: {
                    instrument: { select: { id: true, name: true } },
                    file: {
                      select: {
                        id: true,
                        mimeType: true,
                        storageKey: true,
                        storageUrl: true,
                        pageCount: true,
                        partLabel: true,
                      },
                    },
                  },
                },
                composer: { select: { fullName: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    getUserRoles(userId),
    prisma.member.findFirst({
      where: { userId },
      include: {
        sections: { include: { section: true } },
        instruments: {
          include: { instrument: true },
          where: { isPrimary: true },
        },
      },
    }),
  ]);

  if (!event) {
    notFound();
  }

  // Derive role flags & section ids
  const isDirector = roles.some(
    (r) => PRIVILEGED_ROLE_TYPES.includes(r) || r === 'DIRECTOR'
  );
  const isSectionLeader = roles.includes('SECTION_LEADER');
  const userSectionIds = member?.sections.map((ms) => ms.sectionId) ?? [];

  // ── Piece IDs ─────────────────────────────────────────────────
  const pieceIds = event.music.map((m) => m.piece.id);

  // ── Annotations – privacy-filtered ────────────────────────────
  let annotations: any[] = [];
  if (pieceIds.length > 0) {
    if (isDirector) {
      // Directors see everything
      annotations = await prisma.annotation.findMany({
        where: { musicId: { in: pieceIds } },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // Regular members:
      //   PERSONAL → own only
      //   SECTION  → matching sectionId only
      //   DIRECTOR → all (they're shared downward)
      annotations = await prisma.annotation.findMany({
        where: {
          musicId: { in: pieceIds },
          OR: [
            { layer: 'PERSONAL', userId },
            {
              layer: 'SECTION',
              ...(userSectionIds.length > 0
                ? { sectionId: { in: userSectionIds } }
                : { sectionId: '__none__' }),
            },
            { layer: 'DIRECTOR' },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
    }
  }

  // ── Navigation links, audio links, preferences, roster ───────
  const [navigationLinks, audioLinks, preferences, rosterSessions] =
    await Promise.all([
      pieceIds.length > 0
        ? prisma.navigationLink.findMany({
            where: { musicId: { in: pieceIds } },
          })
        : [],
      pieceIds.length > 0
        ? prisma.audioLink.findMany({
            where: { pieceId: { in: pieceIds } },
          })
        : [],
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.standSession.findMany({
        where: { eventId },
        orderBy: { lastSeenAt: 'desc' },
      }),
    ]);

  // Resolve display names for roster sessions
  const rosterUserIds = rosterSessions.map((r) => r.userId);
  const rosterUsers =
    rosterUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: rosterUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const rosterUserMap = new Map(rosterUsers.map((u) => [u.id, u.name ?? '']));
  const roster = rosterSessions;

  // ── Serialise – strip Date objects ────────────────────────────
  const loaderData: StandLoaderData = {
    eventTitle: event.title,
    eventId,
    userId,
    roles,
    isDirector,
    isSectionLeader,
    userSectionIds,
    music: event.music.map((m) => ({
      id: m.id,
      piece: {
        id: m.piece.id,
        title: m.piece.title,
        composer: m.piece.composer?.fullName ?? null,
        files: m.piece.files.map((f) => ({
          id: f.id,
          mimeType: f.mimeType,
          storageKey: f.storageKey,
          storageUrl: f.storageUrl ?? null,
          pageCount: f.pageCount ?? null,
          partLabel: f.partLabel ?? null,
          instrumentName: f.instrumentName ?? null,
          section: f.section ?? null,
          partNumber: f.partNumber ?? null,
        })),
        parts: m.piece.parts.map((p) => ({
          id: p.id,
          partName: p.partName,
          partLabel: p.partLabel ?? null,
          instrumentId: p.instrumentId,
          instrumentName: p.instrument.name,
          storageKey: p.storageKey ?? p.file?.storageKey ?? null,
          storageUrl: p.file?.storageUrl ?? null,
          pageCount: p.pageCount ?? p.file?.pageCount ?? null,
        })),
      },
    })),
    annotations: annotations.map((a) => ({
      id: a.id,
      pieceId: a.musicId,
      page: a.page,
      layer: a.layer as 'PERSONAL' | 'SECTION' | 'DIRECTOR',
      strokeData: a.strokeData,
      userId: a.userId,
      sectionId: a.sectionId ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    navigationLinks: navigationLinks.map((nl) => ({
      id: nl.id,
      musicId: nl.musicId,
      fromPage: nl.fromPage,
      fromX: nl.fromX,
      fromY: nl.fromY,
      toPage: nl.toPage,
      toMusicId: nl.toMusicId ?? null,
      toX: nl.toX,
      toY: nl.toY,
      label: nl.label ?? '',
      createdAt: nl.createdAt.toISOString(),
    })),
    audioLinks: audioLinks.map((al) => ({
      id: al.id,
      pieceId: al.pieceId,
      fileKey: al.fileKey,
      url: al.url ?? null,
      description: al.description ?? null,
      createdAt: al.createdAt.toISOString(),
    })),
    preferences: preferences
      ? {
          nightMode: preferences.nightMode,
          metronomeSettings:
            (preferences.metronomeSettings as Record<string, unknown>) ?? {},
          midiMappings:
            (preferences.midiMappings as Record<string, unknown>) ?? {},
          tunerSettings:
            ((preferences.otherSettings as any)?.tunerSettings as Record<
              string,
              unknown
            >) || {},
          pitchPipeSettings:
            ((preferences.otherSettings as any)?.pitchPipeSettings as Record<
              string,
              unknown
            >) || {},
          audioTrackerSettings:
            ((preferences.otherSettings as any)
              ?.audioTrackerSettings as Record<string, unknown>) || {},
        }
      : null,
    roster: roster.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      userId: r.userId,
      name: rosterUserMap.get(r.userId) ?? '',
      section: r.section,
      lastSeenAt: r.lastSeenAt.toISOString(),
    })),
  };

  return <StandViewer data={loaderData} />;
}
