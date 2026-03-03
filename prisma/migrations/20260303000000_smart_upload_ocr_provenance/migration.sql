-- Migration: Add OCR provenance fields to SmartUploadSession for OCR-first pipeline
-- Created: 2026-03-03
-- Purpose: Store OCR engine, mode, and raw text for provenance tracking in OCR-first Smart Upload pipeline

-- Add OCR engine used (tesseract, ocrmypdf, vision_api, native)
ALTER TABLE `SmartUploadSession` ADD COLUMN `ocrEngineUsed` VARCHAR(191) NULL;

-- Add OCR mode used (header, full, both)
ALTER TABLE `SmartUploadSession` ADD COLUMN `ocrModeUsed` VARCHAR(191) NULL;

-- Add raw OCR text for debugging/provenance (LongText for large content)
ALTER TABLE `SmartUploadSession` ADD COLUMN `rawOcrText` LONGTEXT NULL;

-- Add character count of OCR text for quick validation
ALTER TABLE `SmartUploadSession` ADD COLUMN `ocrTextChars` INT NULL;

-- Create indexes for OCR provenance fields for efficient querying
CREATE INDEX `SmartUploadSession_ocrEngineUsed_idx` ON `SmartUploadSession`(`ocrEngineUsed`);
CREATE INDEX `SmartUploadSession_ocrModeUsed_idx` ON `SmartUploadSession`(`ocrModeUsed`);
