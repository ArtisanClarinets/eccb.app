/**
 * Setup Status API Route
 *
 * Get current setup status including:
 * - Database connection status
 * - Migration status
 * - Seed data status
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkMigrationStatus } from '@/lib/setup/schema-automation';
import { SetupPhase, type SetupProgressStatus } from '@/lib/setup/types';
import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

interface StatusResponse {
  success: boolean;
  phase: SetupPhase;
  progress: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  message: string;
  details?: {
    database?: {
      connected: boolean;
      provider?: string;
    };
    migrations?: {
      applied: boolean;
      pendingCount: number;
      lastMigration?: string;
    };
    seed?: {
      applied: boolean;
    };
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check database connection status
 */
async function checkDatabaseConnection(): Promise<{ connected: boolean; provider?: string }> {
  try {
    // Use the shared singleton – avoids creating a stray PrismaClient and
    // burning an extra connection on every status check.
    await prisma.$queryRaw`SELECT 1`;

    // Get provider from DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL || '';
    let provider = 'unknown';

    if (databaseUrl.includes('.db') || databaseUrl.includes('sqlite')) {
      provider = 'sqlite';
    } else if (databaseUrl.includes('mysql') || databaseUrl.includes('mariadb')) {
      provider = 'mysql';
    } else if (databaseUrl.includes('postgres')) {
      provider = 'postgresql';
    }

    return { connected: true, provider };
  } catch {
    return { connected: false };
  }
}

// =============================================================================
// API Handlers
// =============================================================================

/**
 * GET /api/setup/status
 * Get current setup status
 */
export async function GET(): Promise<NextResponse<StatusResponse>> {
  try {
    // Check database connection
    const dbStatus = await checkDatabaseConnection();

    // Check migration status
    const migrationStatus = checkMigrationStatus();

    // Determine overall status
    let phase: SetupPhase = SetupPhase.CHECKING;
    let progress = 0;
    let status: StatusResponse['status'] = 'not_started';
    let message = 'Checking system status...';

    if (!dbStatus.connected) {
      phase = SetupPhase.CHECKING;
      progress = 0;
      status = 'failed';
      message = 'Database connection failed';
    } else if (!migrationStatus.applied && migrationStatus.pendingCount > 0) {
      phase = SetupPhase.MIGRATING;
      progress = 30;
      status = 'in_progress';
      message = `${migrationStatus.pendingCount} migration(s) pending`;
    } else if (!migrationStatus.applied && migrationStatus.pendingCount === 0) {
      phase = SetupPhase.INITIALIZING;
      progress = 10;
      status = 'not_started';
      message = 'Database initialized, migrations required';
    } else if (migrationStatus.applied) {
      phase = SetupPhase.COMPLETE;
      progress = 100;
      status = 'completed';
      message = 'System is ready';
    }

    const response: StatusResponse = {
      success: true,
      phase,
      progress,
      status,
      message,
      details: {
        database: dbStatus,
        migrations: {
          applied: migrationStatus.applied,
          pendingCount: migrationStatus.pendingCount,
          lastMigration: migrationStatus.lastMigration,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to get setup status', error instanceof Error ? error : new Error(String(error)));

    const response: StatusResponse = {
      success: false,
      phase: SetupPhase.CHECKING,
      progress: 0,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Failed to check status',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
