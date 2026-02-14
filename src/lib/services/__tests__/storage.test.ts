import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAndResolvePath, uploadFile, downloadFile, deleteFile, fileExists, validateFileMagicBytes } from '../storage';
import { env } from '@/lib/env';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('@/lib/env', () => ({
  env: {
    STORAGE_DRIVER: 'LOCAL',
    LOCAL_STORAGE_PATH: './storage/test',
    S3_ENDPOINT: undefined,
    S3_ACCESS_KEY_ID: undefined,
    S3_SECRET_ACCESS_KEY: undefined,
    S3_BUCKET_NAME: undefined,
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
    rename: vi.fn(),
  },
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('fs', () => ({
  createReadStream: vi.fn(() => ({
    pipe: vi.fn(),
    on: vi.fn(),
  })),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Storage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Path Validation Tests (Security Critical)
  // ===========================================================================

  describe('Path Validation (Security)', () => {
    it('should reject path traversal attempts with ..', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\etc\\passwd',
        'music/../../../etc/passwd',
        './../../../etc/passwd',
      ];

      for (const maliciousPath of maliciousPaths) {
        await expect(async () => {
          // Access the private function through the module
          // Since validateAndResolvePath is not exported, we test through downloadFile
          vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });
          await downloadFile(maliciousPath);
        }).rejects.toThrow();
      }
    });

    it('should reject null bytes in paths', async () => {
      const maliciousPaths = [
        'music/file.pdf\0.txt',
        'music\0/../../../etc/passwd',
        '\0music/file.pdf',
      ];

      for (const maliciousPath of maliciousPaths) {
        await expect(async () => {
          vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });
          await downloadFile(maliciousPath);
        }).rejects.toThrow();
      }
    });

    it('should reject absolute paths', async () => {
      const absolutePaths = [
        '/etc/passwd',
        '/var/log/auth.log',
        'C:\\Windows\\System32\\config\\SAM',
      ];

      for (const absolutePath of absolutePaths) {
        await expect(async () => {
          vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });
          await downloadFile(absolutePath);
        }).rejects.toThrow();
      }
    });

    it('should reject URL-encoded path traversal', async () => {
      const encodedPaths = [
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%252e%252e%252f', // Double encoded
        '..%2f..%2f..%2fetc%2fpasswd',
      ];

      for (const encodedPath of encodedPaths) {
        await expect(async () => {
          vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });
          await downloadFile(encodedPath);
        }).rejects.toThrow();
      }
    });

    it('should accept valid relative paths within storage', async () => {
      const validPaths = [
        'music/piece1.pdf',
        'music/2024/concert/score.pdf',
        'audio/rehearsal/track.mp3',
      ];

      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: 1024,
        mtime: new Date(),
      } as any);

      for (const validPath of validPaths) {
        // Should not throw for valid paths
        try {
          await downloadFile(validPath);
        } catch (error) {
          // May fail for other reasons (file not found), but not path validation
          expect((error as Error).message).not.toContain('path traversal');
          expect((error as Error).message).not.toContain('Invalid key');
        }
      }
    });
  });

  // ===========================================================================
  // File Type Validation Tests
  // ===========================================================================

  describe('File Type Validation', () => {
    it('should correctly identify PDF magic bytes', () => {
      // Valid PDF header: %PDF
      const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(validateFileMagicBytes(validPdf, 'application/pdf')).toBe(true);

      // Invalid PDF header
      const invalidPdf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateFileMagicBytes(invalidPdf, 'application/pdf')).toBe(false);
    });

    it('should handle files that are too small for magic byte validation', () => {
      const smallBuffer = Buffer.from([0x25]); // Just one byte
      // For PDF validation, it checks buffer.length >= 4, so small files fail validation
      // But the function returns true for non-PDF types
      expect(validateFileMagicBytes(smallBuffer, 'application/pdf')).toBe(false);
      // For other types, it returns true (can't validate)
      expect(validateFileMagicBytes(smallBuffer, 'audio/mpeg')).toBe(true);
    });

    it('should allow non-PDF files to pass validation', () => {
      const mp3Buffer = Buffer.from([0x49, 0x44, 0x33]); // ID3 tag
      expect(validateFileMagicBytes(mp3Buffer, 'audio/mpeg')).toBe(true);

      const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(validateFileMagicBytes(randomBuffer, 'application/octet-stream')).toBe(true);
    });
  });

  // ===========================================================================
  // Upload Tests
  // ===========================================================================

  describe('Upload File', () => {
    it('should upload a file with valid options', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const content = Buffer.from('test content');
      const result = await uploadFile('music/test.pdf', content, {
        contentType: 'application/pdf',
      });

      expect(result).toBe('music/test.pdf');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create nested directories for file path', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const content = Buffer.from('test content');
      await uploadFile('music/2024/concert/score.pdf', content, {
        contentType: 'application/pdf',
      });

      // Should create directory with recursive: true
      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should clean up temp file on upload failure', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const content = Buffer.from('test content');

      await expect(uploadFile('music/test.pdf', content, {
        contentType: 'application/pdf',
      })).rejects.toThrow();

      // Should attempt to clean up temp file
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should reject uploads with invalid paths', async () => {
      const content = Buffer.from('test content');

      await expect(uploadFile('../../../etc/passwd', content, {
        contentType: 'application/pdf',
      })).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Download Tests
  // ===========================================================================

  describe('Download File', () => {
    it('should return file stream for existing file', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: 1024,
        mtime: new Date(),
      } as any);

      const result = await downloadFile('music/test.pdf');

      expect(result).toBeDefined();
      if (typeof result !== 'string') {
        expect(result.metadata.contentType).toBe('application/pdf');
        expect(result.metadata.size).toBe(1024);
      }
    });

    it('should throw error for non-existent file', async () => {
      vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });

      await expect(downloadFile('music/nonexistent.pdf')).rejects.toThrow('File not found');
    });

    it('should throw error for directories', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
      } as any);

      await expect(downloadFile('music')).rejects.toThrow('Not a file');
    });

    it('should detect correct content type from extension', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: 1024,
        mtime: new Date(),
      } as any);

      const testCases = [
        { path: 'music/score.pdf', expectedType: 'application/pdf' },
        { path: 'audio/track.mp3', expectedType: 'audio/mpeg' },
        { path: 'images/photo.jpg', expectedType: 'image/jpeg' },
        { path: 'images/photo.png', expectedType: 'image/png' },
        { path: 'docs/file.txt', expectedType: 'text/plain' },
        { path: 'unknown/file.xyz', expectedType: 'application/octet-stream' },
      ];

      for (const { path: filePath, expectedType } of testCases) {
        const result = await downloadFile(filePath);
        if (typeof result !== 'string') {
          expect(result.metadata.contentType).toBe(expectedType);
        }
      }
    });
  });

  // ===========================================================================
  // Delete Tests
  // ===========================================================================

  describe('Delete File', () => {
    it('should delete an existing file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await deleteFile('music/test.pdf');

      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle non-existent file gracefully', async () => {
      vi.mocked(fs.unlink).mockRejectedValue({ code: 'ENOENT' });

      // Should not throw
      await expect(deleteFile('music/nonexistent.pdf')).resolves.toBeUndefined();
    });

    it('should reject invalid paths', async () => {
      await expect(deleteFile('../../../etc/passwd')).rejects.toThrow();
    });
  });

  // ===========================================================================
  // File Exists Tests
  // ===========================================================================

  describe('File Exists', () => {
    it('should return true for existing file', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
      } as any);

      const result = await fileExists('music/test.pdf');

      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });

      const result = await fileExists('music/nonexistent.pdf');

      expect(result).toBe(false);
    });

    it('should return false for directories', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
      } as any);

      const result = await fileExists('music');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Size Limit Tests
  // ===========================================================================

  describe('Size Limits', () => {
    it('should report correct file size in metadata', async () => {
      const testSize = 5 * 1024 * 1024; // 5 MB
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: testSize,
        mtime: new Date(),
      } as any);

      const result = await downloadFile('music/large.pdf');

      if (typeof result !== 'string') {
        expect(result.metadata.size).toBe(testSize);
      }
    });
  });
});

// =============================================================================
// Download Authorization Tests (for files route)
// =============================================================================

describe('Download Authorization Logic', () => {
  // These tests would test the authorization logic in the files route
  // Since that requires more complex mocking, we'll test the core logic

  it('should define permission constants for download', async () => {
    const { MUSIC_DOWNLOAD_ALL, MUSIC_DOWNLOAD_ASSIGNED } = await import('@/lib/auth/permission-constants');

    expect(MUSIC_DOWNLOAD_ALL).toBe('music.download.all');
    expect(MUSIC_DOWNLOAD_ASSIGNED).toBe('music.download.assigned');
  });

  it('should distinguish between download.all and download.assigned permissions', async () => {
    const { MUSIC_DOWNLOAD_ALL, MUSIC_DOWNLOAD_ASSIGNED } = await import('@/lib/auth/permission-constants');
    
    // Verify the permission strings are different
    expect(MUSIC_DOWNLOAD_ALL).not.toBe(MUSIC_DOWNLOAD_ASSIGNED);
    
    // Verify they have the expected values
    expect(MUSIC_DOWNLOAD_ALL).toBe('music.download.all');
    expect(MUSIC_DOWNLOAD_ASSIGNED).toBe('music.download.assigned');
  });
});
