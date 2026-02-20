/**
 * Smart Upload Service Tests
 *
 * Tests for batch lifecycle, item management, proposal management,
 * and ingestion functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatch,
  getBatch,
  getBatchWithItems,
  listUserBatches,
  updateBatchStatus,
  cancelBatch,
  addItemToBatch,
  updateItemStatus,
  updateItemStep,
  updateItemMetadata,
  getItem,
  getBatchItems,
  createProposal,
  updateProposal,
  approveProposal,
  getProposal,
  getBatchProposals,
  ingestBatch,
  BatchNotFoundError,
  InvalidBatchStateError,
} from '@/lib/services/smart-upload/smart-upload.service';
import { SmartUploadStatus, SmartUploadStep } from '@prisma/client';

// Mock the Prisma client
vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadBatch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    smartUploadItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    smartUploadProposal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    musicPiece: {
      create: vi.fn(),
    },
    musicFile: {
      create: vi.fn(),
    },
    musicPart: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(vi.mocked(prisma, true))),
  },
}));

// Mock the audit log
vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock the cache
vi.mock('@/lib/cache', () => ({
  invalidateMusicCache: vi.fn().mockResolvedValue(undefined),
}));

// Import mocked modules
import { prisma } from '@/lib/db';

// Helper function to create mock batch
const createMockBatch = (overrides = {}) => ({
  id: 'batch-123',
  userId: 'user-123',
  status: SmartUploadStatus.CREATED,
  totalFiles: 0,
  processedFiles: 0,
  successFiles: 0,
  failedFiles: 0,
  errorSummary: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper function to create mock item
const createMockItem = (overrides = {}) => ({
  id: 'item-123',
  batchId: 'batch-123',
  fileName: 'test.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  storageKey: 'uploads/test.pdf',
  status: SmartUploadStatus.CREATED,
  currentStep: null,
  ocrText: null,
  extractedMeta: null,
  isPacket: false,
  splitPages: null,
  splitFiles: null,
  errorMessage: null,
  errorDetails: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper function to create mock proposal
const createMockProposal = (overrides = {}) => ({
  id: 'proposal-123',
  itemId: 'item-123',
  batchId: 'batch-123',
  title: 'Test Piece',
  composer: 'Test Composer',
  arranger: null,
  publisher: null,
  difficulty: null,
  genre: null,
  style: null,
  instrumentation: 'Flute, Clarinet',
  duration: null,
  notes: null,
  titleConfidence: 0.9,
  composerConfidence: 0.85,
  difficultyConfidence: null,
  corrections: null,
  matchedPieceId: null,
  isApproved: false,
  approvedAt: null,
  approvedBy: null,
  isNewPiece: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Smart Upload Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // Batch Lifecycle Tests
  // =============================================================================

  describe('createBatch', () => {
    it('should create a new batch', async () => {
      const mockBatch = createMockBatch();
      vi.mocked(prisma.smartUploadBatch.create).mockResolvedValue(mockBatch);

      const result = await createBatch('user-123');

      expect(result).toEqual(mockBatch);
      expect(vi.mocked(prisma.smartUploadBatch.create)).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          status: SmartUploadStatus.CREATED,
          totalFiles: 0,
          processedFiles: 0,
          successFiles: 0,
          failedFiles: 0,
        },
      });
    });
  });

  describe('getBatch', () => {
    it('should return batch when found', async () => {
      const mockBatch = createMockBatch();
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);

      const result = await getBatch('batch-123');

      expect(result).toEqual(mockBatch);
    });

    it('should return null when batch not found', async () => {
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(null);

      const result = await getBatch('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBatchWithItems', () => {
    it('should return batch with items and proposals', async () => {
      const mockBatch = createMockBatch();
      const mockItems = [createMockItem()];
      const mockProposals = [createMockProposal()];

      // The service uses findUnique with include, returning batch with items/proposals
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue({
        ...mockBatch,
        items: mockItems,
        proposals: mockProposals,
      } as never);

      const result = await getBatchWithItems('batch-123');

      expect(result).toBeDefined();
      expect(result?.batch).toBeDefined();
      expect(result?.items).toEqual(mockItems);
      expect(result?.proposals).toEqual(mockProposals);
    });

    it('should return null when batch not found', async () => {
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(null);

      const result = await getBatchWithItems('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listUserBatches', () => {
    it('should return all batches for a user', async () => {
      const mockBatches = [createMockBatch(), createMockBatch({ id: 'batch-456' })];
      vi.mocked(prisma.smartUploadBatch.findMany).mockResolvedValue(mockBatches);

      const result = await listUserBatches('user-123');

      expect(result).toEqual(mockBatches);
      expect(vi.mocked(prisma.smartUploadBatch.findMany)).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateBatchStatus', () => {
    it('should update batch status', async () => {
      const mockBatch = createMockBatch();
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);
      vi.mocked(prisma.smartUploadBatch.update).mockResolvedValue({
        ...mockBatch,
        status: SmartUploadStatus.PROCESSING,
      });

      await updateBatchStatus('batch-123', SmartUploadStatus.PROCESSING);

      expect(vi.mocked(prisma.smartUploadBatch.update)).toHaveBeenCalled();
    });

    it('should throw BatchNotFoundError when batch not found', async () => {
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(null);

      await expect(
        updateBatchStatus('nonexistent', SmartUploadStatus.PROCESSING)
      ).rejects.toThrow(BatchNotFoundError);
    });

    it('should set completedAt for terminal statuses', async () => {
      const mockBatch = createMockBatch();
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);
      vi.mocked(prisma.smartUploadBatch.update).mockResolvedValue({
        ...mockBatch,
        status: SmartUploadStatus.COMPLETE,
        completedAt: new Date(),
      });

      await updateBatchStatus('batch-123', SmartUploadStatus.COMPLETE);

      expect(vi.mocked(prisma.smartUploadBatch.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SmartUploadStatus.COMPLETE,
            completedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('cancelBatch', () => {
    it('should cancel a batch', async () => {
      const mockBatch = createMockBatch({ status: SmartUploadStatus.PROCESSING });
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);
      vi.mocked(prisma.smartUploadBatch.update).mockResolvedValue({
        ...mockBatch,
        status: SmartUploadStatus.CANCELLED,
      });
      vi.mocked(prisma.smartUploadItem.updateMany).mockResolvedValue({ count: 0 });

      await cancelBatch('batch-123');

      expect(vi.mocked(prisma.smartUploadBatch.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SmartUploadStatus.CANCELLED,
          }),
        })
      );
    });

    it('should throw BatchNotFoundError when batch not found', async () => {
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(null);

      await expect(cancelBatch('nonexistent')).rejects.toThrow(BatchNotFoundError);
    });

    it('should throw InvalidBatchStateError when batch is already completed', async () => {
      const mockBatch = createMockBatch({ status: SmartUploadStatus.COMPLETE });
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);

      await expect(cancelBatch('batch-123')).rejects.toThrow(
        InvalidBatchStateError
      );
    });
  });

  // =============================================================================
  // Item Management Tests
  // =============================================================================

  describe('addItemToBatch', () => {
    it('should add item to batch', async () => {
      const mockBatch = createMockBatch();
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);
      vi.mocked(prisma.smartUploadItem.create).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadBatch.update).mockResolvedValue(mockBatch);

      const result = await addItemToBatch('batch-123', {
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

      expect(result).toEqual(mockItem);
      expect(vi.mocked(prisma.smartUploadItem.create)).toHaveBeenCalled();
    });

    it('should throw BatchNotFoundError when batch not found', async () => {
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(null);

      await expect(
        addItemToBatch('nonexistent', {
          fileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow(BatchNotFoundError);
    });

    it('should throw InvalidBatchStateError when batch is completed', async () => {
      const mockBatch = createMockBatch({ status: SmartUploadStatus.COMPLETE });
      vi.mocked(prisma.smartUploadBatch.findUnique).mockResolvedValue(mockBatch);

      await expect(
        addItemToBatch('batch-123', {
          fileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow(InvalidBatchStateError);
    });
  });

  describe('updateItemStatus', () => {
    it('should update item status', async () => {
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadItem.update).mockResolvedValue({
        ...mockItem,
        status: SmartUploadStatus.PROCESSING,
      });
      vi.mocked(prisma.smartUploadItem.count).mockResolvedValue(5);

      await updateItemStatus('item-123', SmartUploadStatus.PROCESSING);

      expect(vi.mocked(prisma.smartUploadItem.update)).toHaveBeenCalled();
    });

    it('should update item status with error message', async () => {
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadItem.update).mockResolvedValue({
        ...mockItem,
        status: SmartUploadStatus.FAILED,
        errorMessage: 'Test error',
      });
      vi.mocked(prisma.smartUploadItem.count).mockResolvedValue(5);

      await updateItemStatus('item-123', SmartUploadStatus.FAILED, 'Test error');

      expect(vi.mocked(prisma.smartUploadItem.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SmartUploadStatus.FAILED,
            errorMessage: 'Test error',
          }),
        })
      );
    });

    it('should throw error when item not found', async () => {
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(null);

      await expect(
        updateItemStatus('nonexistent', SmartUploadStatus.FAILED)
      ).rejects.toThrow();
    });
  });

  describe('updateItemStep', () => {
    it('should update item current step', async () => {
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadItem.update).mockResolvedValue({
        ...mockItem,
        currentStep: SmartUploadStep.TEXT_EXTRACTED,
      });

      await updateItemStep('item-123', SmartUploadStep.TEXT_EXTRACTED);

      expect(vi.mocked(prisma.smartUploadItem.update)).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        data: { currentStep: SmartUploadStep.TEXT_EXTRACTED },
      });
    });
  });

  describe('updateItemMetadata', () => {
    it('should update item metadata', async () => {
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadItem.update).mockResolvedValue({
        ...mockItem,
        extractedMeta: { title: 'Test' },
      });

      await updateItemMetadata('item-123', { title: 'Test' });

      expect(vi.mocked(prisma.smartUploadItem.update)).toHaveBeenCalled();
    });
  });

  describe('getItem', () => {
    it('should return item when found', async () => {
      const mockItem = createMockItem();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);

      const result = await getItem('item-123');

      expect(result).toEqual(mockItem);
    });

    it('should return null when item not found', async () => {
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(null);

      const result = await getItem('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBatchItems', () => {
    it('should return all items in batch', async () => {
      const mockItems = [createMockItem(), createMockItem({ id: 'item-456' })];
      vi.mocked(prisma.smartUploadItem.findMany).mockResolvedValue(mockItems);

      const result = await getBatchItems('batch-123');

      expect(result).toEqual(mockItems);
    });
  });

  // =============================================================================
  // Proposal Management Tests
  // =============================================================================

  describe('createProposal', () => {
    it('should create a proposal for an item', async () => {
      const mockItem = createMockItem();
      const mockProposal = createMockProposal();
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(mockItem);
      vi.mocked(prisma.smartUploadProposal.create).mockResolvedValue(mockProposal);

      const result = await createProposal('item-123', {
        title: 'Test Piece',
        composer: 'Test Composer',
      });

      expect(result).toEqual(mockProposal);
      expect(vi.mocked(prisma.smartUploadProposal.create)).toHaveBeenCalled();
    });

    it('should throw error when item not found', async () => {
      vi.mocked(prisma.smartUploadItem.findUnique).mockResolvedValue(null);

      await expect(
        createProposal('nonexistent', { title: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('updateProposal', () => {
    it('should update a proposal', async () => {
      const mockProposal = createMockProposal();
      vi.mocked(prisma.smartUploadProposal.findUnique).mockResolvedValue(mockProposal);
      vi.mocked(prisma.smartUploadProposal.update).mockResolvedValue({
        ...mockProposal,
        title: 'Updated Title',
      });

      await updateProposal('proposal-123', { title: 'Updated Title' });

      expect(vi.mocked(prisma.smartUploadProposal.update)).toHaveBeenCalled();
    });

    it('should throw ProposalNotFoundError when proposal not found', async () => {
      vi.mocked(prisma.smartUploadProposal.findUnique).mockResolvedValue(null);

      await expect(
        updateProposal('nonexistent', { title: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('approveProposal', () => {
    it('should be defined', () => {
      expect(approveProposal).toBeDefined();
      expect(typeof approveProposal).toBe('function');
    });
  });

  describe('getProposal', () => {
    it('should return proposal when found', async () => {
      const mockProposal = createMockProposal();
      vi.mocked(prisma.smartUploadProposal.findUnique).mockResolvedValue(mockProposal);

      const result = await getProposal('proposal-123');

      expect(result).toEqual(mockProposal);
    });

    it('should return null when proposal not found', async () => {
      vi.mocked(prisma.smartUploadProposal.findUnique).mockResolvedValue(null);

      const result = await getProposal('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBatchProposals', () => {
    it('should return all proposals in batch', async () => {
      const mockProposals = [
        createMockProposal(),
        createMockProposal({ id: 'proposal-456' }),
      ];
      vi.mocked(prisma.smartUploadProposal.findMany).mockResolvedValue(mockProposals);

      const result = await getBatchProposals('batch-123');

      expect(result).toEqual(mockProposals);
    });
  });

  // =============================================================================
  // Ingestion Tests
  // =============================================================================

  describe('ingestBatch', () => {
    it('should be defined', () => {
      expect(ingestBatch).toBeDefined();
      expect(typeof ingestBatch).toBe('function');
    });
  });
});
