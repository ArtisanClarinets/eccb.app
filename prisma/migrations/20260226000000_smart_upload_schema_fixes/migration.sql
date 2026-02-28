-- Migration: smart_upload_schema_fixes
-- Fixes schema drift caused by partial migration application and new schema fields.
--
-- Changes:
--   1. Add SmartUploadSession.llmPromptVersion (in schema, never migrated)
--   2. Alter SystemSetting.value VARCHAR(191) → TEXT (needed for long prompt storage)
--   3. Add Annotation.sectionId + FK + index (from partially-applied migration)
--   4. Add NavigationLink.toMusicId + FK + index (from partially-applied migration)
--   5. Ensure StandSession unique index exists (schema has @@unique, DB already has it)

-- 1. Add llmPromptVersion to SmartUploadSession
ALTER TABLE `SmartUploadSession` ADD COLUMN `llmPromptVersion` VARCHAR(191) NULL;

-- 2. Widen SystemSetting.value to TEXT for long prompt storage
ALTER TABLE `SystemSetting` MODIFY COLUMN `value` TEXT NOT NULL;

-- 3. Add sectionId to Annotation
-- Hardened for shadow DB: Only add if not present
SET @colCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Annotation' AND COLUMN_NAME = 'sectionId');
SET @sql = IF(@colCount = 0, 'ALTER TABLE `Annotation` ADD COLUMN `sectionId` VARCHAR(191) NULL', 'SELECT "Column sectionId already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idxCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Annotation' AND INDEX_NAME = 'Annotation_sectionId_idx');
SET @sql = IF(@idxCount = 0, 'CREATE INDEX `Annotation_sectionId_idx` ON `Annotation`(`sectionId`)', 'SELECT "Index Annotation_sectionId_idx already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fkCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Annotation' AND CONSTRAINT_NAME = 'Annotation_sectionId_fkey');
SET @sql = IF(@fkCount = 0, 'ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT "FK Annotation_sectionId_fkey already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Add toMusicId to NavigationLink
SET @colCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NavigationLink' AND COLUMN_NAME = 'toMusicId');
SET @sql = IF(@colCount = 0, 'ALTER TABLE `NavigationLink` ADD COLUMN `toMusicId` VARCHAR(191) NULL', 'SELECT "Column toMusicId already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idxCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NavigationLink' AND INDEX_NAME = 'NavigationLink_toMusicId_idx');
SET @sql = IF(@idxCount = 0, 'CREATE INDEX `NavigationLink_toMusicId_idx` ON `NavigationLink`(`toMusicId`)', 'SELECT "Index NavigationLink_toMusicId_idx already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fkCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NavigationLink' AND CONSTRAINT_NAME = 'NavigationLink_toMusicId_fkey');
SET @sql = IF(@fkCount = 0, 'ALTER TABLE `NavigationLink` ADD CONSTRAINT `NavigationLink_toMusicId_fkey` FOREIGN KEY (`toMusicId`) REFERENCES `MusicPiece`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT "FK NavigationLink_toMusicId_fkey already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. StandSession unique index — already exists in DB, create only if missing
SET @idxCount = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StandSession' AND INDEX_NAME = 'StandSession_eventId_userId_key');
SET @sql = IF(@idxCount = 0, 'CREATE UNIQUE INDEX `StandSession_eventId_userId_key` ON `StandSession`(`eventId`, `userId`)', 'SELECT "Index StandSession_eventId_userId_key already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
