/**
 * Tests for src/lib/setup/state.ts
 *
 * Uses the same mocking patterns as setup-guard.test.ts:
 *   - vi.mock with getter functions to avoid hoisting issues
 *   - Direct control over mock return values per test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SetupPhase } from '../setup/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Prisma mock – we control the responses per test
const mockQueryRaw = vi.fn();
const mockUserRoleCount = vi.fn();
const mockUserCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    userRole: {
      count: (...args: unknown[]) => mockUserRoleCount(...args),
    },
    user: {
      count: (...args: unknown[]) => mockUserCount(...args),
    },
  },
}));

// Schema-automation mock
let mockMigrationApplied = true;
let mockMigrationPendingCount = 0;

vi.mock('@/lib/setup/schema-automation', () => ({
  checkMigrationStatus: () => ({
    applied: mockMigrationApplied,
    pendingCount: mockMigrationPendingCount,
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  getSetupState,
  verifySetup,
  checkDatabaseConnection,
  checkSuperAdminExists,
  invalidateSetupStateCache,
  SETUP_STATE_CACHE_TTL_MS,
} from '../setup/state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure each test starts with a clean cache. */
function resetAll() {
  invalidateSetupStateCache();
  mockQueryRaw.mockReset();
  mockUserRoleCount.mockReset();
  mockUserCount.mockReset();
  mockMigrationApplied = true;
  mockMigrationPendingCount = 0;
  // Ensure dev auto-setup logic doesn't interfere
  process.env.NODE_ENV = 'test';
  delete process.env.SETUP_MODE;
  // Provide a valid auth secret
  process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
  delete process.env.AUTH_SECRET;
}

// ---------------------------------------------------------------------------
// checkDatabaseConnection
// ---------------------------------------------------------------------------

describe('checkDatabaseConnection', () => {
  beforeEach(resetAll);

  it('returns true when prisma.$queryRaw resolves', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ 1: 1 }]);
    expect(await checkDatabaseConnection()).toBe(true);
  });

  it('returns false when prisma.$queryRaw rejects', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    expect(await checkDatabaseConnection()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkSuperAdminExists
// ---------------------------------------------------------------------------

describe('checkSuperAdminExists', () => {
  beforeEach(resetAll);

  it('returns true when at least one SUPER_ADMIN user role exists', async () => {
    mockUserRoleCount.mockResolvedValueOnce(1);
    expect(await checkSuperAdminExists()).toBe(true);
  });

  it('returns false when count is 0', async () => {
    mockUserRoleCount.mockResolvedValueOnce(0);
    expect(await checkSuperAdminExists()).toBe(false);
  });

  it('returns false when the query throws', async () => {
    mockUserRoleCount.mockRejectedValueOnce(new Error('db error'));
    expect(await checkSuperAdminExists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSetupState – phase transitions
// ---------------------------------------------------------------------------

describe('getSetupState', () => {
  beforeEach(resetAll);

  it('returns CHECKING phase when DB is unreachable', async () => {
    mockQueryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.CHECKING);
    expect(state.readyForLogin).toBe(false);
    expect(state.dbConnected).toBe(false);
    expect(state.error).toMatch(/database connection failed/i);
  });

  it('returns MIGRATING phase when migrations are pending', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = false;
    mockMigrationPendingCount = 3;
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.MIGRATING);
    expect(state.readyForLogin).toBe(false);
    expect(state.dbConnected).toBe(true);
    expect(state.pendingMigrations).toBe(3);
  });

  it('returns MIGRATING phase when migrations not applied and count is 0', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = false;
    mockMigrationPendingCount = 0;
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.MIGRATING);
    expect(state.readyForLogin).toBe(false);
  });

  it('returns VERIFYING phase when no super admin exists', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(0);
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.VERIFYING);
    expect(state.readyForLogin).toBe(false);
    expect(state.hasSuperAdmin).toBe(false);
    expect(state.error).toMatch(/super.admin/i);
  });

  it('returns VERIFYING phase when auth secret is not configured', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    // Remove auth secrets
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.VERIFYING);
    expect(state.readyForLogin).toBe(false);
    expect(state.error).toMatch(/authentication/i);
  });

  it('returns VERIFYING when auth secret is too short', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'short';
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.VERIFYING);
    expect(state.readyForLogin).toBe(false);
  });

  it('returns COMPLETE with readyForLogin=true when all checks pass', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(2);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.COMPLETE);
    expect(state.readyForLogin).toBe(true);
    expect(state.dbConnected).toBe(true);
    expect(state.hasSuperAdmin).toBe(true);
    expect(state.pendingMigrations).toBe(0);
    expect(state.error).toBeUndefined();
  });

  it('accepts AUTH_SECRET as a fallback to BETTER_AUTH_SECRET', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    delete process.env.BETTER_AUTH_SECRET;
    process.env.AUTH_SECRET = 'b'.repeat(32);
    const state = await getSetupState(true);
    expect(state.phase).toBe(SetupPhase.COMPLETE);
    expect(state.readyForLogin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSetupState – caching
// ---------------------------------------------------------------------------

describe('getSetupState caching', () => {
  beforeEach(resetAll);
  afterEach(() => invalidateSetupStateCache());

  it('returns cached result on second call within TTL', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    await getSetupState(true);  // prime cache
    await getSetupState();      // should use cache

    // queryRaw should only have been called once (for the forced refresh)
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates when forceRefresh=true ignoring cache', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    await getSetupState(true);
    await getSetupState(true);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });

  it('re-evaluates after cache TTL expires', async () => {
    // Use fake timers to control Date.now()
    vi.useFakeTimers();
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    await getSetupState(true);                        // prime
    vi.advanceTimersByTime(SETUP_STATE_CACHE_TTL_MS + 1);
    await getSetupState();                            // should re-evaluate

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// verifySetup
// ---------------------------------------------------------------------------

describe('verifySetup', () => {
  beforeEach(resetAll);

  it('returns success=true when all checks pass', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    const result = await verifySetup();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns success=false with an error message when DB is unreachable', async () => {
    mockQueryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await verifySetup();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns success=false when no super admin exists', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(0);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    const result = await verifySetup();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super.admin/i);
  });

  it('always force-refreshes the cache', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    await getSetupState();   // prime cache
    await verifySetup();     // must bypass cache

    // Two DB calls: one from getSetupState(), one from verifySetup()
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// invalidateSetupStateCache
// ---------------------------------------------------------------------------

describe('invalidateSetupStateCache', () => {
  beforeEach(resetAll);

  it('forces re-evaluation on next call', async () => {
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockMigrationApplied = true;
    mockUserRoleCount.mockResolvedValue(1);
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);

    await getSetupState(true);  // prime
    invalidateSetupStateCache();
    await getSetupState();      // must re-evaluate because cache invalidated

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});
