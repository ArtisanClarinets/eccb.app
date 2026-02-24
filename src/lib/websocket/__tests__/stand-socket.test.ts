import { describe, it, expect, vi } from 'vitest';

// Mock prisma before importing stand-socket
vi.mock('@/lib/db', () => ({
  prisma: {},
}));

// Mock socket.io
vi.mock('socket.io', () => ({
  Server: vi.fn(),
}));

import {
  parseMessage,
  addClientToRoom,
  removeClientFromRoom,
  getStandState,
  type ConnectedClient,
} from '../stand-socket';

describe('WebSocket Message Parsing', () => {
  it('should parse valid presence message', () => {
    const message = {
      type: 'presence',
      userId: 'user-1',
      name: 'John Doe',
      section: 'Trumpet',
      status: 'joined',
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('presence');
    if (result?.type === 'presence') {
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe('joined');
    }
  });

  it('should parse valid command message with setPage', () => {
    const message = {
      type: 'command',
      action: 'setPage',
      page: 5,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('command');
    if (result?.type === 'command') {
      expect(result.action).toBe('setPage');
      expect(result.page).toBe(5);
    }
  });

  it('should parse valid command message with setPiece', () => {
    const message = {
      type: 'command',
      action: 'setPiece',
      pieceIndex: 2,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('command');
    if (result?.type === 'command') {
      expect(result.action).toBe('setPiece');
      expect(result.pieceIndex).toBe(2);
    }
  });

  it('should parse valid command message with toggleNightMode', () => {
    const message = {
      type: 'command',
      action: 'toggleNightMode',
      value: true,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('command');
    if (result?.type === 'command') {
      expect(result.action).toBe('toggleNightMode');
      expect(result.value).toBe(true);
    }
  });

  it('should parse valid mode message', () => {
    const message = {
      type: 'mode',
      name: 'nightMode',
      value: true,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('mode');
    if (result?.type === 'mode') {
      expect(result.name).toBe('nightMode');
      expect(result.value).toBe(true);
    }
  });

  it('should parse valid annotation message', () => {
    const message = {
      type: 'annotation',
      data: {
        page: 1,
        x: 100,
        y: 200,
        text: 'Test annotation',
      },
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('annotation');
    if (result?.type === 'annotation') {
      expect(result.data).toBeDefined();
    }
  });

  it('should reject invalid message type', () => {
    const message = {
      type: 'invalid',
      data: {},
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });

  it('should reject invalid command action', () => {
    const message = {
      type: 'command',
      action: 'invalidAction',
      page: 5,
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });

  it('should reject invalid presence status', () => {
    const message = {
      type: 'presence',
      userId: 'user-1',
      name: 'John Doe',
      status: 'invalid',
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });

  it('should reject message missing required fields', () => {
    const message = {
      type: 'command',
      // missing action
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });

  it('should reject non-object message', () => {
    const result = parseMessage('not an object');
    expect(result).toBeNull();
  });

  it('should reject null message', () => {
    const result = parseMessage(null);
    expect(result).toBeNull();
  });
});

describe('Room Management', () => {
  it('should add client to room', () => {
    const client: ConnectedClient = {
      id: 'client-1',
      userId: 'user-1',
      name: 'John Doe',
      socketId: 'socket-1',
      eventId: 'event-1',
      joinedAt: new Date(),
    };

    addClientToRoom(client);

    // The client should be added without error
    // We can verify by removing and checking the return
    const removed = removeClientFromRoom('event-1', 'socket-1');
    expect(removed).toEqual(client);
  });

  it('should remove client from room', () => {
    const client: ConnectedClient = {
      id: 'client-2',
      userId: 'user-2',
      name: 'Jane Doe',
      socketId: 'socket-2',
      eventId: 'event-2',
      joinedAt: new Date(),
    };

    addClientToRoom(client);
    const removed = removeClientFromRoom('event-2', 'socket-2');

    expect(removed).toEqual(client);

    // Second removal should return undefined
    const removedAgain = removeClientFromRoom('event-2', 'socket-2');
    expect(removedAgain).toBeUndefined();
  });

  it('should return undefined when removing from non-existent room', () => {
    const removed = removeClientFromRoom('non-existent-event', 'socket-1');
    expect(removed).toBeUndefined();
  });

  it('should handle multiple clients in same room', () => {
    const client1: ConnectedClient = {
      id: 'client-1',
      userId: 'user-1',
      name: 'User 1',
      socketId: 'socket-1',
      eventId: 'event-multi',
      joinedAt: new Date(),
    };

    const client2: ConnectedClient = {
      id: 'client-2',
      userId: 'user-2',
      name: 'User 2',
      socketId: 'socket-2',
      eventId: 'event-multi',
      joinedAt: new Date(),
    };

    addClientToRoom(client1);
    addClientToRoom(client2);

    const removed1 = removeClientFromRoom('event-multi', 'socket-1');
    expect(removed1).toEqual(client1);

    const removed2 = removeClientFromRoom('event-multi', 'socket-2');
    expect(removed2).toEqual(client2);
  });
});

describe('Stand State Management', () => {
  it('should return undefined for non-existent state', () => {
    const state = getStandState('non-existent-event');
    expect(state).toBeUndefined();
  });
});

describe('Presence Status Values', () => {
  it('should accept joined status', () => {
    const message = {
      type: 'presence',
      userId: 'user-1',
      name: 'John',
      status: 'joined',
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });

  it('should accept left status', () => {
    const message = {
      type: 'presence',
      userId: 'user-1',
      name: 'John',
      status: 'left',
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });
});

describe('Command Action Values', () => {
  it('should accept setPage action', () => {
    const message = {
      type: 'command',
      action: 'setPage',
      page: 1,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });

  it('should accept setPiece action', () => {
    const message = {
      type: 'command',
      action: 'setPiece',
      pieceIndex: 0,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });

  it('should accept toggleNightMode action', () => {
    const message = {
      type: 'command',
      action: 'toggleNightMode',
      value: true,
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });
});

describe('Edge Cases', () => {
  it('should handle empty data object in annotation', () => {
    const message = {
      type: 'annotation',
      data: {},
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('annotation');
  });

  it('should handle optional fields in presence message', () => {
    const message = {
      type: 'presence',
      userId: 'user-1',
      name: 'John',
      status: 'joined',
      // section is optional
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });

  it('should handle optional fields in command message', () => {
    const message = {
      type: 'command',
      action: 'toggleNightMode',
      // page, pieceIndex, value are all optional
    };

    const result = parseMessage(message);
    expect(result).not.toBeNull();
  });

  it('should validate page is positive integer', () => {
    const message = {
      type: 'command',
      action: 'setPage',
      page: -1, // Invalid: negative
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });

  it('should validate pieceIndex is non-negative integer', () => {
    const message = {
      type: 'command',
      action: 'setPiece',
      pieceIndex: -1, // Invalid: negative
    };

    const result = parseMessage(message);
    expect(result).toBeNull();
  });
});
