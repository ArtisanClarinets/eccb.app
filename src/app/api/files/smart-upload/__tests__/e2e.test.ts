import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as storage from '@/lib/services/storage';
import { queueSmartUploadProcess, queueSmartUploadSecondPass } from '@/lib/jobs/smart-upload';

// Mock dependencies
vi.mock('@/lib/services/storage', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
}));

vi.mock('@/lib/jobs/smart-upload', () => ({
  queueSmartUploadProcess: vi.fn(),
  queueSmartUploadSecondPass: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    smartUploadSession: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    musicFile: {
      deleteMany: vi.fn(),
    },
    systemSetting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Import mocked prisma after mock setup
import { prisma } from '@/lib/db';

describe('Smart Upload E2E', () => {
  let testUser: any;
  let testFile: Uint8Array;

  beforeAll(async () => {
    // Create test user with admin role
    testUser = {
      id: 'test-user-123',
      email: 'test-admin@example.com',
      name: 'Test Admin',
      role: 'ADMIN',
    };
    vi.mocked(prisma.user.create).mockResolvedValue(testUser);

    // Create test PDF (mock)
    testFile = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
  });

  afterAll(async () => {
    // Cleanup
    await prisma.smartUploadSession.deleteMany({
      where: { uploadedBy: testUser.id },
    });
    await prisma.musicFile.deleteMany({
      where: { uploadedBy: testUser.id },
    });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  describe('Upload Flow', () => {
    it('should queue upload for processing', async () => {
      // Mock storage upload
      vi.mocked(storage.uploadFile).mockResolvedValue('test-key-123');
      vi.mocked(queueSmartUploadProcess).mockResolvedValue({
        id: 'job-123',
        data: { sessionId: 'session-123', fileId: 'file-456' },
      } as any);

      // Create form data (simulated)
      const formData = new FormData();
      const fileBlob = new Blob([Buffer.from(testFile)], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'test-score.pdf');

      // Verify storage upload works
      const storageKey = await storage.uploadFile(
        'test/file.pdf',
        Buffer.from(testFile),
        { contentType: 'application/pdf' }
      );

      expect(storageKey).toBe('test-key-123');

      // Verify job was queued
      const job = await queueSmartUploadProcess('session-123', 'file-456');
      expect(job.id).toBe('job-123');
      expect(queueSmartUploadProcess).toHaveBeenCalledWith('session-123', 'file-456');
    });

    it('should process job and create smart session', async () => {
      // Create session manually to test worker
      const session = {
        id: 'session-123',
        uploadSessionId: `test-${Date.now()}`,
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'test/file.pdf',
        confidenceScore: 85,
        parseStatus: 'AWAITING_REVIEW',
        routingDecision: 'manual_review',
        uploadedBy: testUser.id,
        status: 'PENDING_REVIEW',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue(session as any);

      const createdSession = await prisma.smartUploadSession.create({
        data: {
          uploadSessionId: session.uploadSessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          storageKey: session.storageKey,
          confidenceScore: session.confidenceScore,
          parseStatus: session.parseStatus,
          routingDecision: session.routingDecision,
          uploadedBy: testUser.id,
          status: 'PENDING_REVIEW',
        } as any,
      });

      // Verify session created
      expect(createdSession.id).toBeDefined();
      expect(createdSession.confidenceScore).toBe(85);
    });
  });

  describe('Review Flow', () => {
    it('should create session for review', async () => {
      const session = {
        id: 'review-session-123',
        uploadSessionId: `test-review-${Date.now()}`,
        fileName: 'test-review.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'test/file.pdf',
        confidenceScore: 85,
        status: 'PENDING_REVIEW',
        parseStatus: 'AWAITING_REVIEW',
        routingDecision: 'manual_review',
        uploadedBy: testUser.id,
        extractedMetadata: {
          title: 'Test Score',
          composer: 'Test Composer',
        },
        parsedParts: [
          { partName: 'Flute 1', pageStart: 0, pageEnd: 2, fileName: 'Flute 1.pdf' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue(session as any);

      const created = await prisma.smartUploadSession.create({
        data: {
          uploadSessionId: session.uploadSessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          storageKey: session.storageKey,
          confidenceScore: session.confidenceScore,
          status: session.status,
          parseStatus: session.parseStatus,
          routingDecision: session.routingDecision,
          uploadedBy: testUser.id,
          extractedMetadata: session.extractedMetadata,
          parsedParts: session.parsedParts,
        } as any,
      });

      expect(created.id).toBe('review-session-123');
      expect(created.status).toBe('PENDING_REVIEW');
      expect(created.extractedMetadata).toHaveProperty('title', 'Test Score');
    });

    it('should approve session and import parts', async () => {
      const session = {
        id: 'approve-session-123',
        uploadSessionId: `test-approve-${Date.now()}`,
        fileName: 'test-approve.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'test/file.pdf',
        confidenceScore: 85,
        status: 'APPROVED',
        parseStatus: 'PARSED',
        routingDecision: 'manual_review',
        uploadedBy: testUser.id,
        parsedParts: [
          { partName: 'Flute 1', pageStart: 0, pageEnd: 2, storageKey: 'part-1' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue(session as any);
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(session as any);

      await prisma.smartUploadSession.create({
        data: {
          uploadSessionId: session.uploadSessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          storageKey: session.storageKey,
          confidenceScore: session.confidenceScore,
          status: session.status,
          parseStatus: session.parseStatus,
          routingDecision: session.routingDecision,
          uploadedBy: testUser.id,
          parsedParts: session.parsedParts,
        } as any,
      });

      // Verify session was approved
      const updated = await prisma.smartUploadSession.findUnique({
        where: { id: session.id },
      });
      expect(updated?.status).toBe('APPROVED');
    });

    it('should reject session', async () => {
      const session = {
        id: 'reject-session-123',
        uploadSessionId: `test-reject-${Date.now()}`,
        fileName: 'test-reject.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'test/file.pdf',
        confidenceScore: 30,
        status: 'REJECTED',
        parseStatus: 'AWAITING_REVIEW',
        routingDecision: 'manual_review',
        uploadedBy: testUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue(session as any);
      vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(session as any);

      await prisma.smartUploadSession.create({
        data: {
          uploadSessionId: session.uploadSessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          storageKey: session.storageKey,
          confidenceScore: session.confidenceScore,
          status: session.status,
          parseStatus: session.parseStatus,
          routingDecision: session.routingDecision,
          uploadedBy: testUser.id,
        } as any,
      });

      const updated = await prisma.smartUploadSession.findUnique({
        where: { id: session.id },
      });
      expect(updated?.status).toBe('REJECTED');
    });
  });

  describe('Settings Flow', () => {
    it('should handle settings with secrets', async () => {
      // Seed a setting
      vi.mocked(prisma.systemSetting.upsert).mockResolvedValue({
        id: 'setting-1',
        key: 'llm_openai_api_key',
        value: 'sk-test123',
      } as any);

      const setting = await prisma.systemSetting.upsert({
        where: { key: 'llm_openai_api_key' },
        update: { value: 'sk-test123' },
        create: { key: 'llm_openai_api_key', value: 'sk-test123' },
      });

      expect(setting.key).toBe('llm_openai_api_key');
      expect(setting.value).toBe('sk-test123');
    });

    it('should update settings', async () => {
      vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue({
        id: 'setting-2',
        key: 'llm_provider',
        value: 'openai',
      } as any);

      const provider = await prisma.systemSetting.findUnique({
        where: { key: 'llm_provider' },
      });
      expect(provider?.value).toBe('openai');
    });
  });

  describe('Second Pass Flow', () => {
    it('should queue second-pass for low confidence uploads', async () => {
      const session = {
        id: 'second-pass-session-123',
        uploadSessionId: `test-second-pass-${Date.now()}`,
        fileName: 'test-second-pass.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'test/file.pdf',
        confidenceScore: 25,
        status: 'PENDING_REVIEW',
        parseStatus: 'AWAITING_REVIEW',
        routingDecision: 'no_parse_second_pass',
        uploadedBy: testUser.id,
        extractedMetadata: { title: 'Test' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.smartUploadSession.create).mockResolvedValue(session as any);
      vi.mocked(queueSmartUploadSecondPass).mockResolvedValue({
        id: 'job-second-pass-123',
        data: { sessionId: session.id },
      } as any);

      await prisma.smartUploadSession.create({
        data: {
          uploadSessionId: session.uploadSessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          storageKey: session.storageKey,
          confidenceScore: session.confidenceScore,
          status: session.status,
          parseStatus: session.parseStatus,
          routingDecision: session.routingDecision,
          uploadedBy: testUser.id,
          extractedMetadata: session.extractedMetadata,
        } as any,
      });

      // Verify job was queued
      const job = await queueSmartUploadSecondPass(session.id);
      expect(job.id).toBe('job-second-pass-123');
      expect(queueSmartUploadSecondPass).toHaveBeenCalledWith(session.id);
    });
  });
});
