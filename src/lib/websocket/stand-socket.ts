import { Server as SocketIOServer } from 'socket.io';

import { prisma } from '@/lib/db';
import { z } from 'zod';

// =============================================================================
// TYPES
// =============================================================================

interface ConnectedClient {
  id: string;
  userId: string;
  name: string;
  section?: string;
  socketId: string;
  eventId: string;
  joinedAt: Date;
}

interface StandState {
  eventId: string;
  currentPage?: number;
  currentPieceIndex?: number;
  nightMode?: boolean;
  lastUpdated: Date;
}

// =============================================================================
// ZOD SCHEMAS FOR MESSAGE VALIDATION
// =============================================================================

const presenceMessageSchema = z.object({
  type: z.literal('presence'),
  userId: z.string(),
  name: z.string(),
  section: z.string().optional(),
  status: z.enum(['joined', 'left']),
});

const commandMessageSchema = z.object({
  type: z.literal('command'),
  action: z.enum(['setPage', 'setPiece', 'toggleNightMode']),
  page: z.number().int().positive().optional(),
  pieceIndex: z.number().int().min(0).optional(),
  value: z.boolean().optional(),
});

const modeMessageSchema = z.object({
  type: z.literal('mode'),
  name: z.string(),
  value: z.unknown(),
});

const annotationMessageSchema = z.object({
  type: z.literal('annotation'),
  data: z.record(z.string(), z.unknown()),
});

const baseMessageSchema = z.discriminatedUnion('type', [
  presenceMessageSchema,
  commandMessageSchema,
  modeMessageSchema,
  annotationMessageSchema,
]);

type StandMessage = z.infer<typeof baseMessageSchema>;

// =============================================================================
// IN-MEMORY STATE (In production, use Redis)
// =============================================================================

// Map of eventId -> connected clients
const eventRooms = new Map<string, Map<string, ConnectedClient>>();

// Map of eventId -> current stand state
const standStates = new Map<string, StandState>();

// Socket.IO server instance (will be initialized lazily)
let io: SocketIOServer | null = null;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get or create the Socket.IO server instance
 */
export function getStandSocketServer(): SocketIOServer {
  if (!io) {
    // This is a placeholder - in production, you'd integrate with a custom server
    // For Next.js API routes, we'll use a different approach
    throw new Error(
      'Socket.IO server not initialized. Use standSocketHandler for WebSocket connections.'
    );
  }
  return io;
}

/**
 * Check if a user can access an event (member or conductor)
 */
async function canAccessEvent(userId: string, eventId: string): Promise<boolean> {
  // Check if user is a conductor/director for this event
  const conductorRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        type: { in: ['DIRECTOR', 'SUPER_ADMIN', 'ADMIN', 'STAFF'] },
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (conductorRole) {
    return true;
  }

  // Check if user is a member assigned to this event
  const member = await prisma.member.findFirst({
    where: { userId },
  });

  if (!member) {
    return false;
  }

  // Check if the event has this member in attendance (any status)
  const eventAttendance = await prisma.event.findFirst({
    where: {
      id: eventId,
      attendance: {
        some: {
          memberId: member.id,
        },
      },
    },
  });

  return !!eventAttendance;
}

/**
 * Get user info for presence
 */
async function getUserInfo(userId: string): Promise<{ name: string; section?: string }> {
  const member = await prisma.member.findFirst({
    where: { userId },
    include: {
      sections: {
        include: { section: true },
        where: { isLeader: true },
      },
    },
  });

  if (!member) {
    return { name: 'Unknown User' };
  }

  return {
    name: `${member.firstName} ${member.lastName}`,
    section: member.sections[0]?.section.name,
  };
}

/**
 * Broadcast message to all clients in an event room (except sender)
 */
function _broadcastToRoom(
  eventId: string,
  message: StandMessage,
  excludeSocketId?: string
): void {
  const room = eventRooms.get(eventId);
  if (!room) return;

  const _messageStr = JSON.stringify(message);

  room.forEach((client) => {
    if (client.socketId !== excludeSocketId) {
      // In a real implementation, we'd use the actual socket
      // For now, we store the message for polling clients
      console.log(`[WS] Broadcast to ${client.userId}:`, message);
    }
  });
}

/**
 * Get all connected clients in an event room
 */
function getRoomClients(eventId: string): ConnectedClient[] {
  const room = eventRooms.get(eventId);
  if (!room) return [];
  return Array.from(room.values());
}

/**
 * Update stand state for an event
 */
function updateStandState(eventId: string, updates: Partial<StandState>): StandState {
  let state = standStates.get(eventId);
  if (!state) {
    state = {
      eventId,
      lastUpdated: new Date(),
    };
  }

  state = {
    ...state,
    ...updates,
    lastUpdated: new Date(),
  };

  standStates.set(eventId, state);
  return state;
}

/**
 * Get current stand state for an event
 */
export function getStandState(eventId: string): StandState | undefined {
  return standStates.get(eventId);
}

/**
 * Add a client to an event room
 */
export function addClientToRoom(client: ConnectedClient): void {
  let room = eventRooms.get(client.eventId);
  if (!room) {
    room = new Map();
    eventRooms.set(client.eventId, room);
  }
  room.set(client.socketId, client);
}

