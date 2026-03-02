-- CreateTable: PracticeLog — tracks individual practice sessions per user/piece
CREATE TABLE `PracticeLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `pieceId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NULL,
    `durationSeconds` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `practicedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PracticeLog_userId_idx`(`userId`),
    INDEX `PracticeLog_pieceId_idx`(`pieceId`),
    INDEX `PracticeLog_practicedAt_idx`(`practicedAt`),
    INDEX `PracticeLog_userId_pieceId_idx`(`userId`, `pieceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PracticeLog` ADD CONSTRAINT `PracticeLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeLog` ADD CONSTRAINT `PracticeLog_pieceId_fkey` FOREIGN KEY (`pieceId`) REFERENCES `MusicPiece`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
