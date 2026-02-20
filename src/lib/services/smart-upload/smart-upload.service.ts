/**
 * Smart Upload Service
 *
 * Orchestrates the smart upload workflow including:
 * - Batch and item lifecycle management
 * - Proposal creation and approval
 * - Ingestion into the music library
 */

import { prisma } from '@/lib/db';
import { auditLog } from '@/lib/services/audit';
import { deleteFile, getSignedDownloadUrl } from '@/lib/services/storage';
import { invalidateMusicCache } from '@/lib/cache';
import {
  SmartUploadStatus,
  SmartUploadStep,
  FileType,
  Prisma,
} from '@prisma/client';
import type {
  SmartUploadBatch,
  SmartUploadItem,
  SmartUploadProposal,
} from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CreateItemInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey?: string;
}

export interface CreateProposalInput {
  title?: string;
  composer?: string;
  arranger?: string;
  publisher?: string;
  difficulty?: string;
  genre?: string;
  style?: string;
  instrumentation?: string;
  duration?: number;
  notes?: string;
  titleConfidence?: number;
  composerConfidence?: number;
  difficultyConfidence?: number;
  matchedPieceId?: string;
  isNewPiece?: boolean;
}

export interface ProposalData {
  title?: string;
  composer?: string;
  arranger?: string;
  publisher?: string;
  difficulty?: string;
  genre?: string;
  style?: string;
  instrumentation?: string;
  duration?: number;
  notes?: string;
}

export interface ExtractedMetadata {
  title?: string;
  composer?: string;
  arranger?: string;
  publisher?: string;
  difficulty?: string;
  genre?: string;
  style?: string;
  instrumentation?: string;
  duration?: number;
  notes?: string;
  ocrText?: string;
}

export interface BatchWithItems {
  batch: SmartUploadBatch;
  items: SmartUploadItem[];
  proposals: SmartUploadProposal[];
}

export interface MusicFileInput {
  fileName: string;
  fileType: FileType;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  source?: string;
  originalUploadId?: string;
  extractedMetadata?: Record<string, unknown>;
}

export interface MusicPartInput {
  instrumentId: string;
  partName: string;
  fileId?: string;
  isOptional?: boolean;
  notes?: string;
}

export interface IngestResult {
  success: boolean;
  pieceId?: string;
  filesCreated: number;
  partsCreated: number;
  errors: string[];
}

// =============================================================================
// Error Classes
// =============================================================================

export class SmartUploadServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'SmartUploadServiceError';
  }
}

export class BatchNotFoundError extends SmartUploadServiceError {
  constructor(batchId: string) {
    super(`Batch not found: ${batchId}`, 'BATCH_NOT_FOUND', 404);
    this.name = 'BatchNotFoundError';
  }
}

export class ItemNotFoundError extends SmartUploadServiceError {
  constructor(itemId: string) {
    super(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND', 404);
    this.name = 'ItemNotFoundError';
  }
}

export class ProposalNotFoundError extends SmartUploadServiceError {
  constructor(proposalId: string) {
    super(`Proposal not found: ${proposalId}`, 'PROPOSAL_NOT_FOUND', 404);
    this.name = 'ProposalNotFoundError';
  }
}

export class InvalidBatchStateError extends SmartUploadServiceError {
  constructor(message: string) {
    super(message, 'INVALID_BATCH_STATE', 400);
    this.name = 'InvalidBatchStateError';
  }
}

// =============================================================================
// Batch Lifecycle
// =============================================================================

/**
 * Create a new smart upload batch
 */
export async function createBatch(userId: string): Promise<SmartUploadBatch> {
  const batch = await prisma.smartUploadBatch.create({
    data: {
      userId,
      status: SmartUploadStatus.CREATED,
      totalFiles: 0,
      processedFiles: 0,
      successFiles: 0,
      failedFiles: 0,
    },
  });

  await auditLog({
    action: 'smart_upload.batch.create',
    entityType: 'SmartUploadBatch',
    entityId: batch.id,
    newValues: { userId, status: batch.status },
  });

  return batch;
}

/**
 * Get a batch by ID
 */
export async function getBatch(batchId: string): Promise<SmartUploadBatch | null> {
  return prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
  });
}

