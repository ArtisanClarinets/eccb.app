/**
 * Setup State Module
 *
 * Authoritative, single source of truth for the application setup readiness.
 * All UI, middleware and API routes delegate to this module to determine
 * whether the system is ready for login and normal operation.
 *
 * Readiness rules (evaluated in order):
 *  1. DB unreachable           → CHECKING,   readyForLogin=false
 *  2. Migrations pending       → MIGRATING,  readyForLogin=false
 *  3. No super-admin user      → VERIFYING,  readyForLogin=false
 *  4. Auth secret not configured → VERIFYING, readyForLogin=false
 *  5. All good                 → COMPLETE,   readyForLogin=true
 *
 * In development mode the module will also attempt to auto-enable SETUP_MODE
 * when the database is empty (no User rows and no UserRole rows), so first-run
 * is seamless without manual env changes.
 */

import { prisma } from '@/lib/db';
import { checkMigrationStatus } from '@/lib/setup/schema-automation';
import type { SetupStateInfo } from '@/lib/setup/types';
import { SetupPhase } from '@/lib/setup/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) the cached state is considered fresh. */
export const SETUP_STATE_CACHE_TTL_MS = 5_000;

// ---------------------------------------------------------------------------
// In-process cache (cleared on process restart / hot-reload)
// ---------------------------------------------------------------------------

let _cachedState: SetupStateInfo | null = null;
let _cacheTs = 0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Detect the database provider from DATABASE_URL. */
function detectProvider(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('.db') || url.includes('sqlite')) return 'sqlite';
  if (url.includes('mysql') || url.includes('mariadb')) return 'mysql';
  if (url.includes('postgres')) return 'postgresql';
  return 'unknown';
}

/** Returns true when BETTER_AUTH_SECRET or AUTH_SECRET is present and long enough. */
function isAuthConfigured(): boolean {
  const secret =
    process.env.BETTER_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    '';
  return secret.length >= 32;
}

// ---------------------------------------------------------------------------
// Exported helpers (also used in tests)
// ---------------------------------------------------------------------------

/**
 * Ping the database. Returns true when a connection can be established.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when at least one user has the SUPER_ADMIN role assigned.
 */
export async function checkSuperAdminExists(): Promise<boolean> {
  try {
    const count = await prisma.userRole.count({
      where: { role: { name: 'SUPER_ADMIN' } },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * In development, detect whether the application database appears to be empty
 * (no User rows **and** no UserRole rows). When that is the case we output a
 * warning suggesting `SETUP_MODE=true`, and – purely as a convenience – we
 * set `process.env.SETUP_MODE` to `"true"` so that callers that read the raw
 * env value will pick it up within this process lifetime.
 *
 * Note: the Zod-validated `env` singleton is initialised once at import time,
 * so we cannot retroactively change its value; only callers that read
 * `process.env.SETUP_MODE` directly benefit.  The state module itself just
 * records the flag in `SetupStateInfo.autoSetupEnabled`.
 */
async function maybeAutoEnableSetupMode(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.SETUP_MODE === 'true') return false; // already enabled

  try {
    const [userCount, roleCount] = await Promise.all([
      prisma.user.count(),
      prisma.userRole.count(),
    ]);

    if (userCount === 0 && roleCount === 0) {
      process.env.SETUP_MODE = 'true';
      console.warn(
        '[setup/state] Empty database detected in development – ' +
          'auto-enabling SETUP_MODE for this process. ' +
          'Set SETUP_MODE=true in your .env to make this permanent.',
      );
      return true;
    }
  } catch {
    // DB not reachable – handled by caller
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Compute (or return cached) the current setup state.
 *
 * @param forceRefresh  When true, bypass the TTL cache and re-evaluate.
 */
export async function getSetupState(forceRefresh = false): Promise<SetupStateInfo> {
  const now = Date.now();

  if (!forceRefresh && _cachedState !== null && now - _cacheTs < SETUP_STATE_CACHE_TTL_MS) {
    return _cachedState;
  }

  // ── Step 1: database connectivity ──────────────────────────────────────
  const dbConnected = await checkDatabaseConnection();
  const provider = detectProvider();

  if (!dbConnected) {
    const state: SetupStateInfo = {
      phase: SetupPhase.CHECKING,
      readyForLogin: false,
      dbConnected: false,
      hasSuperAdmin: false,
      provider,
      error: 'Database connection failed',
    };
    _cachedState = state;
    _cacheTs = now;
    return state;
  }

  // ── Step 1b (dev only): auto-detect empty DB ────────────────────────────
  const autoSetupEnabled = await maybeAutoEnableSetupMode();

  // ── Step 2: migration status ────────────────────────────────────────────
  const migration = checkMigrationStatus();

  if (!migration.applied) {
    const state: SetupStateInfo = {
      phase: SetupPhase.MIGRATING,
      readyForLogin: false,
      dbConnected: true,
      hasSuperAdmin: false,
      provider,
      pendingMigrations: migration.pendingCount ?? 0,
      autoSetupEnabled,
      error:
        migration.pendingCount && migration.pendingCount > 0
          ? `${migration.pendingCount} migration(s) pending`
          : 'Migrations have not been applied',
    };
    _cachedState = state;
    _cacheTs = now;
    return state;
  }

  // ── Step 3: super-admin user ────────────────────────────────────────────
  const hasSuperAdmin = await checkSuperAdminExists();

  if (!hasSuperAdmin) {
    const state: SetupStateInfo = {
      phase: SetupPhase.VERIFYING,
      readyForLogin: false,
      dbConnected: true,
      hasSuperAdmin: false,
      provider,
      pendingMigrations: 0,
      autoSetupEnabled,
      error: 'No super-admin user found – run the setup wizard or seed the database',
    };
    _cachedState = state;
    _cacheTs = now;
    return state;
  }

  // ── Step 4: auth configuration ──────────────────────────────────────────
  if (!isAuthConfigured()) {
    const state: SetupStateInfo = {
      phase: SetupPhase.VERIFYING,
      readyForLogin: false,
      dbConnected: true,
      hasSuperAdmin: true,
      provider,
      pendingMigrations: 0,
      autoSetupEnabled,
      error:
        'Authentication secret is not configured or is too short (BETTER_AUTH_SECRET / AUTH_SECRET must be ≥32 chars)',
    };
    _cachedState = state;
    _cacheTs = now;
    return state;
  }

  // ── All checks passed ───────────────────────────────────────────────────
  const state: SetupStateInfo = {
    phase: SetupPhase.COMPLETE,
    readyForLogin: true,
    dbConnected: true,
    hasSuperAdmin: true,
    provider,
    pendingMigrations: 0,
    autoSetupEnabled,
  };
  _cachedState = state;
  _cacheTs = now;
  return state;
}

/**
 * Force-refresh the state and return a simple pass/fail result.
 * Use this after completing a setup step to confirm readiness.
 */
export async function verifySetup(): Promise<{ success: boolean; error?: string }> {
  const state = await getSetupState(true);

  if (state.phase === SetupPhase.COMPLETE && state.readyForLogin) {
    return { success: true };
  }

  return { success: false, error: state.error ?? 'Setup is incomplete' };
}

/**
 * Invalidate the in-process cache, forcing the next call to re-evaluate.
 * Useful after completing a migration or seeding step.
 */
export function invalidateSetupStateCache(): void {
  _cachedState = null;
  _cacheTs = 0;
}

export { SetupPhase };
