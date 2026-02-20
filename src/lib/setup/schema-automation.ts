import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Schema Automation Service
 *
 * Provides programmatic control over Prisma migrations, including:
 * - Running migrations
 * - Checking migration status
 * - Seeding the database
 * - Reset and repair functionality
 *
 * Supports both SQLite (development) and MySQL/MariaDB (production).
 */

const PRISMA_SCHEMA_PATH = join(process.cwd(), 'prisma', 'schema.prisma');
const PRISMA_MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

interface SchemaMigrationStatus {
  applied: boolean;
  pendingCount: number;
  error?: string;
}

interface MigrationResult {
  success: boolean;
  appliedMigrations: string[];
  failedMigrations: string[];
  error?: string;
}

interface SeedingResult {
  success: boolean;
  tablesSeeded: number;
  error?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a Prisma CLI command
 */
function executePrismaCommand(
  command: string,
  options: {
    databaseUrl?: string;
    stdio?: 'pipe' | 'inherit';
  } = {},
): string {
  const { databaseUrl, stdio = 'pipe' } = options;

  try {
    // Basic command validation to prevent injection
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(command) && !command.includes('--name') && !command.includes('--create-only')) {
        throw new Error('Invalid command format');
    }

    // Prepare environment variables properly
    const env = { ...process.env };
    if (databaseUrl) {
      env.DATABASE_URL = databaseUrl;
    }

    const result = execSync(
      `npx prisma ${command}`,
      {
        stdio,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        env, // Pass env via options instead of inline string concatenation
      },
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Prisma command failed: ${message}`);
  }
}

/**
 * Get list of migration files
 */
function getMigrationFiles(): string[] {
  if (!existsSync(PRISMA_MIGRATIONS_DIR)) {
    return [];
  }

  return readdirSync(PRISMA_MIGRATIONS_DIR).filter((item) => {
    const itemPath = join(PRISMA_MIGRATIONS_DIR, item);
    const stat = statSync(itemPath);
    return stat.isDirectory() && !item.startsWith('.');
  });
}

// =============================================================================
// Schema Automation Service
// =============================================================================

/**
 * Schema Automation Service
 *
 * Provides idempotent migration operations for Prisma.
 */
export class SchemaAutomationService {
  private databaseUrl?: string;

  /**
   * Set the database URL for migrations
   */
  setDatabaseUrl(url: string): void {
    this.databaseUrl = url;
  }

  /**
   * Get the current migration status
   */
  getMigrationStatus(): SchemaMigrationStatus {
    try {
      const output = executePrismaCommand('migrate status', { databaseUrl: this.databaseUrl });

      // Parse the output
      const hasPendingMigrations = output.includes('migration pending');
      const appliedCountMatch = output.match(/(\d+) migration[s]?\s+applied/i);
      const pendingCountMatch = output.match(/(\d+) migration[s]?\s+pending/i);

      const appliedCount = appliedCountMatch ? parseInt(appliedCountMatch[1], 10) : 0;
      const pendingCount = pendingCountMatch ? parseInt(pendingCountMatch[1], 10) : 0;

      return {
        applied: !hasPendingMigrations && appliedCount > 0,
        pendingCount: pendingCount,
      };
    } catch (error) {
      // If there's an error, migrations may not be set up yet
      return {
        applied: false,
        pendingCount: -1,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply pending migrations
   */
  applyMigrations(options: {
    name?: string;
    skipSeed?: boolean;
    createOnly?: boolean;
  } = {}): MigrationResult {
    const { name, skipSeed = false, createOnly = false } = options;

    try {
      // Run migrations
      let command = 'migrate deploy';
      if (name) {
        // Validate name to prevent injection
        if (!/^[a-zA-Z0-9\-_]+$/.test(name)) {
            throw new Error('Invalid migration name');
        }
        command = `migrate dev --name ${name}`;
      } else if (createOnly) {
        command = 'migrate dev --create-only';
      }

      executePrismaCommand(command, { databaseUrl: this.databaseUrl, stdio: 'inherit' });

      // Get applied migrations
      const status = this.getMigrationStatus();

      return {
        success: true,
        appliedMigrations: status.applied ? [] : [], // Simplified for this implementation
        failedMigrations: [],
      };
    } catch (error) {
      return {
        success: false,
        appliedMigrations: [],
        failedMigrations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create and apply a new migration
   */
  createMigration(name: string): MigrationResult {
    try {
      // Validate name
      if (!/^[a-zA-Z0-9\-_]+$/.test(name)) {
        throw new Error('Invalid migration name');
      }

      executePrismaCommand(`migrate dev --name ${name}`, {
        databaseUrl: this.databaseUrl,
        stdio: 'inherit',
      });

      return {
        success: true,
        appliedMigrations: [name],
        failedMigrations: [],
      };
    } catch (error) {
      return {
        success: false,
        appliedMigrations: [],
        failedMigrations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reset database and reapply migrations
   */
  resetAndMigrate(options: {
    skipSeed?: boolean;
    force?: boolean;
  } = {}): MigrationResult {
    const { skipSeed = false, force = false } = options;

    try {
      // Reset the database
      const resetCommand = force ? 'migrate reset --force' : 'migrate reset';
      executePrismaCommand(resetCommand, {
        databaseUrl: this.databaseUrl,
        stdio: 'inherit',
      });

      // Apply migrations
      const migrateResult = this.applyMigrations({ skipSeed });

      if (!migrateResult.success) {
        return migrateResult;
      }

      // Seed if not skipped
      if (!skipSeed) {
        const seedResult = this.seedDatabase();
        if (!seedResult.success) {
          return {
            success: false,
            appliedMigrations: migrateResult.appliedMigrations,
            failedMigrations: [],
            error: `Migration succeeded but seeding failed: ${seedResult.error}`,
          };
        }
      }

      return {
        success: true,
        appliedMigrations: migrateResult.appliedMigrations,
        failedMigrations: [],
      };
    } catch (error) {
      return {
        success: false,
        appliedMigrations: [],
        failedMigrations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Seed the database
   */
  seedDatabase(): SeedingResult {
    try {
      executePrismaCommand('db seed', {
        databaseUrl: this.databaseUrl,
        stdio: 'inherit',
      });

      return {
        success: true,
        tablesSeeded: -1,
      };
    } catch (error) {
      return {
        success: false,
        tablesSeeded: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate Prisma client
   */
  generateClient(): boolean {
    try {
      executePrismaCommand('generate', {
        stdio: 'inherit',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate schema file
   */
  validateSchema(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!existsSync(PRISMA_SCHEMA_PATH)) {
      errors.push('Prisma schema file not found');
      return { valid: false, errors };
    }

    try {
      const schema = readFileSync(PRISMA_SCHEMA_PATH, 'utf-8');

      // Basic validation checks
      if (!schema.includes('generator client')) {
        errors.push('Missing generator client block');
      }
      if (!schema.includes('datasource')) {
        errors.push('Missing datasource block');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Failed to read schema',
      );
      return { valid: false, errors };
    }
  }

  /**
   * Pull schema from database
   */
  pullSchema(): boolean {
    try {
      executePrismaCommand('db pull', {
        databaseUrl: this.databaseUrl,
        stdio: 'inherit',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available migrations
   */
  getAvailableMigrations(): string[] {
    return getMigrationFiles();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new SchemaAutomationService instance
 */
export function createSchemaAutomationService(): SchemaAutomationService {
  return new SchemaAutomationService();
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick migration status check
 */
export function checkMigrationStatus(): SchemaMigrationStatus {
  const service = createSchemaAutomationService();
  return service.getMigrationStatus();
}

/**
 * Run pending migrations
 */
export function runMigrations(options?: {
  name?: string;
  skipSeed?: boolean;
}): MigrationResult {
  const service = createSchemaAutomationService();
  return service.applyMigrations(options);
}

/**
 * Reset and remigrate (for repair scenarios)
 */
export function repairDatabase(options?: {
  skipSeed?: boolean;
  force?: boolean;
}): MigrationResult {
  const service = createSchemaAutomationService();
  return service.resetAndMigrate(options);
}

/**
 * Seed the database
 */
export function seedDatabase(): SeedingResult {
  const service = createSchemaAutomationService();
  return service.seedDatabase();
}

/**
 * Generate Prisma client
 */
export function generatePrismaClient(): boolean {
  const service = createSchemaAutomationService();
  return service.generateClient();
}

// =============================================================================
// Export
// =============================================================================

export default {
  SchemaAutomationService,
  createSchemaAutomationService,
  checkMigrationStatus,
  runMigrations,
  repairDatabase,
  seedDatabase,
  generatePrismaClient,
};
