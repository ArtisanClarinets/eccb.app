# Database Setup and Repair System Architecture

## System Overview

The Database Setup and Repair System provides a corporate-grade, idempotent solution for initializing and maintaining MariaDB databases in both development and production environments. The system addresses provider inconsistencies, automates schema management, and provides a user-friendly interface for non-technical users.

### Key Features
- **Idempotent Operations**: Detects existing state and only performs necessary actions
- **Multi-Environment Support**: Handles SQLite (dev) and MariaDB (prod) seamlessly
- **User-Friendly UI**: Web-based setup wizard with progress indicators
- **Comprehensive Error Handling**: Actionable guidance for failure scenarios
- **Security-First**: Secure password generation and secrets management

### Architecture Diagram

```mermaid
graph TB
    subgraph "User Interface"
        SW[Setup Wizard UI]
        HC[Health Check UI]
    end

    subgraph "API Layer"
        SA[Setup API Routes]
        HA[Health API Routes]
    end

    subgraph "Business Logic"
        DSS[Database Setup Service]
        EMS[Environment Manager]
        VCS[Validation Service]
    end

    subgraph "Data Layer"
        DB[(Database)]
        FS[File System]
        ENV[Environment Variables]
    end

    subgraph "External Systems"
        MA[MariaDB Server]
        PG[PostgreSQL Fallback]
        SL[SQLite Dev]
    end

    SW --> SA
    HC --> HA
    SA --> DSS
    HA --> DSS
    DSS --> DB
    DSS --> MA
    DSS --> PG
    DSS --> SL
    EMS --> ENV
    EMS --> FS
    VCS --> ENV
    VCS --> DB
```

## Component Design

### Database Setup Service (`src/lib/database/setup.ts`)

Core service handling all database operations with idempotent logic.

**Key Methods:**
- `checkDatabaseState()`: Detects current database, user, and permissions state
- `createDatabase()`: Creates database if not exists
- `createUser()`: Creates application user with secure password
- `grantPermissions()`: Grants necessary permissions
- `runMigrations()`: Executes Prisma migrations
- `seedData()`: Runs seed scripts
- `verifySetup()`: Validates complete setup

**State Detection Logic:**
```typescript
interface DatabaseState {
  databaseExists: boolean;
  userExists: boolean;
  permissionsGranted: boolean;
  migrationsApplied: boolean;
  dataSeeded: boolean;
}
```

### Environment Manager (`src/lib/env/manager.ts`)

Handles environment variable generation, validation, and template management.

**Key Methods:**
- `generateEnvFile()`: Creates `.env` from templates with secure defaults
- `validateEnv()`: Validates environment variables against schema
- `updateEnvExample()`: Updates `.env.example` template
- `securePassword()`: Generates cryptographically secure passwords

### Validation Service (`src/lib/validation/database.ts`)

Validates database connectivity, schema integrity, and configuration.

**Key Methods:**
- `testConnection()`: Tests database connectivity
- `validateSchema()`: Ensures schema matches expectations
- `checkMigrations()`: Verifies migration state
- `validatePermissions()`: Confirms user permissions

### Setup Wizard UI (`src/app/setup/page.tsx`)

React-based wizard interface for non-technical users.

**Wizard Steps:**
1. **Environment Check**: Detects current setup state
2. **Configuration**: Allows database connection settings
3. **Database Setup**: Executes database initialization
4. **Migration**: Runs schema migrations
5. **Seeding**: Applies seed data
6. **Verification**: Confirms successful setup

**Progress Indicators:**
- Step-by-step progress bar
- Real-time status updates
- Error messages with actionable guidance

### Setup API Routes (`src/app/api/setup/`)

RESTful API endpoints for setup operations.

**Endpoints:**
- `GET /api/setup/status`: Returns current setup state
- `POST /api/setup/check`: Validates configuration
- `POST /api/setup/database`: Initializes database
- `POST /api/setup/migrate`: Runs migrations
- `POST /api/setup/seed`: Seeds data
- `POST /api/setup/verify`: Verifies complete setup
- `POST /api/setup/repair`: Repairs broken database connections

