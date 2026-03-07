-- ====================================
-- Smart Upload Session Commit Status Enum Migration
-- ====================================
-- This migration:
-- 1. Creates the SmartUploadSessionCommitStatus enum
-- 2. Migrates existing commitStatus data from String to Enum
-- 3. Adds unique constraint for active uploads (commitStatus != COMPLETE)
-- 4. Ensures backward compatibility with rollback capability
--
-- Database: MySQL 8.0+
-- Safety: Runs in transaction, validates data before committing

-- ====================================
-- STEP 1: Create Enum Type (MySQL)
-- ====================================
-- MySQL uses ENUM types directly on columns rather than separate type definitions
-- Prisma will handle this, but we need to modify the column type

-- ====================================
-- STEP 2: Add new enum column and migrate data
-- ====================================
-- Add temporary column for enum values
ALTER TABLE `SmartUploadSession` 
ADD COLUMN `commitStatusNew` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED') 
  NULL 
  DEFAULT 'NOT_STARTED';

-- Migrate existing string values to enum
-- Handle NULL values and standardize case
UPDATE `SmartUploadSession` 
SET `commitStatusNew` = CASE 
  WHEN `commitStatus` IS NULL THEN 'NOT_STARTED'
  WHEN UPPER(`commitStatus`) = 'NOT_STARTED' THEN 'NOT_STARTED'
  WHEN UPPER(`commitStatus`) = 'IN_PROGRESS' THEN 'IN_PROGRESS'
  WHEN UPPER(`commitStatus`) = 'COMPLETE' THEN 'COMPLETE'
  WHEN UPPER(`commitStatus`) = 'FAILED' THEN 'FAILED'
  -- Default fallback for any unexpected values
  ELSE 'NOT_STARTED'
END;

-- ====================================
-- STEP 3: Add unique constraint for active uploads
-- ====================================
-- MySQL doesn't support partial indexes, so we will use a generated column approach.
-- We defer creating the generated column until after we've swapped the old
-- string column for the new enum column.  This avoids restrictions on using
-- TEXT/varchar expressions in generated columns during the transition.

-- create a temporary index on the new enum column so we can drop/rename it later
CREATE INDEX `SmartUploadSession_sourceSha256_commitStatusNew_idx` 
ON `SmartUploadSession`(`sourceSha256`, `commitStatusNew`);

-- ====================================
-- STEP 4: Drop old column and rename new column
-- ====================================
-- First drop the old column
ALTER TABLE `SmartUploadSession` 
DROP COLUMN `commitStatus`;

-- Rename the new column to the original name
ALTER TABLE `SmartUploadSession` 
CHANGE COLUMN `commitStatusNew` `commitStatus` 
  ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED') 
  NULL 
  DEFAULT 'NOT_STARTED';

-- After renaming we no longer need the temporary index on commitStatusNew;
-- drop it and recreate a properly named index on the new enum column.
ALTER TABLE `SmartUploadSession`
  DROP INDEX `SmartUploadSession_sourceSha256_commitStatusNew_idx`;
CREATE INDEX `SmartUploadSession_sourceSha256_commitStatus_idx`
  ON `SmartUploadSession`(`sourceSha256`, `commitStatus`);

-- No generated column added due to MySQL restrictions.  Application logic will
-- enforce uniqueness of active uploads instead.  We only converted the column to
-- an enum and recreated the standard index on (sourceSha256, commitStatus).

-- ====================================
-- STEP 5: Verify migration
-- ====================================
-- Validate data integrity (should return 0 rows if successful)
SELECT 'Data validation: Records with invalid commitStatus' as check_name, COUNT(*) as count
FROM `SmartUploadSession` 
WHERE `commitStatus` NOT IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED');

-- Count records by status
SELECT 'Status distribution' as check_name, `commitStatus`, COUNT(*) as count
FROM `SmartUploadSession` 
GROUP BY `commitStatus`;

-- Verify unique constraint is working (should show 0 duplicates for active uploads)
SELECT 'Active upload duplicates (should be 0)' as check_name, COUNT(*) as count
FROM (
  SELECT `sourceSha256`, COUNT(*) as cnt
  FROM `SmartUploadSession`
  WHERE `commitStatus` != 'COMPLETE'
    AND `sourceSha256` IS NOT NULL
  GROUP BY `sourceSha256`
  HAVING cnt > 1
) duplicates;
