-- AlterTable
ALTER TABLE `SmartUploadSession` ADD COLUMN `routingDecision` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Annotation` (
    `id` VARCHAR(191) NOT NULL,
    `musicId` VARCHAR(191) NOT NULL,
    `page` INTEGER NOT NULL,
    `layer` ENUM('PERSONAL', 'SECTION', 'DIRECTOR') NOT NULL,
    `strokeData` JSON NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Annotation_musicId_idx`(`musicId`),
    INDEX `Annotation_userId_idx`(`userId`),
    INDEX `Annotation_layer_idx`(`layer`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NavigationLink` (
    `id` VARCHAR(191) NOT NULL,
    `musicId` VARCHAR(191) NOT NULL,
    `fromX` DOUBLE NOT NULL,
    `fromY` DOUBLE NOT NULL,
    `toX` DOUBLE NOT NULL,
    `toY` DOUBLE NOT NULL,
    `label` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NavigationLink_musicId_idx`(`musicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StandSession` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StandSession_eventId_idx`(`eventId`),
    INDEX `StandSession_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AudioLink` (
    `id` VARCHAR(191) NOT NULL,
    `pieceId` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AudioLink_pieceId_idx`(`pieceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPreferences` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nightMode` BOOLEAN NOT NULL DEFAULT false,
    `metronomeSettings` JSON NULL,
    `midiMappings` JSON NULL,
    `otherSettings` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserPreferences_userId_key`(`userId`),
    INDEX `UserPreferences_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_musicId_fkey` FOREIGN KEY (`musicId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NavigationLink` ADD CONSTRAINT `NavigationLink_musicId_fkey` FOREIGN KEY (`musicId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AudioLink` ADD CONSTRAINT `AudioLink_pieceId_fkey` FOREIGN KEY (`pieceId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPreferences` ADD CONSTRAINT `UserPreferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
