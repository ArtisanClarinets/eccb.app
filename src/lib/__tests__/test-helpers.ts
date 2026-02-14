/**
 * Test Helpers
 * 
 * Utility functions and mock factories for testing.
 */

import { vi } from 'vitest';

// =============================================================================
// Mock Factories
// =============================================================================

/**
 * Create a mock user object for testing
 */
export function createMockUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'user-test-id',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock member object for testing
 */
export function createMockMember(overrides: Partial<{
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  status: string;
  joinDate: Date;
}> = {}) {
  return {
    id: 'member-test-id',
    userId: 'user-test-id',
    firstName: 'Test',
    lastName: 'Member',
    status: 'ACTIVE',
    joinDate: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock session object for testing
 */
export function createMockSession(overrides: Partial<{
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
}> = {}) {
  return {
    id: 'session-test-id',
    userId: 'user-test-id',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    token: 'test-token',
    ...overrides,
  };
}

/**
 * Create a mock event object for testing
 */
export function createMockEvent(overrides: Partial<{
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: string;
  status: string;
}> = {}) {
  return {
    id: 'event-test-id',
    title: 'Test Event',
    description: 'A test event',
    startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    location: 'Test Location',
    eventType: 'REHEARSAL',
    status: 'SCHEDULED',
    ...overrides,
  };
}

/**
 * Create a mock music piece object for testing
 */
export function createMockMusicPiece(overrides: Partial<{
  id: string;
  title: string;
  composer: string;
  status: string;
}> = {}) {
  return {
    id: 'music-test-id',
    title: 'Test Piece',
    composer: 'Test Composer',
    status: 'ACTIVE',
    ...overrides,
  };
}

/**
 * Create a mock music file object for testing
 */
export function createMockMusicFile(overrides: Partial<{
  id: string;
  pieceId: string;
  fileName: string;
  storageKey: string;
  fileType: string;
  fileSize: number;
}> = {}) {
  return {
    id: 'file-test-id',
    pieceId: 'music-test-id',
    fileName: 'test.pdf',
    storageKey: 'music/test.pdf',
    fileType: 'PDF',
    fileSize: 1024,
    ...overrides,
  };
}

/**
 * Create a mock role object for testing
 */
export function createMockRole(overrides: Partial<{
  id: string;
  name: string;
  description: string;
}> = {}) {
  return {
    id: 'role-test-id',
    name: 'MEMBER',
    description: 'Standard member role',
    ...overrides,
  };
}

/**
 * Create a mock permission object for testing
 */
export function createMockPermission(overrides: Partial<{
  id: string;
  name: string;
  description: string;
}> = {}) {
  return {
    id: 'permission-test-id',
    name: 'music.view.assigned',
    description: 'View assigned music',
    ...overrides,
  };
}

// =============================================================================
// Mock Request/Response Helpers
// =============================================================================

/**
 * Create a mock NextRequest object
 */
export function createMockRequest(overrides: Partial<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}> = {}) {
  const headers = new Headers(overrides.headers || {});
  return {
    method: overrides.method || 'GET',
    url: overrides.url || 'http://localhost:3000/api/test',
    headers,
    json: vi.fn().mockResolvedValue(overrides.body || {}),
    text: vi.fn().mockResolvedValue(JSON.stringify(overrides.body || {})),
    header: (name: string) => headers.get(name),
  } as unknown as Request;
}

/**
 * Create a mock NextResponse object
 */
export function createMockResponse(data: unknown, status = 200) {
  return {
    status,
    json: vi.fn().mockResolvedValue(data),
    data,
  };
}

// =============================================================================
// Database Mock Helpers
// =============================================================================

/**
 * Create a mock Prisma client for testing
 */
export function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    attendance: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    musicPiece: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    musicFile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    fileDownload: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
    $disconnect: vi.fn(),
  };
}

/**
 * Create a mock Redis client for testing
 */
export function createMockRedis() {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn((key: string) => {
      const value = store.get(key);
      return Promise.resolve(value || null);
    }),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    setex: vi.fn((key: string, _seconds: number, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    exists: vi.fn((key: string) => {
      return Promise.resolve(store.has(key) ? 1 : 0);
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    ttl: vi.fn(() => Promise.resolve(300)),
    keys: vi.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Promise.resolve(Array.from(store.keys()).filter(k => regex.test(k)));
    }),
    flushdb: vi.fn(() => {
      store.clear();
      return Promise.resolve('OK');
    }),
    quit: vi.fn(() => Promise.resolve('OK')),
    _store: store, // Expose store for test manipulation
  };
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that an error was thrown with a specific message
 */
export async function expectThrowsAsync(
  fn: () => Promise<unknown>,
  expectedMessage?: string
): Promise<void> {
  let error: Error | null = null;
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }
  if (!error) {
    throw new Error('Expected function to throw an error, but it did not');
  }
  if (expectedMessage && !error.message.includes(expectedMessage)) {
    throw new Error(
      `Expected error message to include "${expectedMessage}", but got "${error.message}"`
    );
  }
}

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
