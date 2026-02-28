-- CreateTable
CREATE TABLE `StandBookmark` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `pieceId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StandBookmark_userId_idx`(`userId`),
    INDEX `StandBookmark_pieceId_idx`(`pieceId`),
    UNIQUE INDEX `StandBookmark_userId_pieceId_key`(`userId`, `pieceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StandSetlist` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StandSetlist_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StandSetlistItem` (
    `id` VARCHAR(191) NOT NULL,
    `setlistId` VARCHAR(191) NOT NULL,
    `pieceId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,

    INDEX `StandSetlistItem_setlistId_idx`(`setlistId`),
    INDEX `StandSetlistItem_pieceId_idx`(`pieceId`),
    UNIQUE INDEX `StandSetlistItem_setlistId_pieceId_key`(`setlistId`, `pieceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Annotation_musicId_page_layer_idx` ON `Annotation`(`musicId`, `page`, `layer`);

-- CreateIndex
CREATE INDEX `Annotation_musicId_userId_page_idx` ON `Annotation`(`musicId`, `userId`, `page`);

-- AddForeignKey
ALTER TABLE `StandBookmark` ADD CONSTRAINT `StandBookmark_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StandBookmark` ADD CONSTRAINT `StandBookmark_pieceId_fkey` FOREIGN KEY (`pieceId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StandSetlist` ADD CONSTRAINT `StandSetlist_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StandSetlistItem` ADD CONSTRAINT `StandSetlistItem_setlistId_fkey` FOREIGN KEY (`setlistId`) REFERENCES `StandSetlist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StandSetlistItem` ADD CONSTRAINT `StandSetlistItem_pieceId_fkey` FOREIGN KEY (`pieceId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