---

## Repair API Route (`src/app/api/setup/repair/route.ts`)

### Overview

The Repair API provides a programmatic interface for repairing broken database connections and fixing setup issues. This endpoint is designed for scenarios where the database connection has become corrupted or the setup state is inconsistent.

### Endpoint

```
POST /api/setup/repair
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | The repair action to perform. Valid values: `reset`, `migrate`, `seed`, `full` |
| `force` | boolean | No | Bypass confirmation prompts. Defaults to `false` |

### Request Body Example

```json
{
  "action": "full",
  "force": true
}
```

### Response Format

All responses follow this TypeScript interface:

```typescript
interface RepairResponse {
  success: boolean;
  phase: SetupPhase;
  progress: number;
  message?: string;
  error?: string;
  details?: {
    migrations?: MigrationStatus;
    seed?: {
      success: boolean;
      tablesSeeded?: number;
    };
  };
}
```

### Repair Actions

| Action | Description | Progress |
|--------|-------------|----------|
| `reset` | Reset and reapply database migrations | 0% → 100% |
| `migrate` | Run database migrations only | 0% → 100% |
| `seed` | Seed database with initial data | 0% → 80% |
| `full` | Run complete repair (reset + migrate + seed) | 0% → 100% |

### Example Responses

**Successful Full Repair:**
```json
{
  "success": true,
  "phase": "complete",
  "progress": 100,
  "message": "Repair completed successfully",
  "details": {
    "seed": {
      "success": true,
      "tablesSeeded": 8
    }
  }
}
```

**Validation Error:**
```json
{
  "success": false,
  "phase": "checking",
  "progress": 0,
  "error": "Action must be one of: reset, migrate, seed, full"
}
```

### Technical Details

- **TypeScript Compliance**: Full strict mode TypeScript with explicit return types
- **Validation**: Uses Zod schema validation for request body
- **Error Handling**: Comprehensive error handling with detailed error messages
- **Logging**: Integrates with the application's logger for audit trails

---

## ProgressIndicator Component (`src/components/setup/progress-indicator.tsx`)

### Overview

The `ProgressIndicator` component provides a visual representation of setup progress with step-by-step status tracking. It displays a progress bar and individual step indicators with icons and status messages.

### Props Interface

```typescript
interface Step {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
}

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: Step[];
  progress: number;
  className?: string;
}
```

### Visual States

| Status | Icon | Background Color | Text Color |
|--------|------|-----------------|------------|
| `pending` | ○ (empty circle) | `bg-slate-800/50` | `text-slate-400` |
| `running` | ◐ (half circle) | `bg-primary/10` with border | `text-white` with pulse animation |
| `completed` | ● (filled circle) | `bg-green-500/10` | `text-green-400` |
| `failed` | ✕ (cross) | `bg-red-500/10` | `text-red-400` |

### Integration with Setup Wizard

The component integrates with the setup wizard by:

1. **Receiving Step Data**: The parent component passes an array of `Step` objects representing each phase of the setup process
2. **Tracking Progress**: The `progress` prop (0-100) controls the progress bar
3. **Highlighting Current Step**: The `currentStep` index determines which step is currently active
4. **Displaying Messages**: Each step can display an optional message below its name

### Usage Example

```tsx
import { ProgressIndicator } from '@/components/setup/progress-indicator';

const steps = [
  { id: 'check', name: 'Checking Environment', status: 'completed' },
  { id: 'config', name: 'Configuring Database', status: 'running' },
  { id: 'migrate', name: 'Running Migrations', status: 'pending' },
  { id: 'seed', name: 'Seeding Data', status: 'pending' },
];

<ProgressIndicator
  currentStep={1}
  totalSteps={4}
  steps={steps}
  progress={50}
