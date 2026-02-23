-- AlterTable
ALTER TABLE `MusicFile` ADD COLUMN `instrumentName` VARCHAR(191) NULL,
    ADD COLUMN `pageCount` INTEGER NULL,
    ADD COLUMN `partLabel` VARCHAR(191) NULL,
    ADD COLUMN `partNumber` INTEGER NULL,
    ADD COLUMN `section` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MusicPart` ADD COLUMN `pageCount` INTEGER NULL,
    ADD COLUMN `partLabel` VARCHAR(191) NULL,
    ADD COLUMN `partNumber` INTEGER NULL,
    ADD COLUMN `section` VARCHAR(191) NULL,
    ADD COLUMN `storageKey` VARCHAR(191) NULL,
    ADD COLUMN `transposition` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MusicPiece` ADD COLUMN `ensembleType` VARCHAR(191) NULL,
    ADD COLUMN `keySignature` VARCHAR(191) NULL,
    ADD COLUMN `tempo` VARCHAR(191) NULL,
    ADD COLUMN `timeSignature` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SmartUploadSession` ADD COLUMN `autoApproved` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `cuttingInstructions` JSON NULL,
    ADD COLUMN `firstPassRaw` LONGTEXT NULL,
    ADD COLUMN `llmModelParams` JSON NULL,
    ADD COLUMN `llmProvider` VARCHAR(191) NULL,
    ADD COLUMN `llmVerifyModel` VARCHAR(191) NULL,
    ADD COLUMN `llmVisionModel` VARCHAR(191) NULL,
    ADD COLUMN `parseStatus` VARCHAR(191) NULL,
    ADD COLUMN `parsedParts` JSON NULL,
    ADD COLUMN `secondPassRaw` LONGTEXT NULL,
    ADD COLUMN `secondPassResult` JSON NULL,
    ADD COLUMN `secondPassStatus` VARCHAR(191) NULL,
    ADD COLUMN `tempFiles` JSON NULL;

-- CreateTable
CREATE TABLE `SectionMessage` (
    `id` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SectionMessage_sectionId_idx`(`sectionId`),
    INDEX `SectionMessage_memberId_idx`(`memberId`),
    INDEX `SectionMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarpoolEntry` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `type` ENUM('OFFER', 'REQUEST') NOT NULL,
    `seats` INTEGER NULL,
    `location` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CarpoolEntry_eventId_idx`(`eventId`),
    INDEX `CarpoolEntry_memberId_idx`(`memberId`),
    UNIQUE INDEX `CarpoolEntry_eventId_memberId_key`(`eventId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SectionMessage` ADD CONSTRAINT `SectionMessage_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SectionMessage` ADD CONSTRAINT `SectionMessage_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarpoolEntry` ADD CONSTRAINT `CarpoolEntry_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarpoolEntry` ADD CONSTRAINT `CarpoolEntry_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
