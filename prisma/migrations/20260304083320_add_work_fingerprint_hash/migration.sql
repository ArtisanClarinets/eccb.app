-- AlterTable
ALTER TABLE `MusicPiece` ADD COLUMN `workFingerprintHash` CHAR(16) NULL;

-- CreateIndex
CREATE INDEX `MusicPiece_workFingerprintHash_idx` ON `MusicPiece`(`workFingerprintHash`);
