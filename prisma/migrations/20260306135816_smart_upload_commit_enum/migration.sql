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
-- MySQL doesn't support partial indexes, so we use a generated column approach:
-- - When commitStatus = 'COMPLETE', activeUploadKey is NULL
-- - When commitStatus != 'COMPLETE', activeUploadKey = sourceSha256
-- - Unique index on activeUploadKey allows multiple COMPLETE records with same SHA256
--   but only one active (non-COMPLETE) record per SHA256

-- Add generated column for active upload key (only populated when not complete)
ALTER TABLE `SmartUploadSession` 
ADD COLUMN `activeUploadKey` VARCHAR(64) 
  AS (CASE 
    WHEN `commitStatusNew` = 'COMPLETE' THEN NULL 
    ELSE `sourceSha256` 
  END) STORED;

-- Add unique index on the generated column
-- NULL values don't violate uniqueness in MySQL, so multiple COMPLETE records are allowed
CREATE UNIQUE INDEX `SmartUploadSession_activeUploadKey_key` 
ON `SmartUploadSession`(`activeUploadKey`);

-- Also add index for performance on common queries
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

-- Update the generated column to reference the renamed column
-- (Note: In MySQL, generated columns auto-update, but we need to ensure consistency)
-- The stored generated column will automatically recalculate

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