/**
 * Get a batch with all its items and proposals
 */
export async function getBatchWithItems(batchId: string): Promise<BatchWithItems | null> {
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
      },
      proposals: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!batch) {
    return null;
  }

  return {
    batch,
    items: batch.items,
    proposals: batch.proposals,
  };
}

/**
 * List all batches for a user
 */
export async function listUserBatches(userId: string): Promise<SmartUploadBatch[]> {
  return prisma.smartUploadBatch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update batch status
 */
export async function updateBatchStatus(
  batchId: string,
  status: SmartUploadStatus
): Promise<void> {
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }

  await prisma.smartUploadBatch.update({
    where: { id: batchId },
    data: {
      status,
      completedAt: isTerminalStatus(status) ? new Date() : null,
    },
  });

  await auditLog({
    action: `smart_upload.batch.status.${status.toLowerCase()}`,
    entityType: 'SmartUploadBatch',
    entityId: batchId,
    newValues: { status },
  });
}

/**
 * Cancel a batch
 */
export async function cancelBatch(batchId: string): Promise<void> {
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }

  if (isTerminalStatus(batch.status)) {
    throw new InvalidBatchStateError('Cannot cancel a batch that is already completed');
  }

  // Update batch status
  await prisma.smartUploadBatch.update({
    where: { id: batchId },
    data: {
      status: SmartUploadStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  // Cancel all pending items
  await prisma.smartUploadItem.updateMany({
    where: {
      batchId,
      status: {
        notIn: [
          SmartUploadStatus.COMPLETE,
          SmartUploadStatus.FAILED,
          SmartUploadStatus.CANCELLED,
        ],
      },
    },
    data: {
      status: SmartUploadStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  await auditLog({
    action: 'smart_upload.batch.cancel',
    entityType: 'SmartUploadBatch',
    entityId: batchId,
    newValues: { status: SmartUploadStatus.CANCELLED },
  });
}

/**
 * Update batch counts after item processing
 */
export async function updateBatchCounts(batchId: string): Promise<void> {
  const [total, processed, success, failed] = await Promise.all([
    prisma.smartUploadItem.count({ where: { batchId } }),
    prisma.smartUploadItem.count({
      where: { batchId, status: { in: [SmartUploadStatus.COMPLETE, SmartUploadStatus.FAILED] } },
    }),
    prisma.smartUploadItem.count({
      where: { batchId, status: SmartUploadStatus.COMPLETE },
    }),
    prisma.smartUploadItem.count({
      where: { batchId, status: SmartUploadStatus.FAILED },
    }),
  ]);

  await prisma.smartUploadBatch.update({
    where: { id: batchId },
    data: {
      totalFiles: total,
      processedFiles: processed,
      successFiles: success,
      failedFiles: failed,
    },
  });
}

// =============================================================================
// Item Management
// =============================================================================

/**
 * Add an item to a batch
 */
export async function addItemToBatch(
  batchId: string,
  item: CreateItemInput
): Promise<SmartUploadItem> {
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }

  if (isTerminalStatus(batch.status)) {
    throw new InvalidBatchStateError('Cannot add items to a completed batch');
  }

  const newItem = await prisma.smartUploadItem.create({
    data: {
      batchId,
      fileName: item.fileName,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      storageKey: item.storageKey,
      status: SmartUploadStatus.CREATED,
    },
  });

  // Update batch total count
  await prisma.smartUploadBatch.update({
    where: { id: batchId },
    data: {
      totalFiles: { increment: 1 },
    },
  });

  await auditLog({
    action: 'smart_upload.item.create',
    entityType: 'SmartUploadItem',
    entityId: newItem.id,
    newValues: { batchId, fileName: item.fileName },
  });

  return newItem;
}

/**
 * Update item status
 */
export async function updateItemStatus(
  itemId: string,
  status: SmartUploadStatus,
  error?: string
): Promise<void> {
  const item = await prisma.smartUploadItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new ItemNotFoundError(itemId);
  }

  await prisma.smartUploadItem.update({
    where: { id: itemId },
    data: {
      status,
      errorMessage: error || null,
      completedAt: isTerminalStatus(status) ? new Date() : null,
    },
  });

  // Update batch counts
  await updateBatchCounts(item.batchId);

  await auditLog({
    action: `smart_upload.item.status.${status.toLowerCase()}`,
    entityType: 'SmartUploadItem',
    entityId: itemId,
    newValues: { status, error },
  });
}

/**
 * Update item step progress
 */
export async function updateItemStep(
  itemId: string,
  step: SmartUploadStep
): Promise<void> {
  const item = await prisma.smartUploadItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new ItemNotFoundError(itemId);
  }

  await prisma.smartUploadItem.update({
    where: { id: itemId },
    data: { currentStep: step },
  });
}

/**
 * Update item extracted metadata
 */
export async function updateItemMetadata(
  itemId: string,
  metadata: ExtractedMetadata
): Promise<void> {
  const item = await prisma.smartUploadItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new ItemNotFoundError(itemId);
  }

  await prisma.smartUploadItem.update({
    where: { id: itemId },
    data: {
      extractedMeta: metadata as Prisma.JsonObject,
      ocrText: metadata.ocrText || null,
    },
  });
}

/**
 * Get a single item
 */
export async function getItem(itemId: string): Promise<SmartUploadItem | null> {
  return prisma.smartUploadItem.findUnique({
    where: { id: itemId },
  });
}

/**
 * Get all items in a batch
 */
export async function getBatchItems(batchId: string): Promise<SmartUploadItem[]> {
  return prisma.smartUploadItem.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  });
}

