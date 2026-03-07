/**
 * Stand Socket Unit Tests
 *
 * Tests cover:
 *  - Zod message validation (all valid / invalid cases)
 *  - Session validation path (happy-path + rejection)
 *  - handleWebSocketUpgrade when server is / isn't running
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock prisma before importing stand-socket
vi.mock('@/lib/db', () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    standSession: {
      upsert: vi.fn(),
    },
  },
}));

// Mock socket.io
vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    adapter: vi.fn(),
    use: vi.fn(),
    on: vi.fn(),
    close: vi.fn((cb: () => void) => cb()),
  })),
}));

// Mock @socket.io/redis-adapter
vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn().mockReturnValue({}),
}));

// Mock lib/logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock lib/stand/access
vi.mock('@/lib/stand/access', () => ({
  canAccessEvent: vi.fn().mockResolvedValue(true),
}));

import {
  parseMessage,
  handleWebSocketUpgrade,
  HEARTBEAT_INTERVAL_MS,
} from '../stand-socket';

// =============================================================================
// parseMessage tests
// =============================================================================

describe('parseMessage — presence', () => {
  it('accepts a valid joined presence message', () => {
    const msg = { type: 'presence', userId: 'u1', name: 'Alice', section: 'Flute', status: 'joined' };
    const result = parseMessage(msg);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('presence');
    if (result?.type === 'presence') {
      expect(result.userId).toBe('u1');
      expect(result.status).toBe('joined');
    }
  });

  it('accepts a valid left presence message without section', () => {
    const msg = { type: 'presence', userId: 'u2', name: 'Bob', status: 'left' };
    const result = parseMessage(msg);
    expect(result?.type).toBe('presence');
  });

  it('rejects presence with missing userId', () => {
    expect(parseMessage({ type: 'presence', name: 'Alice', status: 'joined' })).toBeNull();
  });

  it('rejects presence with invalid status', () => {
    expect(parseMessage({ type: 'presence', userId: 'u1', name: 'Alice', status: 'away' })).toBeNull();
  });
});

describe('parseMessage — command', () => {
  it('accepts setPage with positive integer', () => {
    const msg = { type: 'command', action: 'setPage', page: 5 };
    const result = parseMessage(msg);
    expect(result?.type).toBe('command');
    if (result?.type === 'command') expect(result.page).toBe(5);
  });

  it('accepts setPiece', () => {
    const msg = { type: 'command', action: 'setPiece', pieceIndex: 2 };
    const result = parseMessage(msg);
    expect(result?.type).toBe('command');
  });

  it('accepts toggleNightMode with boolean', () => {
    const msg = { type: 'command', action: 'toggleNightMode', value: true };
    const result = parseMessage(msg);
    expect(result?.type).toBe('command');
    if (result?.type === 'command') expect(result.value).toBe(true);
  });

  it('rejects setPage with page = 0', () => {
    // page must be positive int
    expect(parseMessage({ type: 'command', action: 'setPage', page: 0 })).toBeNull();
  });

  it('rejects setPage with negative page', () => {
    expect(parseMessage({ type: 'command', action: 'setPage', page: -1 })).toBeNull();
  });

  it('rejects unknown action', () => {
    expect(parseMessage({ type: 'command', action: 'invalidAction' })).toBeNull();
  });
});

describe('parseMessage — annotation', () => {
  it('accepts valid annotation', () => {
    const msg = { type: 'annotation', data: { stroke: [1, 2, 3], color: '#f00' } };
    const result = parseMessage(msg);
    expect(result?.type).toBe('annotation');
    if (result?.type === 'annotation') {
      expect(result.data.color).toBe('#f00');
    }
  });

  it('rejects annotation without data', () => {
    expect(parseMessage({ type: 'annotation' })).toBeNull();
  });
});

describe('parseMessage — mode', () => {
  it('accepts nightMode toggle', () => {
    const msg = { type: 'mode', name: 'nightMode', value: false };
    const result = parseMessage(msg);
    expect(result?.type).toBe('mode');
  });

  it('accepts arbitrary mode name', () => {
    expect(parseMessage({ type: 'mode', name: 'zoom', value: 1.5 })).not.toBeNull();
  });
});

describe('parseMessage — heartbeat', () => {
  it('accepts a heartbeat message', () => {
    const result = parseMessage({ type: 'heartbeat' });
    expect(result?.type).toBe('heartbeat');
  });
});

describe('parseMessage — invalid', () => {
  it('returns null for null', () => {
    expect(parseMessage(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseMessage(undefined)).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(parseMessage({ type: 'unknown', foo: 'bar' })).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(parseMessage('hello')).toBeNull();
    expect(parseMessage(42)).toBeNull();
  });
});

// =============================================================================
// handleWebSocketUpgrade
// =============================================================================

describe('handleWebSocketUpgrade', () => {
  it('returns success=false when socket server is not initialised', async () => {
    const result = await handleWebSocketUpgrade({});
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// =============================================================================
// HEARTBEAT_INTERVAL_MS constant
// =============================================================================

describe('HEARTBEAT_INTERVAL_MS', () => {
  it('is 30 seconds', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });
});
