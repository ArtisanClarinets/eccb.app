-- Migration: smart_upload_idempotency_constraints
-- Goals:
--   1) Harden work-level dedupe with a unique work fingerprint hash
--   2) Add stable part fingerprint fields for part-level idempotency
--   3) Add commit lifecycle tracking fields on SmartUploadSession

-- --------------------------------------------------------------------------
-- MusicPiece.workFingerprintHash: widen + enforce uniqueness safely
-- --------------------------------------------------------------------------

ALTER TABLE `MusicPiece`
  MODIFY COLUMN `workFingerprintHash` CHAR(64) NULL;

-- Keep one row per fingerprint and null out the rest so unique index can be added
UPDATE `MusicPiece` p
JOIN `MusicPiece` keep_row
  ON p.`workFingerprintHash` = keep_row.`workFingerprintHash`
 AND p.`workFingerprintHash` IS NOT NULL
 AND p.`id` > keep_row.`id`
SET p.`workFingerprintHash` = NULL;

-- Drop old non-unique index if present
SET @idxCount = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'MusicPiece'
    AND INDEX_NAME = 'MusicPiece_workFingerprintHash_idx'
);
SET @sql = IF(
  @idxCount > 0,
  'DROP INDEX `MusicPiece_workFingerprintHash_idx` ON `MusicPiece`',
  'SELECT "Index MusicPiece_workFingerprintHash_idx not present"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add unique index if missing
SET @uniqIdxCount = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'MusicPiece'
    AND INDEX_NAME = 'MusicPiece_workFingerprintHash_key'
);
SET @sql = IF(
  @uniqIdxCount = 0,
  'CREATE UNIQUE INDEX `MusicPiece_workFingerprintHash_key` ON `MusicPiece`(`workFingerprintHash`)',
  'SELECT "Unique index MusicPiece_workFingerprintHash_key already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------------
-- MusicFile: add part fingerprint + indexes
-- --------------------------------------------------------------------------

ALTER TABLE `MusicFile`
  ADD COLUMN `partFingerprintHash` CHAR(64) NULL;

CREATE INDEX `MusicFile_contentHash_idx` ON `MusicFile`(`contentHash`);
CREATE INDEX `MusicFile_partFingerprintHash_idx` ON `MusicFile`(`partFingerprintHash`);
CREATE UNIQUE INDEX `MusicFile_pieceId_fileType_partFingerprintHash_key`
  ON `MusicFile`(`pieceId`, `fileType`, `partFingerprintHash`);

-- --------------------------------------------------------------------------
-- SmartUploadSession: commit lifecycle tracking fields
-- --------------------------------------------------------------------------

ALTER TABLE `SmartUploadSession`
  ADD COLUMN `commitStatus` VARCHAR(191) NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN `commitAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `committedAt` DATETIME(3) NULL,
  ADD COLUMN `committedPieceId` VARCHAR(191) NULL,
  ADD COLUMN `committedFileId` VARCHAR(191) NULL,
  ADD COLUMN `commitError` TEXT NULL;

CREATE INDEX `SmartUploadSession_commitStatus_idx` ON `SmartUploadSession`(`commitStatus`);
CREATE INDEX `SmartUploadSession_committedPieceId_idx` ON `SmartUploadSession`(`committedPieceId`);
CREATE INDEX `SmartUploadSession_committedFileId_idx` ON `SmartUploadSession`(`committedFileId`);

-- --------------------------------------------------------------------------
-- MusicPart: stable part fingerprint + dedupe indexes
-- --------------------------------------------------------------------------

ALTER TABLE `MusicPart`
  ADD COLUMN `partFingerprintHash` CHAR(64) NULL;

CREATE INDEX `MusicPart_partFingerprintHash_idx` ON `MusicPart`(`partFingerprintHash`);
CREATE UNIQUE INDEX `MusicPart_pieceId_partFingerprintHash_key`
  ON `MusicPart`(`pieceId`, `partFingerprintHash`);
