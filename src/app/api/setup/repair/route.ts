/**
 * Database Repair API Route
 *
 * Endpoint for fixing database issues:
 * - Reset database (drop & recreate)
 * - Force migration
 * - Reseed data
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  repairDatabase,
  runMigrations,
  seedDatabase,
} from '@/lib/setup/schema-automation';
import { SetupPhase } from '@/lib/setup/types';
import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

interface RepairRequest {
  action: 'reset' | 'migrate' | 'seed' | 'full';
  force?: boolean;
}

interface RepairResponse {
  success: boolean;
  phase: SetupPhase;
  progress: number;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const repairSchema = z.object({
  action: z.enum(['reset', 'migrate', 'seed', 'full']),
  force: z.boolean().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Run full repair process
 */
async function runFullRepair(force: boolean = false): Promise<RepairResponse> {
  try {
    // Phase 1: Reset
    logger.info('Starting full repair: Resetting database');
    const resetResult = repairDatabase({ force });

    if (!resetResult.success) {
      return {
        success: false,
        phase: SetupPhase.CHECKING,
        progress: 10,
        error: resetResult.error || 'Database reset failed',
      };
    }

    // Phase 2: Migration
    logger.info('Starting full repair: Running migrations');
    const migrationResult = runMigrations({ skipSeed: true });

    if (!migrationResult.success) {
      return {
        success: false,
        phase: SetupPhase.MIGRATING,
        progress: 40,
        error: migrationResult.error || 'Migration failed',
      };
    }

    // Phase 3: Seeding
    logger.info('Starting full repair: Seeding database');
    const seedResult = seedDatabase();

    if (!seedResult.success) {
      return {
        success: false,
        phase: SetupPhase.SEEDING,
        progress: 70,
        error: seedResult.error || 'Seeding failed',
      };
    }

    // Complete
    return {
      success: true,
      phase: SetupPhase.COMPLETE,
      progress: 100,
      message: 'Database repair completed successfully',
    };
  } catch (error) {
    logger.error('Full repair failed', error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      phase: SetupPhase.CHECKING,
      progress: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// =============================================================================
// API Handlers
// =============================================================================

/**
 * POST /api/setup/repair
 * Run repair operations
 */
export async function POST(request: Request): Promise<NextResponse<RepairResponse>> {
  try {
    // Validate request body
    const body = await request.json();
    const validation = repairSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          phase: SetupPhase.CHECKING,
          progress: 0,
          error: validation.error.issues.map((e) => e.message).join(', '),
        },
        { status: 400 },
      );
    }

    const { action, force } = validation.data as RepairRequest;

    logger.info(`Repair action: ${action}`, { force });

    // Handle different repair actions
    switch (action) {
      case 'reset': {
        logger.info('Resetting database');
        const resetResult = repairDatabase({ force });

        return NextResponse.json({
          success: resetResult.success,
          phase: resetResult.success ? SetupPhase.COMPLETE : SetupPhase.MIGRATING,
          progress: resetResult.success ? 100 : 50,
          error: resetResult.error,
        });
      }

      case 'migrate': {
        logger.info('Running migrations');
        const migrationResult = runMigrations({ skipSeed: true });

        return NextResponse.json({
          success: migrationResult.success,
          phase: migrationResult.success ? SetupPhase.COMPLETE : SetupPhase.MIGRATING,
          progress: migrationResult.success ? 100 : 50,
          error: migrationResult.error,
        });
      }

      case 'seed': {
        logger.info('Seeding database');
        const seedResult = seedDatabase();

        return NextResponse.json({
          success: seedResult.success,
          phase: seedResult.success ? SetupPhase.COMPLETE : SetupPhase.SEEDING,
          progress: seedResult.success ? 100 : 80,
          error: seedResult.error,
          details: {
            seed: {
              success: seedResult.success,
              tablesSeeded: seedResult.tablesSeeded,
            },
          },
        });
      }

      case 'full':
        return NextResponse.json(await runFullRepair(force));

      default:
        return NextResponse.json(
          {
            success: false,
            phase: SetupPhase.CHECKING,
            progress: 0,
            error: `Unknown action: ${action}`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error('Repair request failed', error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      {
        success: false,
        phase: SetupPhase.CHECKING,
        progress: 0,
        error: error instanceof Error ? error.message : 'Repair request failed',
      },
      { status: 500 },
    );
  }
}