/**
 * Remove a client from an event room
 */
export function removeClientFromRoom(eventId: string, socketId: string): ConnectedClient | undefined {
  const room = eventRooms.get(eventId);
  if (!room) return undefined;

  const client = room.get(socketId);
  room.delete(socketId);

  if (room.size === 0) {
    eventRooms.delete(eventId);
  }

  return client;
}

/**
 * Validate and parse incoming message
 */
export function parseMessage(data: unknown): StandMessage | null {
  try {
    return baseMessageSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[WS] Invalid message format:', error.issues);
    }
    return null;
  }
}

// =============================================================================
// SOCKET.IO HANDLER FOR CUSTOM SERVER
// =============================================================================

/**
 * Initialize Socket.IO server with HTTP server
 * This should be called from a custom server.ts or route handler
 */
export function initializeStandSocketServer(httpServer: unknown): SocketIOServer {
   
  io = new SocketIOServer(httpServer as any, {
    path: '/api/stand/socket',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', async (socket) => {
    console.log('[WS] Client connected:', socket.id);

    // Extract eventId from query params (set during connection)
    const eventId = socket.handshake.query.eventId as string;
    const userId = socket.handshake.query.userId as string;

    if (!eventId || !userId) {
      console.log('[WS] Missing eventId or userId, disconnecting');
      socket.disconnect();
      return;
    }

    // Verify permissions
    const hasAccess = await canAccessEvent(userId, eventId);
    if (!hasAccess) {
      console.log('[WS] User lacks permission for event:', eventId);
      socket.emit('error', { message: 'Unauthorized access to event' });
      socket.disconnect();
      return;
    }

    // Get user info
    const userInfo = await getUserInfo(userId);

    // Add client to room
    const client: ConnectedClient = {
      id: socket.id,
      userId,
      name: userInfo.name,
      section: userInfo.section,
      socketId: socket.id,
      eventId,
      joinedAt: new Date(),
    };

    addClientToRoom(client);

    // Update user's stand session in database
    await prisma.standSession.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      create: {
        eventId,
        userId,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    // Send current state to new client
    const currentState = getStandState(eventId);
    socket.emit('state', currentState);

    // Send roster to new client
    const roster = getRoomClients(eventId).map((c) => ({
      userId: c.userId,
      name: c.name,
      section: c.section,
      joinedAt: c.joinedAt.toISOString(),
    }));
    socket.emit('roster', roster);

    // Broadcast presence to other clients
    socket.to(eventId).emit('message', {
      type: 'presence',
      userId,
      name: userInfo.name,
      section: userInfo.section,
      status: 'joined',
    } as StandMessage);

    // Handle incoming messages
    socket.on('message', async (data: unknown) => {
      const message = parseMessage(data);
      if (!message) {
        socket.emit('error', { message: 'Invalid message format' });
        return;
      }

      switch (message.type) {
        case 'command':
          // Update stand state
          if (message.action === 'setPage') {
            updateStandState(eventId, { currentPage: message.page });
          } else if (message.action === 'setPiece') {
            updateStandState(eventId, { currentPieceIndex: message.pieceIndex });
          } else if (message.action === 'toggleNightMode') {
            const currentState = getStandState(eventId);
            updateStandState(eventId, { nightMode: message.value ?? !currentState?.nightMode });
          }

          // Broadcast to other clients
          socket.to(eventId).emit('message', message);
          break;

        case 'mode':
          // Update stand state
          if (message.name === 'nightMode') {
            updateStandState(eventId, { nightMode: message.value as boolean });
          }

          // Broadcast to other clients
          socket.to(eventId).emit('message', message);
          break;

        case 'annotation':
          // Broadcast annotation (could persist to DB here)
          socket.to(eventId).emit('message', message);
          break;

        case 'presence':
          // Already handled, but acknowledge
          break;
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log('[WS] Client disconnected:', socket.id);

      const removedClient = removeClientFromRoom(eventId, socket.id);

      if (removedClient) {
        // Broadcast left presence
        socket.to(eventId).emit('message', {
          type: 'presence',
          userId: removedClient.userId,
          name: removedClient.name,
          section: removedClient.section,
          status: 'left',
        } as StandMessage);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('[WS] Socket error:', error);
    });
  });

  return io;
}

// =============================================================================
// API ROUTE HANDLER (For Next.js compatibility)
// =============================================================================

/**
 * This function handles WebSocket upgrade for the Next.js API route
 * In production, you'd typically use a custom server or external service
 */
export async function handleWebSocketUpgrade(
  _req: unknown
): Promise<{ success: boolean; error?: string }> {
  // This is a placeholder - in Next.js App Router, WebSocket upgrades
  // require a custom server. This function documents the approach.
  //
  // For production, consider:
  // 1. Using a custom server.ts with Express + Socket.IO
  // 2. Using a separate WebSocket microservice
  // 3. Using Pusher/Ably for managed WebSockets
  //
  // The polling-based sync in route.ts provides basic functionality
  // that works without custom server infrastructure.

  return {
    success: false,
    error:
      'WebSocket upgrade requires custom server. Use polling sync at /api/stand/sync for now.',
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  ConnectedClient,
  StandState,
  StandMessage,
};
