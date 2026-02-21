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

    UNIQUE INDEX `TaskModelConfig_taskType_key`(`taskType`),
    INDEX `TaskModelConfig_taskType_idx`(`taskType`),
    INDEX `TaskModelConfig_modelId_idx`(`modelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AIModel_isPreferred_idx` ON `AIModel`(`isPreferred`);

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
