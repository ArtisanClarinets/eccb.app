/**
 * Database Validation Service
 *
 * Validates database connectivity, schema integrity, and permissions.
 */

import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import {
  SetupError,
} from './types';
import type {
  ConnectionTestResult,
  DatabaseConnectionConfig,
  DatabaseProvider,
  MigrationStatus,
  RequiredPermissions,
} from './types';

import { DatabaseProvider as Provider } from './types';

// =============================================================================
// Constants
// =============================================================================

const CONNECTION_TIMEOUT = 10000;
const DEFAULT_MYSQL_PORT = 3306;

/**
 * Required tables for the application
 */
const REQUIRED_TABLES = [
  'User',
  'Account',
  'Session',
  'Role',
  'Permission',
  'Member',
  'Event',
  'Attendance',
];

/**
 * Required privileges for app user
 */
const REQUIRED_PRIVILEGES: RequiredPermissions['privileges'] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
];

// =============================================================================
// Connection Validation
// =============================================================================

/**
 * Test database connectivity
 */
export async function checkDatabaseConnection(
  config: DatabaseConnectionConfig,
): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port || DEFAULT_MYSQL_PORT,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
      connectTimeout: CONNECTION_TIMEOUT,
    });

    const connection = await pool.getConnection();

    // Get version
    const [versionRows] = await connection.query<RowDataPacket[]>('SELECT VERSION() as version');
    const version = versionRows[0]?.version || 'unknown';

    // Test basic query
    await connection.query('SELECT 1');

    connection.release();

    return {
      connected: true,
      version,
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - startTime,
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * Test connection without specifying database (for root user setup)
 */
export async function testRootConnection(
  host: string,
  port: number,
  username: string,
  password: string,
  ssl?: boolean,
): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host,
      port: port || DEFAULT_MYSQL_PORT,
      user: username,
      password,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
      connectTimeout: CONNECTION_TIMEOUT,
    });

    const connection = await pool.getConnection();
    const [versionRows] = await connection.query<RowDataPacket[]>('SELECT VERSION() as version');
    const version = versionRows[0]?.version || 'unknown';

    connection.release();

    return {
      connected: true,
      version,
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - startTime,
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// =============================================================================
// Schema Validation
// =============================================================================

/**
 * Check if schema migrations are applied
 */
export async function checkSchemaStatus(
  config: DatabaseConnectionConfig,
): Promise<MigrationStatus> {
  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port || DEFAULT_MYSQL_PORT,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
    });

    const connection = await pool.getConnection();

    // Check for Prisma migrations table
    const [migrations] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = '_prisma_migrations'`,
      [config.database],
    );

    const hasMigrationsTable = (migrations[0] as { count: number })?.count > 0;

    if (!hasMigrationsTable) {
      connection.release();
      return {
        applied: false,
        pendingCount: -1, // Unknown - need to run migrations
      };
    }

    // Get migration status
    const [migrationRows] = await connection.query<RowDataPacket[]>(
      `SELECT migration_name, finished_at FROM _prisma_migrations 
       ORDER BY finished_at DESC LIMIT 1`,
    );

    connection.release();

    if (migrationRows.length > 0) {
      return {
        applied: true,
        pendingCount: 0,
        lastMigration: migrationRows[0].migration_name,
      };
    }

    return {
      applied: false,
      pendingCount: -1,
    };
  } catch {
    return {
      applied: false,
      pendingCount: -1,
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * Check if required tables exist
 */
export async function checkRequiredTables(
  config: DatabaseConnectionConfig,
): Promise<{ exists: boolean; missing: string[] }> {
  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port || DEFAULT_MYSQL_PORT,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
    });

    const connection = await pool.getConnection();

    // Get all tables in database
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [config.database],
    );

    const existingTables = new Set(tables.map((t) => t.TABLE_NAME));
    const missing = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

    connection.release();

    return {
      exists: missing.length === 0,
      missing,
    };
  } catch (error) {
    throw SetupError.validationFailed(
      'Failed to check required tables',
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// =============================================================================
// Permission Validation
// =============================================================================

/**
 * Verify user has required permissions
 */
export async function checkPermissions(
  config: DatabaseConnectionConfig,
  requiredPrivileges: RequiredPermissions['privileges'] = REQUIRED_PRIVILEGES,
): Promise<{ hasPermissions: boolean; missing: string[] }> {
  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port || DEFAULT_MYSQL_PORT,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
    });

    const connection = await pool.getConnection();

    // Check current grants
    const [grants] = await connection.query<RowDataPacket[]>(
      `SHOW GRANTS FOR CURRENT_USER()`,
    );

    connection.release();

    const grantStrings = grants.map((g) => Object.values(g)[0] as string);

    // Check each required privilege
    const missing: string[] = [];

    for (const privilege of requiredPrivileges) {
      const hasPrivilege = grantStrings.some(
        (grant) =>
          grant.includes(privilege) ||
          grant.includes('ALL PRIVILEGES') ||
          grant.includes('*.*'),
      );

      if (!hasPrivilege) {
        missing.push(privilege);
      }
    }

    return {
      hasPermissions: missing.length === 0,
      missing,
    };
  } catch (error) {
    throw SetupError.validationFailed(
      'Failed to check permissions',
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * Test specific table access
 */
export async function testTableAccess(
  config: DatabaseConnectionConfig,
  tableName: string,
): Promise<boolean> {
  let pool: Pool | null = null;

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port || DEFAULT_MYSQL_PORT,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 2,
    });

    const connection = await pool.getConnection();

    // Try to select from table
    await connection.query(`SELECT 1 FROM \`${tableName}\` LIMIT 1`);

    connection.release();

    return true;
  } catch {
    return false;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// =============================================================================
// Comprehensive Validation
// =============================================================================

/**
 * Complete database validation result
 */
export interface CompleteValidationResult {
  connection: ConnectionTestResult;
  schema: MigrationStatus;
  tables: {
    exists: boolean;
    missing: string[];
  };
  permissions: {
    hasPermissions: boolean;
    missing: string[];
  };
  isReady: boolean;
}

/**
 * Run comprehensive database validation
 */
export async function validateDatabase(
  config: DatabaseConnectionConfig,
): Promise<CompleteValidationResult> {
  // Test connection
  const connection = await checkDatabaseConnection(config);

  if (!connection.connected) {
    return {
      connection,
      schema: { applied: false, pendingCount: -1 },
      tables: { exists: false, missing: REQUIRED_TABLES },
      permissions: { hasPermissions: false, missing: REQUIRED_PRIVILEGES },
      isReady: false,
    };
  }

  // Check schema
  const schema = await checkSchemaStatus(config);

  // Check tables
  const tables = await checkRequiredTables(config);

  // Check permissions
  const permissions = await checkPermissions(config);

  const isReady = connection.connected && schema.applied && tables.exists && permissions.hasPermissions;

  return {
    connection,
    schema,
    tables,
    permissions,
    isReady,
  };
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detect actual database provider from connection
 */
export async function detectProvider(
  config: DatabaseConnectionConfig,
): Promise<DatabaseProvider> {
  const result = await checkDatabaseConnection(config);

  if (!result.connected || !result.version) {
    return Provider.MYSQL; // Default
  }

  const version = result.version.toLowerCase();

  if (version.includes('mariadb')) {
    return Provider.MARIADB;
  }
  if (version.includes('postgresql') || version.includes('postgres')) {
    return Provider.POSTGRESQL;
  }

  return Provider.MYSQL;
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Database health check result
 */
export interface DatabaseHealthResult {
  healthy: boolean;
  latency?: number;
  error?: string;
}

/**
 * Quick health check - just tests connection
 */
export async function quickHealthCheck(
  config: DatabaseConnectionConfig,
): Promise<DatabaseHealthResult> {
  const startTime = Date.now();

  try {
    const result = await checkDatabaseConnection(config);

    return {
      healthy: result.connected,
      latency: result.latency,
      error: result.error,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Export
// =============================================================================

export default {
  checkDatabaseConnection,
  testRootConnection,
  checkSchemaStatus,
  checkRequiredTables,
  checkPermissions,
  testTableAccess,
  validateDatabase,
  detectProvider,
  quickHealthCheck,
};