/>
```

### Technical Details

- **TypeScript**: Full strict mode TypeScript with explicit return types
- **Styling**: Uses Tailwind CSS with design system colors
- **Accessibility**: Semantic HTML with proper color contrast
- **Dependencies**: Uses the Radix UI `Progress` component

---

## Known Issues

### Pre-existing Prisma Configuration Error

> **Status**: Known Issue - Unrelated to Setup/Repair Updates

There is a pre-existing Prisma configuration error in the codebase that manifests as:

```
Error: prisma:error received invalid response: 6a
```

**Root Cause**: Database adapter mismatch - the application uses a PostgreSQL adapter (`PrismaPg`) with a MySQL/MariaDB connection string.

| Component | Current Value | Expected |
|-----------|--------------|----------|
| `prisma/schema.prisma` | `provider = "mysql"` | ✅ Correct |
| `.env DATABASE_URL` | `mysql://root:password@localhost:3306/eccb_dev` | ✅ Correct |
| `src/lib/db/index.ts` | Uses `PrismaPg` adapter + `pg` package | ❌ **Wrong - PostgreSQL adapter!** |

**This issue is unrelated to the setup and repair workflow implementation** and should be addressed separately by updating `src/lib/db/index.ts` to use the standard Prisma client without a custom adapter.

**Recommended Fix**: Replace the PostgreSQL adapter with the standard Prisma client:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
```

For more details, see [`DIAGNOSIS.md`](../../DIAGNOSIS.md).

---

## File Structure

### New Files Created

```
src/
├── lib/
│   ├── database/
│   │   ├── setup.ts              # Core setup service
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── validation.ts         # Database validation logic
│   ├── env/
│   │   ├── manager.ts            # Environment management
│   │   └── templates.ts          # Environment templates
│   └── validation/
│       └── database.ts           # Validation utilities
├── app/
│   ├── setup/
│   │   ├── page.tsx              # Setup wizard UI
│   │   ├── components/
│   │   │   ├── wizard.tsx        # Main wizard component
│   │   │   ├── steps/            # Individual step components
│   │   │   └── progress.tsx      # Progress indicator
│   │   └── actions.ts            # Server actions
│   └── api/
│       └── setup/
│           ├── route.ts           # Main setup API
│           ├── status/
│           │   └── route.ts       # Status endpoint
│           ├── database/
│           │   └── route.ts       # Database setup endpoint
│           ├── migrate/
│           │   └── route.ts       # Migration endpoint
│           └── seed/
│               └── route.ts       # Seeding endpoint
scripts/
├── setup-database.ts             # CLI setup script
└── repair-database.ts            # CLI repair script
docs/
└── DATABASE_SETUP_ARCHITECTURE.md # This document
```

### Modified Files

- `prisma/schema.prisma`: Update provider consistency
- `prisma/seed.ts`: Fix adapter usage
- `src/lib/auth/config.ts`: Align provider settings
- `src/lib/env.ts`: Add setup-related validation
- `src/app/api/health/route.ts`: Integrate setup health checks
- `.env.example`: Update with new variables

## API Design

### Request/Response Format

All API endpoints use consistent JSON format:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}
```

### Setup Status Endpoint

```typescript
GET /api/setup/status
Response: ApiResponse<SetupStatus>

interface SetupStatus {
  phase: 'checking' | 'configuring' | 'initializing' | 'migrating' | 'seeding' | 'verifying' | 'complete';
  progress: number; // 0-100
  steps: SetupStep[];
  canProceed: boolean;
}

interface SetupStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  error?: string;
}
```

### Database Setup Endpoint

```typescript
POST /api/setup/database
Body: DatabaseConfig
Response: ApiResponse<DatabaseResult>

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

interface DatabaseResult {
  databaseCreated: boolean;
  userCreated: boolean;
  permissionsGranted: boolean;
  connectionString: string;
}
```

## UI Flow

### Setup Wizard Flow

