-- AlterTable: Add fromPage / toPage to NavigationLink (schema had them, migration did not)
ALTER TABLE `NavigationLink` ADD COLUMN `fromPage` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `NavigationLink` ADD COLUMN `toPage` INTEGER NOT NULL DEFAULT 1;

-- AlterTable: Add toMusicId to NavigationLink for cross-piece navigation
ALTER TABLE `NavigationLink` ADD COLUMN `toMusicId` VARCHAR(191) NULL;

-- AlterTable: Add sectionId to Annotation for section-scoped annotations
ALTER TABLE `Annotation` ADD COLUMN `sectionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `NavigationLink_toMusicId_idx` ON `NavigationLink`(`toMusicId`);
CREATE INDEX `Annotation_sectionId_idx` ON `Annotation`(`sectionId`);

-- AddForeignKey
ALTER TABLE `NavigationLink` ADD CONSTRAINT `NavigationLink_toMusicId_fkey` FOREIGN KEY (`toMusicId`) REFERENCES `MusicPiece`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