// =============================================================================
// Proposal Management
// =============================================================================

/**
 * Create a proposal for an item
 */
export async function createProposal(
  itemId: string,
  proposal: CreateProposalInput
): Promise<SmartUploadProposal> {
  const item = await prisma.smartUploadItem.findUnique({
    where: { id: itemId },
    include: { batch: true },
  });

  if (!item) {
    throw new ItemNotFoundError(itemId);
  }

  const newProposal = await prisma.smartUploadProposal.create({
    data: {
      itemId,
      batchId: item.batchId,
      title: proposal.title,
      composer: proposal.composer,
      arranger: proposal.arranger,
      publisher: proposal.publisher,
      difficulty: proposal.difficulty,
      genre: proposal.genre,
      style: proposal.style,
      instrumentation: proposal.instrumentation,
      duration: proposal.duration,
      notes: proposal.notes,
      titleConfidence: proposal.titleConfidence,
      composerConfidence: proposal.composerConfidence,
      difficultyConfidence: proposal.difficultyConfidence,
      matchedPieceId: proposal.matchedPieceId,
      isNewPiece: proposal.isNewPiece ?? true,
    },
  });

  await auditLog({
    action: 'smart_upload.proposal.create',
    entityType: 'SmartUploadProposal',
    entityId: newProposal.id,
    newValues: { itemId, title: proposal.title },
  });

  return newProposal;
}

/**
 * Update a proposal with corrections
 */
export async function updateProposal(
  proposalId: string,
  corrections: Partial<ProposalData>
): Promise<void> {
  const proposal = await prisma.smartUploadProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  // Merge existing corrections with new ones
  const existingCorrections = (proposal.corrections as Record<string, unknown>) || {};
  const mergedCorrections = { ...existingCorrections, ...corrections };

  await prisma.smartUploadProposal.update({
    where: { id: proposalId },
    data: {
      corrections: mergedCorrections as Prisma.JsonObject,
      ...corrections, // Update the actual fields too
    },
  });

  await auditLog({
    action: 'smart_upload.proposal.update',
    entityType: 'SmartUploadProposal',
    entityId: proposalId,
    newValues: corrections,
  });
}

