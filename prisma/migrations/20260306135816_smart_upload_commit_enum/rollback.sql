-- ====================================
-- ROLLBACK SCRIPT: Smart Upload Session Commit Status Enum
-- ====================================
-- This script reverts the migration to restore the original schema
-- WARNING: Run this only if the migration caused issues

-- Start transaction for safety
START TRANSACTION;

-- ====================================
-- STEP 1: Remove unique constraint and generated column
-- ====================================
-- Drop the unique index on generated column
DROP INDEX IF EXISTS `SmartUploadSession_activeUploadKey_key` ON `SmartUploadSession`;

-- Drop the composite index
DROP INDEX IF EXISTS `SmartUploadSession_sourceSha256_commitStatus_idx` ON `SmartUploadSession`;

-- Drop the generated column
ALTER TABLE `SmartUploadSession` 
DROP COLUMN IF EXISTS `activeUploadKey`;

-- ====================================
-- STEP 2: Revert enum column back to string
-- ====================================
-- Add back the original string column
ALTER TABLE `SmartUploadSession` 
ADD COLUMN `commitStatusOld` VARCHAR(20) 
  NULL 
  DEFAULT 'NOT_STARTED';

-- Migrate enum values back to strings
UPDATE `SmartUploadSession` 
SET `commitStatusOld` = CAST(`commitStatus` AS CHAR);

-- Drop the enum column
ALTER TABLE `SmartUploadSession` 
DROP COLUMN `commitStatus`;

-- Rename the string column back
ALTER TABLE `SmartUploadSession` 
CHANGE COLUMN `commitStatusOld` `commitStatus` 
  VARCHAR(20) 
  NULL 
  DEFAULT 'NOT_STARTED';

-- ====================================
-- STEP 3: Verify rollback
-- ====================================
SELECT 'Rollback verification' as check_name, 
       COUNT(*) as total_records,
       COUNT(DISTINCT `commitStatus`) as distinct_statuses
FROM `SmartUploadSession`;

-- Show sample of rolled back data
SELECT `id`, `commitStatus`, `sourceSha256`
FROM `SmartUploadSession`
LIMIT 5;

-- Commit or rollback based on verification
-- COMMIT;
-- Or if issues found: ROLLBACK;
