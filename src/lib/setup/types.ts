/**
 * Database Setup Types
 *
 * Core type definitions for the idempotent database setup system.
 * Supports both SQLite (dev) and MariaDB/MySQL (prod) environments.
 */

// =============================================================================
// Enums
// =============================================================================

/**
 * Status of the database setup process
 */
export const SetupStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type SetupStatus = (typeof SetupStatus)[keyof typeof SetupStatus];

/**
 * Phase of the setup wizard
 */
export const SetupPhase = {
  CHECKING: 'checking',
  CONFIGURING: 'configuring',
  INITIALIZING: 'initializing',
  MIGRATING: 'migrating',
  SEEDING: 'seeding',
  VERIFYING: 'verifying',
  COMPLETE: 'complete',
} as const;

export type SetupPhase = (typeof SetupPhase)[keyof typeof SetupPhase];

/**
 * Database provider type
 */
export const DatabaseProvider = {
  SQLITE: 'sqlite',
  MYSQL: 'mysql',
  MARIADB: 'mariadb',
  POSTGRESQL: 'postgresql',
} as const;

export type DatabaseProvider = (typeof DatabaseProvider)[keyof typeof DatabaseProvider];

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Configuration for connecting to a MySQL/MariaDB database
 */
export interface DatabaseConnectionConfig {
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Database name */
  database: string;
  /** Database username */
  username: string;
  /** Database password */
  password: string;
  /** Use SSL connection (production) */
  ssl?: boolean;
  /** Connection timeout in milliseconds */
  timeout?: number;
}

/**
 * Root user configuration for database setup (used during initialization)
 */
export interface RootConnectionConfig {
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Root username */
  username: string;
  /** Root password */
  password: string;
  /** Use SSL connection */
  ssl?: boolean;
}

/**
 * Application user configuration
 */
export interface AppUserConfig {
  /** Username for the application user */
  username: string;
  /** Password for the application user */
  password: string;
  /** Database name */
  database: string;
}

/**
 * State of the database setup
 */
export interface DatabaseState {
  /** Whether the database exists */
  databaseExists: boolean;
  /** Whether the app user exists */
  userExists: boolean;
  /** Whether permissions are granted */
  permissionsGranted: boolean;
  /** Whether migrations are applied */
  migrationsApplied: boolean;
  /** Whether seed data is applied */
  dataSeeded: boolean;
}

/**
 * Individual setup step status
 */
export interface SetupStep {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Optional status message */
  message?: string;
  /** Error details if failed */
  error?: string;
}

/**
 * Complete setup status
 */
export interface SetupProgressStatus {
  /** Current phase */
  phase: SetupPhase;
  /** Progress percentage (0-100) */
  progress: number;
  /** Individual steps */
  steps: SetupStep[];
  /** Whether setup can proceed to next step */
  canProceed: boolean;
}

/**
 * Required permissions for the application user
 */
export interface RequiredPermissions {
  /** Database name */
  database: string;
  /** Required privileges */
  privileges: string[];
}

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a setup operation
 */
export type SetupResult =
  | { success: true; message?: string; data?: unknown }
  | { success: false; error: SetupError };

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** Whether connection was successful */
  connected: boolean;
  /** Database version */
  version?: string;
  /** Error message if failed */
  error?: string;
  /** Connection latency in milliseconds */
  latency?: number;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  /** Whether migrations are applied */
  applied: boolean;
  /** Number of pending migrations */
  pendingCount: number;
  /** Last migration applied */
  lastMigration?: string;
  /** Error message if check failed */
  error?: string;
}

/**
 * Migration information
 */
export interface MigrationInfo {
  name: string;
  appliedAt?: Date;
  status: 'applied' | 'pending' | 'failed';
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean;
  appliedMigrations: string[];
  failedMigrations: string[];
  error?: string;
}

/**
 * Database seeding result
 */
export interface SeedingResult {
  success: boolean;
  tablesSeeded: number;
  error?: string;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Custom error class for database setup operations
 */
export class SetupError extends Error {
  /** Error code for programmatic error handling */
  public readonly code: string;
  /** Original error that caused this setup error */
  public readonly originalError?: Error;
  /** Additional context about the error */
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    options?: {
      originalError?: Error;
      context?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.originalError = options?.originalError;
    this.context = options?.context;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SetupError);
    }
  }

  /**
   * Create a connection error
   */
  static connectionFailed(
    message: string,
    originalError?: Error,
  ): SetupError {
    return new SetupError(message, 'CONNECTION_FAILED', {
      originalError,
    });
  }

  /**
   * Create a permission error
   */
  static permissionDenied(
    message: string,
    originalError?: Error,
  ): SetupError {
    return new SetupError(message, 'PERMISSION_DENIED', {
      originalError,
    });
  }

  /**
   * Create a database creation error
   */
  static databaseCreationFailed(
    message: string,
    originalError?: Error,
  ): SetupError {
    return new SetupError(message, 'DATABASE_CREATION_FAILED', {
      originalError,
    });
  }

  /**
   * Create a user creation error
   */
  static userCreationFailed(
    message: string,
    originalError?: Error,
  ): SetupError {
    return new SetupError(message, 'USER_CREATION_FAILED', {
      originalError,
    });
  }

  /**
   * Create a validation error
   */
  static validationFailed(
    message: string,
    context?: Record<string, unknown>,
  ): SetupError {
    return new SetupError(message, 'VALIDATION_FAILED', { context });
  }

  /**
   * Create a configuration error
   */
  static configurationError(
    message: string,
    context?: Record<string, unknown>,
  ): SetupError {
    return new SetupError(message, 'CONFIGURATION_ERROR', { context });
  }

  /**
   * Create a migration error
   */
  static migrationFailed(
    message: string,
    originalError?: Error,
  ): SetupError {
    return new SetupError(message, 'MIGRATION_FAILED', {
      originalError,
    });
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Options for database initialization
 */
export interface InitializeOptions {
  /** Root connection config for setup operations */
  rootConfig: RootConnectionConfig;
  /** Application user configuration */
  appUserConfig: AppUserConfig;
  /** Whether to run migrations */
  runMigrations?: boolean;
  /** Whether to seed data */
  seedData?: boolean;
  /** SSL mode for production */
  ssl?: boolean;
}

/**
 * Database initialization result
 */
export interface InitializeResult {
  /** Whether database was created */
  databaseCreated: boolean;
  /** Whether user was created */
  userCreated: boolean;
  /** Whether permissions were granted */
  permissionsGranted: boolean;
  /** Whether migrations were run */
  migrationsRun: boolean;
  /** Whether data was seeded */
  dataSeeded: boolean;
  /** Connection string for the app user */
  connectionString: string;
}