/**
 * Approve a proposal
 */
export async function approveProposal(
  proposalId: string,
  approvedBy: string
): Promise<void> {
  const proposal = await prisma.smartUploadProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  await prisma.smartUploadProposal.update({
    where: { id: proposalId },
    data: {
      isApproved: true,
      approvedAt: new Date(),
      approvedBy,
    },
  });

  // Update item status to approved
  await prisma.smartUploadItem.update({
    where: { id: proposal.itemId },
    data: { status: SmartUploadStatus.APPROVED },
  });

  // Check if all items in batch are approved
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: proposal.batchId },
    include: {
      items: { where: { status: { not: SmartUploadStatus.APPROVED } } },
    },
  });

  if (batch && batch.items.length === 0) {
    await updateBatchStatus(proposal.batchId, SmartUploadStatus.NEEDS_REVIEW);
  }

  await auditLog({
    action: 'smart_upload.proposal.approve',
    entityType: 'SmartUploadProposal',
    entityId: proposalId,
    newValues: { approvedBy },
  });
}

/**
 * Get proposal by ID
 */
export async function getProposal(proposalId: string): Promise<SmartUploadProposal | null> {
  return prisma.smartUploadProposal.findUnique({
    where: { id: proposalId },
    include: {
      item: true,
      batch: true,
    },
  });
}

/**
 * Get all proposals for a batch
 */
export async function getBatchProposals(batchId: string): Promise<SmartUploadProposal[]> {
  return prisma.smartUploadProposal.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  });
}

// =============================================================================
// Ingestion
// =============================================================================

/**
 * Ingest an approved batch into the music library
 * This creates MusicPiece, MusicFile, and MusicPart records
 */
