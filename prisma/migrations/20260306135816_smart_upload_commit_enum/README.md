# Smart Upload Session Commit Status Enum Migration

## Overview

This migration converts the `SmartUploadSession.commitStatus` field from a `String?` to a proper `SmartUploadSessionCommitStatus?` enum type. This ensures type safety and enables proper database constraints for idempotent upload handling.

## Changes Made

### 1. New Enum Created
```prisma
enum SmartUploadSessionCommitStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETE
  FAILED
}
```

### 2. Model Field Updated
```prisma
// Before:
commitStatus String? @default("NOT_STARTED")

// After:
commitStatus SmartUploadSessionCommitStatus? @default(NOT_STARTED)
```

### 3. Unique Constraint for Active Uploads
A unique constraint has been added to prevent concurrent duplicate uploads of the same file (by SHA-256 hash) when not yet completed.

**Logic:**
- Multiple `COMPLETE` uploads with the same `sourceSha256` are allowed
- Only one active upload (`NOT_STARTED`, `IN_PROGRESS`, or `FAILED`) is allowed per `sourceSha256`
- This enables idempotent upload handling with proper conflict detection

**Implementation (MySQL):**
```sql
-- Generated column that is NULL when commitStatus = 'COMPLETE'
ADD COLUMN activeUploadKey VARCHAR(64) 
  AS (CASE 
    WHEN commitStatus = 'COMPLETE' THEN NULL 
    ELSE sourceSha256 
  END) STORED;

-- Unique index - NULL values don't violate uniqueness
CREATE UNIQUE INDEX SmartUploadSession_activeUploadKey_key 
ON SmartUploadSession(activeUploadKey);
```

## Migration Details

### Files Created
1. `migration.sql` - Forward migration with data conversion
2. `rollback.sql` - Rollback script for reverting changes
3. `README.md` - This documentation

### Data Migration
The migration safely handles existing data:
- `NULL` or `'NOT_STARTED'` → `NOT_STARTED`
- `'IN_PROGRESS'` → `IN_PROGRESS`
- `'COMPLETE'` → `COMPLETE`
- `'FAILED'` → `FAILED`
- Any unexpected values default to `NOT_STARTED`

### Backward Compatibility
- **Rollback available**: Run `rollback.sql` to revert to string-based status
- **API compatibility**: Existing code using string comparisons will need minor updates
- **Database compatibility**: MySQL 8.0+ required for generated columns

## Usage in Code

### Before (String-based):
```typescript
// ❌ Old way - string comparison
if (session.commitStatus === 'IN_PROGRESS') { ... }
```

### After (Enum-based):
```typescript
import { SmartUploadSessionCommitStatus } from '@prisma/client';

// ✅ New way - type-safe enum comparison
if (session.commitStatus === SmartUploadSessionCommitStatus.IN_PROGRESS) { ... }

// ✅ Also works with Prisma queries
const activeUploads = await prisma.smartUploadSession.findMany({
  where: {
    commitStatus: {
      not: SmartUploadSessionCommitStatus.COMPLETE
    }
  }
});
```

## Verification

### Check Migration Status
```bash
npm run db:generate
npx tsc --noEmit
```

### Verify Database Schema
```sql
-- Check enum values
DESCRIBE SmartUploadSession;

-- Verify unique constraint
SHOW INDEX FROM SmartUploadSession;

-- Check data integrity
SELECT commitStatus, COUNT(*) 
FROM SmartUploadSession 
GROUP BY commitStatus;
```

## Rollback Instructions

If issues occur, run the rollback script:

```bash
# Connect to database and run:
mysql -u username -p database_name < rollback.sql
```

Or manually execute the rollback SQL in the database console.

## Security & Performance Notes

- **Transaction Safety**: Migration runs in a single transaction
- **Data Integrity**: Validates enum values before committing
- **Index Performance**: Generated column index is efficient for the upload deduplication use case
- **No Data Loss**: All existing commitStatus values are preserved during migration
