/**
 * GET /api/admin/stand/status
 *
 * Reports active Socket.IO rooms, connection counts, and stand state per event.
 * Protected: requires ADMIN or DIRECTOR role.
 *
 * Response shape:
 * {
 *   socketServerEnabled: boolean;
 *   rooms: Array<{
 *     eventId: string;
 *     clientCount: number;
 *     clients: ConnectedClient[];
 *     state: StandState | null;
 *   }>;
 *   totalConnections: number;
 *   timestamp: string;
 * }
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { redis } from '@/lib/redis';
import { getActiveRooms, getEventStandState } from '@/lib/websocket/stand-socket';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    // Require admin or director
    await requireRole('ADMIN', 'DIRECTOR');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const socketServerEnabled = process.env.ENABLE_WEBSOCKETS === 'true';
    const rooms = await getActiveRooms(redis);

    // Enrich each room with its current stand state
    const enriched = await Promise.all(
      rooms.map(async (room) => {
        const state = await getEventStandState(redis, room.eventId);
        return { ...room, state };
      }),
    );

    const totalConnections = enriched.reduce((sum, r) => sum + r.clientCount, 0);

    return NextResponse.json({
      socketServerEnabled,
      rooms: enriched,
      totalConnections,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[admin/stand/status] Error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
