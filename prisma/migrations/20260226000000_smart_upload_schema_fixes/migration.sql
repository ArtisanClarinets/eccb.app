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
ALTER TABLE `Annotation` ADD COLUMN `sectionId` VARCHAR(191) NULL;
CREATE INDEX `Annotation_sectionId_idx` ON `Annotation`(`sectionId`);
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_sectionId_fkey`
  FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Add toMusicId to NavigationLink
ALTER TABLE `NavigationLink` ADD COLUMN `toMusicId` VARCHAR(191) NULL;
CREATE INDEX `NavigationLink_toMusicId_idx` ON `NavigationLink`(`toMusicId`);
ALTER TABLE `NavigationLink` ADD CONSTRAINT `NavigationLink_toMusicId_fkey`
  FOREIGN KEY (`toMusicId`) REFERENCES `MusicPiece`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. StandSession unique index — already exists in DB, create only if missing
CREATE UNIQUE INDEX IF NOT EXISTS `StandSession_eventId_userId_key`
  ON `StandSession`(`eventId`, `userId`);
