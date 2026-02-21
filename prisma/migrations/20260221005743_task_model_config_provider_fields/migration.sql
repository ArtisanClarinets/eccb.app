-- AlterTable
ALTER TABLE `TaskModelConfig` ADD COLUMN `fallbackModelId` VARCHAR(191) NULL,
    ADD COLUMN `fallbackProviderId` VARCHAR(191) NULL,
    ADD COLUMN `primaryProviderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `TaskModelConfig_primaryProviderId_idx` ON `TaskModelConfig`(`primaryProviderId`);

-- CreateIndex
CREATE INDEX `TaskModelConfig_fallbackProviderId_idx` ON `TaskModelConfig`(`fallbackProviderId`);

-- CreateIndex
CREATE INDEX `TaskModelConfig_fallbackModelId_idx` ON `TaskModelConfig`(`fallbackModelId`);

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_primaryProviderId_fkey` FOREIGN KEY (`primaryProviderId`) REFERENCES `AIProvider`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_fallbackProviderId_fkey` FOREIGN KEY (`fallbackProviderId`) REFERENCES `AIProvider`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskModelConfig` ADD CONSTRAINT `TaskModelConfig_fallbackModelId_fkey` FOREIGN KEY (`fallbackModelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