export async function ingestBatch(
  batchId: string,
  approvedBy: string
): Promise<IngestResult> {
  const batch = await getBatchWithItems(batchId);

  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }

  // Get all approved proposals
  const approvedProposals = batch.proposals.filter(p => p.isApproved);

  if (approvedProposals.length === 0) {
    throw new InvalidBatchStateError('No approved proposals to ingest');
  }

  // Update batch status to ingesting
  await updateBatchStatus(batchId, SmartUploadStatus.INGESTING);

  const result: IngestResult = {
    success: true,
    filesCreated: 0,
    partsCreated: 0,
    errors: [],
  };

  try {
    for (const proposal of approvedProposals) {
      try {
        const item = batch.items.find(i => i.id === proposal.itemId);
        if (!item) continue;

        // Prepare file inputs
        const fileInputs: MusicFileInput[] = [];

        if (item.storageKey) {
          fileInputs.push({
            fileName: item.fileName,
            fileType: FileType.PART,
            fileSize: item.fileSize,
            mimeType: item.mimeType,
            storageKey: item.storageKey,
            source: 'smart_upload',
            originalUploadId: item.id,
            extractedMetadata: item.extractedMeta as Record<string, unknown>,
          });
        }

        // Prepare part inputs (would need instrument mapping from the proposal)
        const partInputs: MusicPartInput[] = [];

        // If proposal has instrumentation, we would parse and map instruments here
        // For now, create a basic part
        if (proposal.instrumentation) {
          // This would use the instrument-mapper to resolve instruments
          // Placeholder: in real implementation, parse proposal.instrumentation
        }

        // Create the music piece
        const piece = await createMusicPieceFromSmartUpload(
          proposal,
          fileInputs,
          partInputs
        );

        result.pieceId = piece.id;
        result.filesCreated += fileInputs.length;
        result.partsCreated += partInputs.length;

        // Mark item as complete
        await updateItemStatus(item.id, SmartUploadStatus.COMPLETE);

        // Update proposal with matched piece ID
        await prisma.smartUploadProposal.update({
          where: { id: proposal.id },
          data: { matchedPieceId: piece.id },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to ingest proposal ${proposal.id}: ${errorMessage}`);

        // Mark item as failed
        const item = batch.items.find(i => i.id === proposal.itemId);
        if (item) {
          await updateItemStatus(item.id, SmartUploadStatus.FAILED, errorMessage);
        }
      }
    }

    // Update final batch status
    if (result.errors.length > 0) {
      result.success = false;
      await updateBatchStatus(batchId, SmartUploadStatus.FAILED);
      await prisma.smartUploadBatch.update({
        where: { id: batchId },
        data: {
          errorSummary: result.errors.join('; '),
        },
      });
    } else {
      await updateBatchStatus(batchId, SmartUploadStatus.COMPLETE);
    }

    // Invalidate music caches
    if (result.pieceId) {
      await invalidateMusicCache(result.pieceId);
    }
  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Batch ingestion failed: ${errorMessage}`);
    await updateBatchStatus(batchId, SmartUploadStatus.FAILED);
  }

  return result;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a status is terminal
 */
function isTerminalStatus(status: SmartUploadStatus): boolean {
  const terminalStatuses: SmartUploadStatus[] = [
    SmartUploadStatus.COMPLETE,
    SmartUploadStatus.FAILED,
    SmartUploadStatus.CANCELLED,
  ];
  return terminalStatuses.includes(status);
}

/**
 * Create a music piece from a smart upload proposal
 * This function is exported for use by the music service
 */
export async function createMusicPieceFromSmartUpload(
  proposal: SmartUploadProposal,
  files: MusicFileInput[],
  parts: MusicPartInput[]
): Promise<import('@prisma/client').MusicPiece> {
  // Get final values (apply corrections if any)
  const corrections = (proposal.corrections as Record<string, unknown>) || {};
  const title = (corrections.title as string) || proposal.title || 'Untitled';
  const composer = (corrections.composer as string) || proposal.composer;
  const arranger = (corrections.arranger as string) || proposal.arranger;
  const publisher = (corrections.publisher as string) || proposal.publisher;
  const difficulty = corrections.difficulty as import('@prisma/client').MusicDifficulty | undefined;
  const genre = (corrections.genre as string) || proposal.genre;
  const style = (corrections.style as string) || proposal.style;
  const instrumentation = (corrections.instrumentation as string) || proposal.instrumentation;
  const duration = corrections.duration as number | undefined || proposal.duration;
  const notes = (corrections.notes as string) || proposal.notes;

  // Create the piece in a transaction
  const piece = await prisma.$transaction(async (tx) => {
    // Create the music piece
    const newPiece = await tx.musicPiece.create({
      data: {
        title,
        subtitle: null,
        composerId: null, // Would need to look up or create Person
        arrangerId: null, // Would need to look up or create Person
        publisherId: null, // Would need to look up or create Publisher
        difficulty: difficulty || null,
        duration: duration || null,
        genre: genre || null,
        style: style || null,
        instrumentation: instrumentation || null,
        notes: notes || null,
      },
    });

    // Create music files
    for (const fileInput of files) {
      await tx.musicFile.create({
        data: {
          pieceId: newPiece.id,
          fileName: fileInput.fileName,
          fileType: fileInput.fileType,
          fileSize: fileInput.fileSize,
          mimeType: fileInput.mimeType,
          storageKey: fileInput.storageKey,
          source: fileInput.source || 'smart_upload',
          originalUploadId: fileInput.originalUploadId,
          extractedMetadata: fileInput.extractedMetadata as Prisma.JsonObject || Prisma.JsonNull,
        },
      });
    }

    // Create music parts
    for (const partInput of parts) {
      await tx.musicPart.create({
        data: {
          pieceId: newPiece.id,
          instrumentId: partInput.instrumentId,
          partName: partInput.partName,
          fileId: partInput.fileId || null,
          isOptional: partInput.isOptional || false,
          notes: partInput.notes || null,
        },
      });
    }

    return newPiece;
  });

  await auditLog({
    action: 'smart_upload.ingest.create_piece',
    entityType: 'MusicPiece',
    entityId: piece.id,
    newValues: { title, proposalId: proposal.id },
  });

  return piece;
}
