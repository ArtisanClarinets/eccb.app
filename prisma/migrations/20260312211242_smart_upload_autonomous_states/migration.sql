-- AlterTable: expand enum + add new provenance columns first
-- (new enum values must exist before we can UPDATE rows to use them)
ALTER TABLE `SmartUploadSession` ADD COLUMN `llmHeaderLabelModel` VARCHAR(191) NULL,
    ADD COLUMN `llmHeaderLabelProvider` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PROCESSING', 'AUTO_COMMITTING', 'AUTO_COMMITTED', 'REQUIRES_REVIEW', 'MANUALLY_APPROVED', 'REJECTED', 'FAILED', 'PENDING_REVIEW', 'APPROVED') NOT NULL DEFAULT 'PROCESSING';

-- ─────────────────────────────────────────────────────────────────────────
-- Data migration: map legacy status values to their new canonical equivalents.
-- Rows still in PENDING_REVIEW were created before the autonomous pipeline and
-- genuinely require human review.  APPROVED rows were manually approved before
-- MANUALLY_APPROVED existed.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE `SmartUploadSession`
  SET `status` = 'REQUIRES_REVIEW'
  WHERE `status` = 'PENDING_REVIEW';

UPDATE `SmartUploadSession`
  SET `status` = 'MANUALLY_APPROVED'
  WHERE `status` = 'APPROVED';
