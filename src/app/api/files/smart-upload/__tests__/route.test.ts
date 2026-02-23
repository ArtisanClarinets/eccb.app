import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../route';

// Mock dependencies
vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSession: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/storage', () => ({
  uploadFile: vi.fn(),
  validateFileMagicBytes: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock global fetch
global.fetch = vi.fn();

// Import after mocks
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { applyRateLimit } from '@/lib/rate-limit';
import { validateCSRF } from '@/lib/csrf';
import { prisma } from '@/lib/db';
import { uploadFile, validateFileMagicBytes } from '@/lib/services/storage';
import {
  VALID_METADATA_HIGH_CONFIDENCE,
  VALID_METADATA_MULTI_PART,
  VALID_METADATA_CONDENSED_SCORE,
  AMBIGUOUS_COMPOSER_METADATA,
  AMBIGUOUS_INSTRUMENT_METADATA,
  createMockSession,
  createOllamaResponse,
} from './mocks';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_USER_ID = 'test-user-1';

// =============================================================================
// Helper Functions
// =============================================================================

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

function createFormDataWithFile(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Smart Upload API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations
    vi.mocked(validateCSRF).mockReturnValue({ valid: true });
    vi.mocked(validateFileMagicBytes).mockReturnValue(true);
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(checkUserPermission).mockResolvedValue(true);
    vi.mocked(uploadFile).mockResolvedValue('smart-upload/test-uuid/original.pdf');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('Authentication', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when session has no user id', async () => {
      vi.mocked(getSession).mockResolvedValue({ user: null } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when user lacks MUSIC_UPLOAD permission', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: Music upload permission required');
    });
  });

  // ===========================================================================
  // File Validation Tests
  // ===========================================================================

  describe('File Validation', () => {
    it('should return 400 when no file is provided', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));

      const formData = new FormData();

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should return 400 when file is too large', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));

      const largeFile = createMockFile('test.pdf', 60 * 1024 * 1024, 'application/pdf');
      const formData = createFormDataWithFile(largeFile);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('File too large');
    });

    it('should return 400 for invalid MIME type (not PDF)', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));

      const imageFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const formData = createFormDataWithFile(imageFile);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid file type. Only PDF files are allowed');
    });
  });

  // ===========================================================================
  // CSRF Validation Tests
  // ===========================================================================

  describe('CSRF Validation', () => {
    it('should return 403 when CSRF validation fails', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));
      vi.mocked(validateCSRF).mockReturnValue({
        valid: false,
        reason: 'Invalid CSRF token',
      });

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('CSRF validation failed');
    });
  });

  // ===========================================================================
  // Successful Upload Tests
  // ===========================================================================

  describe('Successful Upload Flow', () => {
    it('should successfully upload and process a valid PDF', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(VALID_METADATA_HIGH_CONFIDENCE),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: VALID_METADATA_HIGH_CONFIDENCE as any,
        confidenceScore: 95,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.session).toBeDefined();
      expect(data.session.status).toBe('PENDING_REVIEW');
      expect(data.session.confidenceScore).toBe(95);
    });

    it('should handle multi-part score with multiple parts', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(VALID_METADATA_MULTI_PART),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: VALID_METADATA_MULTI_PART as any,
        confidenceScore: 88,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extractedMetadata.isMultiPart).toBe(true);
      expect(data.extractedMetadata.parts).toHaveLength(6);
    });

    it('should handle condensed score file type', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(VALID_METADATA_CONDENSED_SCORE),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: VALID_METADATA_CONDENSED_SCORE as any,
        confidenceScore: 92,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extractedMetadata.fileType).toBe('CONDENSED_SCORE');
    });
  });

  // ===========================================================================
  // Confidence Score Handling Tests
  // ===========================================================================

  describe('Confidence Score Handling', () => {
    it('should trigger verification when confidence is below 90', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      // Return metadata with confidence < 90 so verification is triggered
      const lowConfidenceMetadata = { ...VALID_METADATA_HIGH_CONFIDENCE, confidenceScore: 85 };
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(lowConfidenceMetadata),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: { ...VALID_METADATA_HIGH_CONFIDENCE, confidenceScore: 85 } as any,
        confidenceScore: 85,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // With confidence < 90, verification should be called
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should skip verification when confidence is >= 90', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const highConfidence = { ...VALID_METADATA_HIGH_CONFIDENCE, confidenceScore: 95 };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(highConfidence),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: highConfidence as any,
        confidenceScore: 95,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // With confidence >= 90, verification should be skipped
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle ambiguous composer (confidence < 80)', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(AMBIGUOUS_COMPOSER_METADATA),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: AMBIGUOUS_COMPOSER_METADATA as any,
        confidenceScore: 65,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extractedMetadata.confidenceScore).toBeLessThan(80);
    });

    it('should handle ambiguous instrument (confidence < 80)', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(AMBIGUOUS_INSTRUMENT_METADATA),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: AMBIGUOUS_INSTRUMENT_METADATA as any,
        confidenceScore: 72,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extractedMetadata.confidenceScore).toBeLessThan(80);
    });

    it('should use fallback metadata when LLM fails', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID) as any);

      const mockFetch = vi.fn().mockRejectedValue(new Error('LLM API error'));
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue({
        id: 'session-id-1',
        uploadSessionId: 'upload-session-uuid',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'smart-upload/upload-session-uuid/original.pdf',
        extractedMetadata: {
          title: 'test',
          confidenceScore: 10,
        } as any,
        confidenceScore: 10,
        status: 'PENDING_REVIEW',
        uploadedBy: TEST_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extractedMetadata.confidenceScore).toBe(10);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should return 500 when database creation fails', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(VALID_METADATA_HIGH_CONFIDENCE),
      });
      global.fetch = mockFetch;

      vi.mocked(prisma.smartUploadSession.create).mockRejectedValue(
        new Error('Database error')
      );

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Smart upload failed');
    });

    it('should return 500 when file upload fails', async () => {
      vi.mocked(getSession).mockResolvedValue(createMockSession(TEST_USER_ID));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createOllamaResponse(VALID_METADATA_HIGH_CONFIDENCE),
      });
      global.fetch = mockFetch;

      vi.mocked(uploadFile).mockRejectedValue(new Error('Storage error'));

      const file = createMockFile('test.pdf', 1024, 'application/pdf');
      const formData = createFormDataWithFile(file);

      const request = new NextRequest('http://localhost/api/files/smart-upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  // ===========================================================================
  // OPTIONS Handler Tests
  // ===========================================================================

  describe('OPTIONS Handler', () => {
    it('should return 204 with correct CORS headers', async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        'POST, OPTIONS'
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        'Content-Type, Authorization'
      );
    });
  });
});
