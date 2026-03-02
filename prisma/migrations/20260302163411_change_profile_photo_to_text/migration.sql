-- AlterTable
ALTER TABLE `Member` MODIFY `profilePhoto` TEXT NULL;

-- AlterTable
ALTER TABLE `SmartUploadSession` ADD COLUMN `llmCallCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sourceSha256` CHAR(64) NULL,
    ADD COLUMN `strategyHistory` JSON NULL;

-- CreateIndex
CREATE INDEX `SmartUploadSession_sourceSha256_idx` ON `SmartUploadSession`(`sourceSha256`);
