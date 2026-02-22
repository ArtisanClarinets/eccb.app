-- AlterTable
ALTER TABLE `EmailLog` ADD COLUMN `updatedAt` DATETIME(3) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MusicFile` ADD COLUMN `contentHash` VARCHAR(191) NULL,
    ADD COLUMN `extractedMetadata` LONGTEXT NULL,
    ADD COLUMN `ocrText` TEXT NULL,
    ADD COLUMN `originalUploadId` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MusicPiece` ADD COLUMN `confidenceScore` INTEGER NULL,
    ADD COLUMN `source` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserNotification` ADD COLUMN `updatedAt` DATETIME(3) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SmartUploadSession` (
    `id` VARCHAR(191) NOT NULL,
    `uploadSessionId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `extractedMetadata` JSON NULL,
    `confidenceScore` INTEGER NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `uploadedBy` VARCHAR(191) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SmartUploadSession_uploadSessionId_key`(`uploadSessionId`),
    INDEX `SmartUploadSession_uploadSessionId_idx`(`uploadSessionId`),
    INDEX `SmartUploadSession_status_idx`(`status`),
    INDEX `SmartUploadSession_uploadedBy_idx`(`uploadedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIModel` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `supportsVision` BOOLEAN NOT NULL DEFAULT false,
    `supportsStructuredOutput` BOOLEAN NOT NULL DEFAULT false,
    `supportsStreaming` BOOLEAN NOT NULL DEFAULT false,
    `maxTokens` INTEGER NULL,
    `contextWindow` INTEGER NULL,
    `lastFetched` DATETIME(3) NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isPreferred` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AIModel_isDefault_idx`(`isDefault`),
    INDEX `AIModel_isPreferred_idx`(`isPreferred`),
    INDEX `AIModel_providerId_idx`(`providerId`),
    UNIQUE INDEX `AIModel_providerId_modelId_key`(`providerId`, `modelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIProvider` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `baseUrl` VARCHAR(191) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `capabilities` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AIProvider_providerId_key`(`providerId`),
    INDEX `AIProvider_isEnabled_idx`(`isEnabled`),
    INDEX `AIProvider_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `APIKey` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `keyName` VARCHAR(191) NULL,
    `encryptedKey` TEXT NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `isValid` BOOLEAN NOT NULL DEFAULT false,
    `validationError` VARCHAR(191) NULL,
    `lastValidated` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `APIKey_isActive_idx`(`isActive`),
    INDEX `APIKey_providerId_idx`(`providerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModelParameter` (
    `id` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `paramType` VARCHAR(191) NOT NULL,
    `defaultValue` DOUBLE NULL,
    `minValue` DOUBLE NULL,
    `maxValue` DOUBLE NULL,
    `stringDefault` VARCHAR(191) NULL,
    `allowedValues` LONGTEXT NULL,
    `userValue` DOUBLE NULL,
    `userStringValue` VARCHAR(191) NULL,
    `isAdvanced` BOOLEAN NOT NULL DEFAULT false,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ModelParameter_modelId_idx`(`modelId`),
    UNIQUE INDEX `ModelParameter_modelId_name_key`(`modelId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettingsAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `fieldName` VARCHAR(191) NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `changedBy` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SettingsAuditLog_changedBy_idx`(`changedBy`),
    INDEX `SettingsAuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `SettingsAuditLog_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

    INDEX `SmartUploadBatch_createdAt_idx`(`createdAt`),
    INDEX `SmartUploadBatch_status_idx`(`status`),
    INDEX `SmartUploadBatch_userId_idx`(`userId`),
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
    `errorDetails` LONGTEXT NULL,
    `ocrText` TEXT NULL,
    `extractedMeta` LONGTEXT NULL,
    `isPacket` BOOLEAN NOT NULL DEFAULT false,
    `splitPages` INTEGER NULL,
    `splitFiles` LONGTEXT NULL,
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
    `corrections` LONGTEXT NULL,
    `matchedPieceId` VARCHAR(191) NULL,
    `isNewPiece` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SmartUploadProposal_batchId_idx`(`batchId`),
    INDEX `SmartUploadProposal_isApproved_idx`(`isApproved`),
    INDEX `SmartUploadProposal_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmartUploadSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    UNIQUE INDEX `SmartUploadSetting_key_key`(`key`),
    INDEX `SmartUploadSetting_category_idx`(`category`),
    INDEX `SmartUploadSetting_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskModelConfig` (
    `id` VARCHAR(191) NOT NULL,
    `taskType` ENUM('METADATA_EXTRACTION', 'AUDIO_ANALYSIS', 'SUMMARIZATION', 'TRANSCRIPTION', 'CLASSIFICATION') NOT NULL,
    `modelId` VARCHAR(191) NULL,
    `temperature` DOUBLE NULL,
    `maxTokens` INTEGER NULL,
    `topP` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `fallbackModelId` VARCHAR(191) NULL,
    `fallbackProviderId` VARCHAR(191) NULL,
    `primaryProviderId` VARCHAR(191) NULL,

    UNIQUE INDEX `TaskModelConfig_taskType_key`(`taskType`),
    INDEX `TaskModelConfig_fallbackModelId_idx`(`fallbackModelId`),
    INDEX `TaskModelConfig_fallbackProviderId_idx`(`fallbackProviderId`),
    INDEX `TaskModelConfig_modelId_idx`(`modelId`),
    INDEX `TaskModelConfig_primaryProviderId_idx`(`primaryProviderId`),
    INDEX `TaskModelConfig_taskType_idx`(`taskType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AIModel` ADD CONSTRAINT `AIModel_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `AIProvider`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `APIKey` ADD CONSTRAINT `APIKey_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `AIProvider`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModelParameter` ADD CONSTRAINT `ModelParameter_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `AIModel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmartUploadItem` ADD CONSTRAINT `SmartUploadItem_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `SmartUploadBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmartUploadProposal` ADD CONSTRAINT `SmartUploadProposal_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `SmartUploadBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmartUploadProposal` ADD CONSTRAINT `SmartUploadProposal_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `SmartUploadItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_fallbackModelId_fkey` FOREIGN KEY (`fallbackModelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_fallbackProviderId_fkey` FOREIGN KEY (`fallbackProviderId`) REFERENCES `AIProvider`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_primaryProviderId_fkey` FOREIGN KEY (`primaryProviderId`) REFERENCES `AIProvider`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
