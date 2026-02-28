/**
 * Centralized Stand Access Control
 *
 * Single source of truth for every "can this user do X in the stand?" decision.
 * All API routes and pages must use these helpers rather than inline queries.
 *
 * Policy:
 *   - Privileged roles (DIRECTOR, SUPER_ADMIN, ADMIN, STAFF) → always access
 *   - Active members → can access published events
 *   - Librarians → same as active member + can manage audio/nav links
 *   - Section leaders → can write SECTION-layer annotations for their section
 *   - Non-members / no session → denied
 */

import { prisma } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import type { RoleType } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIVILEGED_ROLE_TYPES = [
  'DIRECTOR',
  'SUPER_ADMIN',
  'ADMIN',
  'STAFF',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandAccessContext {
  userId: string;
  roles: string[];
  isPrivileged: boolean;
  isDirector: boolean;
  isLibrarian: boolean;
  isSectionLeader: boolean;
  userSectionIds: string[];
  memberId: string | null;
}

// ─── Session Helper ───────────────────────────────────────────────────────────

/**
 * Get authenticated session or return a 401 NextResponse.
 * Use in API routes:
 *   const session = await getStandSession();
 *   if (session instanceof NextResponse) return session;
 */
export async function getStandSession(): Promise<
  { user: { id: string; name?: string | null; email?: string | null } } | NextResponse
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

// ─── Access Context Builder ───────────────────────────────────────────────────

/**
 * Build the full access context for a user. Cached per-request via
 * the server component / API handler that calls it.
 */
export async function buildAccessContext(
  userId: string
): Promise<StandAccessContext> {
  const [roles, member] = await Promise.all([
    getUserRoles(userId),
    prisma.member.findFirst({
      where: { userId },
      select: {
        id: true,

        sections: {
          select: { sectionId: true, isLeader: true },
        },
      },
    }),
  ]);

  const isPrivileged = roles.some((r) =>
    (PRIVILEGED_ROLE_TYPES as readonly string[]).includes(r)
  );
  const isDirector = isPrivileged; // All privileged roles can act as "director" in the stand
  const isLibrarian = roles.includes('LIBRARIAN') || isPrivileged;
  const isSectionLeader =
    roles.includes('SECTION_LEADER') ||
    (member?.sections.some((s) => s.isLeader) ?? false);
  const userSectionIds = member?.sections.map((s) => s.sectionId) ?? [];

  return {
    userId,
    roles,
    isPrivileged,
    isDirector,
    isLibrarian,
    isSectionLeader,
    userSectionIds,
    memberId: member?.id ?? null,
  };
}

// ─── Event Access ─────────────────────────────────────────────────────────────

/**
 * Can the user access a specific event's music stand?
 *
 * Policy: Privileged → yes. Active member + published event → yes. Else no.
 */
export async function canAccessEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  // Fast path: check for privileged role
  const privilegedRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        type: { in: PRIVILEGED_ROLE_TYPES as unknown as RoleType[] },
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (privilegedRole) return true;

  // Must be an active member
  const member = await prisma.member.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!member) return false;

  // Event must be published
  const event = await prisma.event.findFirst({
    where: { id: eventId, isPublished: true },
    select: { id: true },
  });
  return !!event;
}

/**
 * Can the user access a specific music piece (library mode)?
 *
 * Policy: Privileged → yes. Active member → yes. Else no.
 */
export async function canAccessPiece(
  userId: string,
  pieceId: string
): Promise<boolean> {
  // Fast path: check for privileged role
  const privilegedRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        type: { in: PRIVILEGED_ROLE_TYPES as unknown as RoleType[] },
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (privilegedRole) return true;

  // Must be an active member
  const member = await prisma.member.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!member) return false;

  // Piece must exist and not be archived
  const piece = await prisma.musicPiece.findFirst({
    where: { id: pieceId, isArchived: false },
    select: { id: true },
  });
  return !!piece;
}

// ─── File Access ──────────────────────────────────────────────────────────────

/**
 * Can the user access a specific file by its storage key?
 *
 * Policy: Must have access via an event or piece context.
 * Requires at least one of eventId or pieceId — session-only access is NOT
 * allowed (fixes P0 vulnerability).
 */
export async function canAccessFile(
  userId: string,
  storageKey: string,
  scope: { eventId?: string; pieceId?: string }
): Promise<boolean> {
  // Must have a scope — no session-only file access
  if (!scope.eventId && !scope.pieceId) {
    return false;
  }

  if (scope.eventId) {
    return canAccessEvent(userId, scope.eventId);
  }

  if (scope.pieceId) {
    return canAccessPiece(userId, scope.pieceId);
  }

  return false;
}

// ─── Annotation Access ────────────────────────────────────────────────────────

/**
 * Can the user write to a specific annotation layer?
 *
 * PERSONAL → own annotations only
 * SECTION → section leader for that section, or director
 * DIRECTOR → director only
 */
export function canWriteLayer(
  ctx: StandAccessContext,
  layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR',
  targetSectionId?: string | null
): boolean {
  switch (layer) {
    case 'PERSONAL':
      return true; // Any authenticated member
    case 'SECTION':
      if (ctx.isDirector) return true;
      if (!ctx.isSectionLeader) return false;
      // Must be leader of the target section
      return targetSectionId
        ? ctx.userSectionIds.includes(targetSectionId)
        : false;
    case 'DIRECTOR':
      return ctx.isDirector;
    default:
      return false;
  }
}

/**
 * Build a Prisma `where` clause that filters annotations to only those
 * the user is allowed to see.
 */
export function annotationVisibilityFilter(
  ctx: StandAccessContext,
  musicId: string | string[]
): Record<string, unknown> {
  const musicFilter = Array.isArray(musicId)
    ? { musicId: { in: musicId } }
    : { musicId };

  if (ctx.isDirector) {
    // Directors see everything
    return musicFilter;
  }

  return {
    ...musicFilter,
    OR: [
      // Own personal annotations
      { layer: 'PERSONAL', userId: ctx.userId },
      // Section annotations for user's sections
      {
        layer: 'SECTION',
        ...(ctx.userSectionIds.length > 0
          ? { sectionId: { in: ctx.userSectionIds } }
          : { sectionId: '__none__' }),
      },
      // All director annotations are visible
      { layer: 'DIRECTOR' },
    ],
  };
}

// ─── API Guard Helper ─────────────────────────────────────────────────────────

/**
 * Combined session + active-member guard for API routes.
 * Returns the access context on success, or a NextResponse on failure.
 */
export async function requireStandAccess(): Promise<
  StandAccessContext | NextResponse
> {
  const session = await getStandSession();
  if (session instanceof NextResponse) return session;

  const ctx = await buildAccessContext(session.user.id);

  // Must be a member (active or privileged)
  if (!ctx.memberId && !ctx.isPrivileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return ctx;
}

/**
 * Combined session + event access guard for API routes.
 */
export async function requireEventAccess(
  eventId: string
): Promise<StandAccessContext | NextResponse> {
  const session = await getStandSession();
  if (session instanceof NextResponse) return session;

  const [ctx, hasAccess] = await Promise.all([
    buildAccessContext(session.user.id),
    canAccessEvent(session.user.id, eventId),
  ]);

  if (!hasAccess) {
    // Return 404 (non-enumerating) instead of 403
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return ctx;
}