```mermaid
stateDiagram-v2
    [*] --> EnvironmentCheck
    EnvironmentCheck --> Configuration: Needs Setup
    EnvironmentCheck --> Complete: Already Set Up

    Configuration --> DatabaseSetup
    DatabaseSetup --> Migration: Success
    DatabaseSetup --> Error: Failure

    Migration --> Seeding: Success
    Migration --> Error: Failure

    Seeding --> Verification: Success
    Seeding --> Error: Failure

    Verification --> Complete: Success
    Verification --> Error: Failure

    Error --> Configuration: Retry
    Error --> [*]: Cancel

    Complete --> [*]
```

### User Experience

1. **Access**: Users navigate to `/setup` when database issues detected
2. **Detection**: Automatic detection of current state with clear status
3. **Guidance**: Step-by-step wizard with progress indicators
4. **Configuration**: Simple form for database connection details
5. **Execution**: Real-time progress with detailed status messages
6. **Completion**: Success confirmation with next steps

### Error Handling UI

- **Connection Errors**: Clear messages with troubleshooting tips
- **Permission Errors**: Guidance on database user setup
- **Migration Errors**: Options to retry or rollback
- **Validation Errors**: Specific field-level error messages

## Security Considerations

### Secrets Management

- **Password Generation**: Cryptographically secure random passwords
- **Environment Variables**: Never log sensitive values
- **File Permissions**: Restrict access to `.env` files
- **Runtime Security**: Validate all database inputs

### Authentication & Authorization

- **Setup Access**: Restrict to administrators only
- **API Security**: Rate limiting and input validation
- **Session Management**: Secure session handling during setup

### Data Protection

- **Connection Security**: SSL/TLS for production databases
- **Audit Logging**: Log setup actions without sensitive data
- **Rollback Safety**: Safe rollback mechanisms for failed operations

## Implementation Phases

### Phase 1: Core Database Setup Service
- Implement `DatabaseSetupService` with basic detection logic
- Add idempotent database creation and user setup
- Create CLI scripts for manual setup

### Phase 2: Environment Management
- Implement `EnvironmentManager` for `.env` generation
- Add validation and template management
- Update `.env.example` with new variables

### Phase 3: API Endpoints
- Create setup API routes with proper error handling
- Implement status checking and progress reporting
- Add comprehensive input validation

### Phase 4: Setup Wizard UI
- Build React-based wizard interface
- Implement progress indicators and error handling
- Add responsive design for mobile/desktop

### Phase 5: Integration & Testing
- Integrate with existing health check system
- Add comprehensive error handling and recovery
- Create unit and integration tests

### Phase 6: Documentation & Deployment
- Complete architecture documentation
- Update deployment scripts
- Add setup verification in CI/CD

## Error Handling Strategy

### Connection Failures
- **Detection**: Timeout and connection refused errors
- **Recovery**: Retry with exponential backoff
- **User Guidance**: Clear messages about network/firewall issues

### Permission Errors
- **Detection**: Access denied errors during setup
- **Recovery**: Attempt to grant permissions or prompt for manual setup
- **User Guidance**: Step-by-step database user creation instructions

### Migration Failures
- **Detection**: Prisma migration errors
- **Recovery**: Attempt rollback to previous state
- **User Guidance**: Options to retry, skip, or manual intervention

### Schema Inconsistencies
- **Detection**: Schema validation failures
- **Recovery**: Force reset option for development environments
- **User Guidance**: Clear explanation of schema conflicts

### Validation Errors
- **Detection**: Zod validation failures
- **Recovery**: Return detailed field-level error messages
- **User Guidance**: Inline help text and examples

### Recovery Mechanisms

- **Automatic Retry**: For transient failures (network, temporary locks)
- **Manual Intervention**: For configuration or permission issues
- **Rollback Support**: Safe rollback for failed migrations
- **State Persistence**: Track setup progress across restarts

### Logging Strategy

- **Error Levels**: Debug, info, warn, error
- **Sensitive Data**: Never log passwords or connection strings
- **Context**: Include operation context and user actions
- **Monitoring**: Integration with existing logging system