-- AlterTable
ALTER TABLE `SmartUploadSession` ADD COLUMN `adjudicatorRaw` LONGTEXT NULL,
    ADD COLUMN `adjudicatorResult` JSON NULL,
    ADD COLUMN `adjudicatorStatus` VARCHAR(191) NULL,
    ADD COLUMN `finalConfidence` INTEGER NULL,
    ADD COLUMN `llmAdjudicatorModel` VARCHAR(191) NULL,
    ADD COLUMN `requiresHumanReview` BOOLEAN NOT NULL DEFAULT false;
