-- AlterTable
ALTER TABLE `MusicFile` ADD COLUMN `contentHash` VARCHAR(191) NULL,
    ADD COLUMN `extractedMetadata` JSON NULL,
    ADD COLUMN `ocrText` TEXT NULL,
    ADD COLUMN `originalUploadId` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SmartUploadBatch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('CREATED', 'UPLOADING', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `currentStep` ENUM('VALIDATED', 'TEXT_EXTRACTED', 'METADATA_EXTRACTED', 'SPLIT_PLANNED', 'SPLIT_COMPLETE', 'INGESTED') NULL,
    `totalFiles` INTEGER NOT NULL DEFAULT 0,
    `processedFiles` INTEGER NOT NULL DEFAULT 0,
    `successFiles` INTEGER NOT NULL DEFAULT 0,
    `failedFiles` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `errorSummary` VARCHAR(191) NULL,

    INDEX `SmartUploadBatch_userId_idx`(`userId`),
    INDEX `SmartUploadBatch_status_idx`(`status`),
    INDEX `SmartUploadBatch_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmartUploadItem` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NULL,
    `status` ENUM('CREATED', 'UPLOADING', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `currentStep` ENUM('VALIDATED', 'TEXT_EXTRACTED', 'METADATA_EXTRACTED', 'SPLIT_PLANNED', 'SPLIT_COMPLETE', 'INGESTED') NULL,
    `errorMessage` VARCHAR(191) NULL,
    `errorDetails` JSON NULL,
    `ocrText` TEXT NULL,
    `extractedMeta` JSON NULL,
    `isPacket` BOOLEAN NOT NULL DEFAULT false,
    `splitPages` INTEGER NULL,
    `splitFiles` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `SmartUploadItem_batchId_idx`(`batchId`),
    INDEX `SmartUploadItem_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmartUploadProposal` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `composer` VARCHAR(191) NULL,
    `arranger` VARCHAR(191) NULL,
    `publisher` VARCHAR(191) NULL,
    `difficulty` VARCHAR(191) NULL,
    `genre` VARCHAR(191) NULL,
    `style` VARCHAR(191) NULL,
    `instrumentation` VARCHAR(191) NULL,
    `duration` INTEGER NULL,
    `notes` VARCHAR(191) NULL,
    `titleConfidence` DOUBLE NULL,
    `composerConfidence` DOUBLE NULL,
    `difficultyConfidence` DOUBLE NULL,
    `isApproved` BOOLEAN NOT NULL DEFAULT false,
    `approvedAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `corrections` JSON NULL,
    `matchedPieceId` VARCHAR(191) NULL,
    `isNewPiece` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SmartUploadProposal_itemId_idx`(`itemId`),
    INDEX `SmartUploadProposal_batchId_idx`(`batchId`),
    INDEX `SmartUploadProposal_isApproved_idx`(`isApproved`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SmartUploadItem` ADD CONSTRAINT `SmartUploadItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `SmartUploadBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmartUploadProposal` ADD CONSTRAINT `SmartUploadProposal_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `SmartUploadItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmartUploadProposal` ADD CONSTRAINT `SmartUploadProposal_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `SmartUploadBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
