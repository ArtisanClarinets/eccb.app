/**
 * Validators Tests
 *
 * Tests for file validation, MIME type validation,
 * size limits, and batch limits.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateSmartUploadFile,
  validateBatchLimits,
  validateFiles,
  formatFileSize,
  getFileExtension,
  isPdfMagicBytes,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_TOTAL_BYTES,
} from '@/lib/services/smart-upload/validators';

// Mock the env module
vi.mock('@/lib/env', () => ({
  env: {
    SMART_UPLOAD_MAX_FILES: undefined,
    SMART_UPLOAD_MAX_TOTAL_BYTES: undefined,
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('validators', () => {
  describe('validateSmartUploadFile', () => {
    describe('MIME type validation', () => {
      it('should accept valid PDF MIME type', () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });

      it('should accept valid audio MIME types', () => {
        const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'];
        
        for (const type of audioTypes) {
          const file = { name: 'test.mp3', type, size: 1024 };
          const result = validateSmartUploadFile(file);
          expect(result.valid).toBe(true);
        }
      });

      it('should accept valid image MIME types', () => {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/bmp'];
        
        for (const type of imageTypes) {
          const file = { name: 'test.jpg', type, size: 1024 };
          const result = validateSmartUploadFile(file);
          expect(result.valid).toBe(true);
        }
      });

      it('should accept musicxml MIME type', () => {
        const file = { name: 'test.musicxml', type: 'application/vnd.recordare.musicxml', size: 1024 };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });

      it('should reject invalid MIME type', () => {
        const file = {
          name: 'test.exe',
          type: 'application/executable',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid file type'))).toBe(true);
      });

      it('should reject text file', () => {
        const file = {
          name: 'test.txt',
          type: 'text/plain',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(false);
      });

      it('should reject HTML file', () => {
        const file = {
          name: 'test.html',
          type: 'text/html',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(false);
      });
    });

    describe('file size validation', () => {
      it('should accept file within size limit', () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 50 * 1024 * 1024, // 50MB - under 100MB limit
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });

      it('should reject file exceeding size limit', () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 150 * 1024 * 1024, // 150MB - over 100MB limit
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('File too large'))).toBe(true);
      });

      it('should reject empty file', () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 0,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('File is empty');
      });

      it('should warn for very small files', () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 500, // Less than 1KB
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('very small'))).toBe(true);
      });
    });

    describe('filename validation', () => {
      it('should warn for suspicious filename with path separators', () => {
        const file = {
          name: '../test.pdf',
          type: 'application/pdf',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.warnings.length).toBeGreaterThan(0);
      });

      it('should accept normal filenames', () => {
        const file = {
          name: 'test-file.pdf',
          type: 'application/pdf',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });

      it('should warn for hidden files', () => {
        const file = {
          name: '.hidden.pdf',
          type: 'application/pdf',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('wildcard MIME type matching', () => {
      it('should accept audio/* wildcard types', () => {
        const file = {
          name: 'test.audio',
          type: 'audio/aac',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });

      it('should accept image/* wildcard types', () => {
        const file = {
          name: 'test.bmp',
          type: 'image/bmp',
          size: 1024,
        };
        const result = validateSmartUploadFile(file);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateBatchLimits', () => {
    it('should accept batch within file count limit', () => {
      const files = Array.from({ length: 10 }, (_, i) => ({
        name: `test${i}.pdf`,
        type: 'application/pdf',
        size: 1024,
      }));
      const result = validateBatchLimits(files);
      expect(result.valid).toBe(true);
    });

    it('should reject batch exceeding file count limit', () => {
      const files = Array.from({ length: 25 }, (_, i) => ({
        name: `test${i}.pdf`,
        type: 'application/pdf',
        size: 1024,
      }));
      const result = validateBatchLimits(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Too many files'))).toBe(true);
    });

    it('should accept batch within total size limit', () => {
      const files = [
        { name: 'test1.pdf', type: 'application/pdf', size: 200 * 1024 * 1024 },
        { name: 'test2.pdf', type: 'application/pdf', size: 200 * 1024 * 1024 },
      ]; // 400MB total - under 500MB limit
      const result = validateBatchLimits(files);
      expect(result.valid).toBe(true);
    });

    it('should reject batch exceeding total size limit', () => {
      const files = [
        { name: 'test1.pdf', type: 'application/pdf', size: 300 * 1024 * 1024 },
        { name: 'test2.pdf', type: 'application/pdf', size: 300 * 1024 * 1024 },
      ]; // 600MB total - over 500MB limit
      const result = validateBatchLimits(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Total size too large'))).toBe(true);
    });

    it('should warn for empty batch', () => {
      const result = validateBatchLimits([]);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('No files selected'))).toBe(true);
    });

    it('should warn for large files close to limit', () => {
      const files = [
        { name: 'test.pdf', type: 'application/pdf', size: 90 * 1024 * 1024 }, // 90MB - 80% of 100MB
      ];
      const result = validateBatchLimits(files);
      expect(result.warnings.some(w => w.includes('close to size limit'))).toBe(true);
    });

    it('should use custom limits when provided', () => {
      const files = Array.from({ length: 15 }, (_, i) => ({
        name: `test${i}.pdf`,
        type: 'application/pdf',
        size: 1024,
      }));
      // Using custom maxFiles of 10
      const result = validateBatchLimits(files, 10, DEFAULT_MAX_TOTAL_BYTES);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateFiles', () => {
    it('should validate individual files and batch limits', () => {
      const files = [
        { name: 'test1.pdf', type: 'application/pdf', size: 1024 },
        { name: 'test2.pdf', type: 'text/plain', size: 1024 }, // Invalid type
      ];
      const result = validateFiles(files);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should deduplicate errors', () => {
      const files = [
        { name: 'test1.pdf', type: 'text/plain', size: 1024 },
        { name: 'test2.pdf', type: 'text/plain', size: 1024 },
      ];
      const result = validateFiles(files);
      // Both have same error - should be deduplicated
      const typeErrors = result.errors.filter(e => e.includes('Invalid file type'));
      expect(typeErrors.length).toBe(1);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(10485760)).toBe('10 MB');
      expect(formatFileSize(104857600)).toBe('100 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
      expect(formatFileSize(2147483648)).toBe('2 GB');
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('test.pdf')).toBe('pdf');
      expect(getFileExtension('test.mp3')).toBe('mp3');
      expect(getFileExtension('test.image.PNG')).toBe('png');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('test')).toBe('');
    });

    it('should handle multiple dots', () => {
      expect(getFileExtension('test.file.pdf')).toBe('pdf');
      expect(getFileExtension('my.document.docx')).toBe('docx');
    });
  });

  describe('isPdfMagicBytes', () => {
    it('should return true for PDF magic bytes', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      expect(isPdfMagicBytes(buffer)).toBe(true);
    });

    it('should return false for non-PDF magic bytes', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG
      expect(isPdfMagicBytes(buffer)).toBe(false);
    });

    it('should return false for buffer too small', () => {
      const buffer = Buffer.from([0x25, 0x50]);
      expect(isPdfMagicBytes(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const buffer = Buffer.from([]);
      expect(isPdfMagicBytes(buffer)).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have correct MAX_FILE_SIZE', () => {
      expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024); // 100MB
    });

    it('should have correct DEFAULT_MAX_FILES', () => {
      expect(DEFAULT_MAX_FILES).toBe(20);
    });

    it('should have correct DEFAULT_MAX_TOTAL_BYTES', () => {
      expect(DEFAULT_MAX_TOTAL_BYTES).toBe(500 * 1024 * 1024); // 500MB
    });

    it('should have allowed MIME types defined', () => {
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(ALLOWED_MIME_TYPES).toContain('audio/mpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    });
  });
});
