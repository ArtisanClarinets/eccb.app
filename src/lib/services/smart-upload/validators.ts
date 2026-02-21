/**
 * Validators Service
 *
 * Provides validation functions for Smart Upload files.
 * Validates MIME types, file sizes, and batch limits.
 */

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ValidationResult, FileInfo } from './smart-upload.types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Allowed MIME types for Smart Upload.
 * Includes PDFs, audio files, and common image formats.
 */
export const ALLOWED_MIME_TYPES = [
  // PDF
  'application/pdf',

  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',

  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',

  // Music notation (optional future support)
  'application/vnd.recordare.musicxml',
  'application/xml',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Maximum file size in bytes (100 MB).
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Default maximum number of files per upload.
 */
export const DEFAULT_MAX_FILES = 20;

/**
 * Default maximum total bytes for batch uploads.
 */
export const DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500MB

// =============================================================================
// File Validation
// =============================================================================

/**
 * Validate a single file for Smart Upload.
 *
 * Checks:
 * - MIME type is allowed
 * - File size is within limits
 *
 * @param file - File to validate
 * @returns ValidationResult with any errors or warnings
 */
export function validateSmartUploadFile(file: FileInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.debug('Validating file', {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  // Validate MIME type
  if (!isAllowedMimeType(file.type)) {
    errors.push(
      `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(
      `File too large: ${formatFileSize(file.size)}. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`
    );
  }

  // Warning for very small files
  if (file.size < 1024) {
    warnings.push(`File is very small: ${file.size} bytes`);
  }

  // Warning for empty files
  if (file.size === 0) {
    errors.push('File is empty');
  }

  // Check filename for suspicious patterns
  const filenameWarning = validateFilename(file.name);
  if (filenameWarning) {
    warnings.push(filenameWarning);
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('File validation failed', {
      name: file.name,
      errors,
    });
  }

  return {
    valid,
    errors,
    warnings,
  };
}

// =============================================================================
// Batch Validation
// =============================================================================

/**
 * Validate batch upload limits.
 *
 * Checks:
 * - Number of files doesn't exceed maximum
 * - Total size doesn't exceed maximum
 *
 * @param files - Array of files to validate
 * @param maxFiles - Maximum number of files (default from env or 20)
 * @param maxTotalBytes - Maximum total bytes (default from env or 500MB)
 * @returns ValidationResult with any errors or warnings
 */
export function validateBatchLimits(
  files: FileInfo[],
  maxFiles: number = env.SMART_UPLOAD_MAX_FILES || DEFAULT_MAX_FILES,
  maxTotalBytes: number = env.SMART_UPLOAD_MAX_TOTAL_BYTES || DEFAULT_MAX_TOTAL_BYTES
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const fileCount = files.length;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  logger.debug('Validating batch limits', {
    fileCount,
    maxFiles,
    totalBytes,
    maxTotalBytes,
  });

  // Check file count
  if (fileCount > maxFiles) {
    errors.push(
      `Too many files: ${fileCount}. Maximum: ${maxFiles}`
    );
  }

  // Check total size
  if (totalBytes > maxTotalBytes) {
    errors.push(
      `Total size too large: ${formatFileSize(totalBytes)}. Maximum: ${formatFileSize(maxTotalBytes)}`
    );
  }

  // Warning for empty batch
  if (fileCount === 0) {
    warnings.push('No files selected for upload');
  }

  // Warning for single large file in batch
  const largestFile = files.reduce(
    (largest, file) => (file.size > largest.size ? file : largest),
    { size: 0, name: '', type: '' } as FileInfo
  );

  if (largestFile.size > MAX_FILE_SIZE * 0.8) {
    warnings.push(
      `Largest file (${largestFile.name}) is close to size limit`
    );
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('Batch validation failed', {
      fileCount,
      totalBytes,
      errors,
    });
  }

  return {
    valid,
    errors,
    warnings,
  };
}

/**
 * Validate multiple files (individual + batch validation).
 *
 * @param files - Array of files to validate
 * @returns Combined validation result
 */
export function validateFiles(
  files: FileInfo[]
): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate each file individually
  for (const file of files) {
    const result = validateSmartUploadFile(file);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  // Validate batch limits
  const batchResult = validateBatchLimits(files);
  allErrors.push(...batchResult.errors);
  allWarnings.push(...batchResult.warnings);

  // Deduplicate errors and warnings
  const uniqueErrors = [...new Set(allErrors)];
  const uniqueWarnings = [...new Set(allWarnings)];

  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a MIME type is allowed.
 */
function isAllowedMimeType(mimeType: string): boolean {
  // Normalize MIME type
  const normalized = mimeType.toLowerCase().trim();

  // Check exact match
  if (ALLOWED_MIME_TYPES.includes(normalized as AllowedMimeType)) {
    return true;
  }

  // Check wildcard patterns
  const allowedPatterns = [
    'audio/',
    'image/',
  ];

  for (const pattern of allowedPatterns) {
    if (normalized.startsWith(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate filename for suspicious patterns.
 */
function validateFilename(filename: string): string | null {
  if (!filename || filename.trim() === '') {
    return 'Filename is empty';
  }

  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return 'Filename contains path separators';
  }

  // Check for null bytes
  if (filename.includes('\0')) {
    return 'Filename contains null bytes';
  }

  // Check for very long filenames
  if (filename.length > 255) {
    return 'Filename is too long (max 255 characters)';
  }

  // Check for hidden files (starting with dot)
  if (filename.startsWith('.') && filename.length > 1) {
    return 'Warning: file may be hidden';
  }

  return null;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Get file extension from filename.
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * Check if file is likely a PDF based on magic bytes.
 */
export function isPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }

  // PDF files start with %PDF
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46    // F
  );
}
