/**
 * Smart Upload Worker for ECCB Platform
 *
 * Processes Smart Upload jobs from the queue including:
 * - Text extraction from PDFs
 * - LLM metadata extraction
 * - Classification and split planning
 * - PDF splitting
 * - Ingestion into music library
 * - Cleanup on failure/cancellation
 */

import { Job } from 'bullmq';

import { prisma } from '@/lib/db';
import { createWorker, QUEUE_NAMES } from '@/lib/jobs/queue';
import {
  JOB_CONFIGS,
  SMART_UPLOAD_JOBS,
  type SmartUploadExtractTextPayload,
  type SmartUploadLlmPayload,
  type SmartUploadSplitPayload,
  type SmartUploadIngestPayload,
  type SmartUploadCleanupPayload,
} from '@/lib/jobs/definitions';
import { logger } from '@/lib/logger';
import { downloadFile, uploadFile, deleteFile } from '@/lib/services/storage';
import { extractTextFromPdf } from '@/lib/services/smart-upload/text-extraction';
import { splitPdf, createSplitPlanFromClassification } from '@/lib/services/smart-upload/pdf-splitter';
import { extractMusicMetadata, classifyParts } from '@/lib/ai';
import { SmartUploadStatus, SmartUploadStep } from '@prisma/client';

// =============================================================================
// Job Processors
// =============================================================================

/**
 * Process text extraction job - extracts text from PDF using pdf-parse
 */
async function handleExtractText(job: Job<SmartUploadExtractTextPayload>): Promise<void> {
  const { batchId, itemId, storageKey } = job.data;

  logger.info('Processing text extraction job', {
    jobId: job.id,
    batchId,
    itemId,
    storageKey,
  });

  try {
    // Update item status to PROCESSING
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.TEXT_EXTRACTED,
      },
    });

    await job.updateProgress(10);

    // Download the PDF file
    const downloadResult = await downloadFile(storageKey);
    if (typeof downloadResult !== 'object' || !downloadResult.buffer) {
      throw new Error('Failed to download PDF file');
    }

    await job.updateProgress(30);

    // Extract text from PDF
    const extractionResult = await extractTextFromPdf(downloadResult.buffer);

    await job.updateProgress(70);

    // Update item with extracted text
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        ocrText: extractionResult.text,
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.TEXT_EXTRACTED,
      },
    });

    await job.updateProgress(100);

    logger.info('Text extraction completed', {
      jobId: job.id,
      itemId,
      textLength: extractionResult.text.length,
      pageCount: extractionResult.pageCount,
      method: extractionResult.method,
    });

    // Enqueue next job - LLM metadata extraction
    await enqueueJob(SMART_UPLOAD_JOBS.LLM_EXTRACT_METADATA, { batchId, itemId });
  } catch (error) {
    await handleJobError(itemId, 'TEXT_EXTRACTION', error);
    throw error;
  }
}

/**
 * Process LLM metadata extraction job - uses AI to extract music metadata
 */
async function handleLlmExtractMetadata(job: Job<SmartUploadLlmPayload>): Promise<void> {
  const { batchId, itemId } = job.data;

  logger.info('Processing LLM metadata extraction job', {
    jobId: job.id,
    batchId,
    itemId,
  });

  try {
    // Get the item with extracted text
    const item = await prisma.smartUploadItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new Error(`SmartUploadItem not found: ${itemId}`);
    }

    if (!item.ocrText) {
      throw new Error('No OCR text available for metadata extraction');
    }

    // Update item status
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.METADATA_EXTRACTED,
      },
    });

    await job.updateProgress(20);

    // Extract music metadata using AI
    const metadataResult = await extractMusicMetadata(item.ocrText);

    await job.updateProgress(60);

    if (!metadataResult.data) {
      throw new Error(metadataResult.error || 'Failed to extract metadata');
    }

    // Update item with extracted metadata
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        extractedMeta: metadataResult.data as object,
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.METADATA_EXTRACTED,
      },
    });

    await job.updateProgress(100);

    logger.info('LLM metadata extraction completed', {
      jobId: job.id,
      itemId,
      metadata: metadataResult.data,
    });

    // Enqueue next job - classify and plan split
    await enqueueJob(SMART_UPLOAD_JOBS.CLASSIFY_AND_PLAN, { batchId, itemId });
  } catch (error) {
    await handleJobError(itemId, 'METADATA_EXTRACTION', error);
    throw error;
  }
}

/**
 * Process classification and split planning job - determines if PDF needs splitting
 */
async function handleClassifyAndPlan(job: Job<SmartUploadLlmPayload>): Promise<void> {
  const { batchId, itemId } = job.data;

  logger.info('Processing classification and split planning job', {
    jobId: job.id,
    batchId,
    itemId,
  });

  try {
    // Get the item with extracted text
    const item = await prisma.smartUploadItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new Error(`SmartUploadItem not found: ${itemId}`);
    }

    if (!item.ocrText) {
      throw new Error('No OCR text available for classification');
    }

    // Update item status
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.SPLIT_PLANNED,
      },
    });

    await job.updateProgress(20);

    // Classify parts using AI
    const classificationResult = await classifyParts(item.ocrText);

    await job.updateProgress(60);

    if (!classificationResult.data) {
      throw new Error(classificationResult.error || 'Failed to classify parts');
    }

    const classification = classificationResult.data;

    // Determine if this is a packet (needs splitting)
    const isPacket = classification.parts.length > 1;

    // Create split plan if needed
    let splitPlan = null;
    if (isPacket) {
      splitPlan = createSplitPlanFromClassification(classification);
    }

    // Update item with classification results
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        isPacket,
        splitPages: splitPlan?.pages.length || null,
        splitFiles: splitPlan as object,
        status: SmartUploadStatus.NEEDS_REVIEW,
        currentStep: SmartUploadStep.SPLIT_PLANNED,
      },
    });

    // Update batch status
    await prisma.smartUploadBatch.update({
      where: { id: batchId },
      data: {
        status: SmartUploadStatus.NEEDS_REVIEW,
      },
    });

    await job.updateProgress(100);

    logger.info('Classification and split planning completed', {
      jobId: job.id,
      itemId,
      isPacket,
      partsCount: classification.parts.length,
    });

    // If it's a packet that needs splitting, enqueue split job after approval
    // Otherwise, the ingest job will be triggered by the approval flow
  } catch (error) {
    await handleJobError(itemId, 'CLASSIFICATION', error);
    throw error;
  }
}

/**
 * Process PDF split job - splits packet PDFs into individual parts
 */
async function handleSplitPdf(job: Job<SmartUploadSplitPayload>): Promise<void> {
  const { batchId, itemId, storageKey, splitPlan } = job.data;

  logger.info('Processing PDF split job', {
    jobId: job.id,
    batchId,
    itemId,
    storageKey,
    splitPlanPages: splitPlan.pages.length,
  });

  try {
    // Update item status
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.SPLIT_PLANNED,
      },
    });

    await job.updateProgress(10);

    // Download the original PDF
    const downloadResult = await downloadFile(storageKey);
    if (typeof downloadResult !== 'object' || !downloadResult.buffer) {
      throw new Error('Failed to download PDF file for splitting');
    }

    await job.updateProgress(20);

    // Split the PDF
    const splitResult = await splitPdf(downloadResult.buffer, splitPlan);

    await job.updateProgress(60);

    // Upload split files
    const splitFileInfos = [];
    for (let i = 0; i < splitResult.files.length; i++) {
      const file = splitResult.files[i];
      await uploadFile(file.storageKey, file.buffer, {
        contentType: 'application/pdf',
      });
      splitFileInfos.push({
        instrument: file.instrument,
        pages: file.pages,
        storageKey: file.storageKey,
      });

      await job.updateProgress(60 + Math.round((i + 1) / splitResult.files.length * 30));
    }

    // Update item with split file info
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        splitFiles: splitFileInfos as object,
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.SPLIT_COMPLETE,
      },
    });

    await job.updateProgress(100);

    logger.info('PDF split completed', {
      jobId: job.id,
      itemId,
      partsCount: splitResult.files.length,
    });

    // Enqueue ingest job
    await enqueueJob(SMART_UPLOAD_JOBS.INGEST, { batchId, approvedBy: 'system' });
  } catch (error) {
    await handleJobError(itemId, 'PDF_SPLIT', error);
    throw error;
  }
}

/**
 * Process ingest job - creates music library entries from approved items
 */
async function handleIngest(job: Job<SmartUploadIngestPayload>): Promise<void> {
  const { batchId, approvedBy } = job.data;

  logger.info('Processing ingest job', {
    jobId: job.id,
    batchId,
    approvedBy,
  });

  try {
    // Get all items in the batch
    const items = await prisma.smartUploadItem.findMany({
      where: {
        batchId,
        status: SmartUploadStatus.APPROVED,
      },
      include: {
        batch: true,
      },
    });

    if (items.length === 0) {
      logger.warn('No approved items to ingest', { jobId: job.id, batchId });
      return;
    }

    // Update batch status
    await prisma.smartUploadBatch.update({
      where: { id: batchId },
      data: {
        status: SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.INGESTED,
      },
    });

    let successCount = 0;
    let failCount = 0;

    // Wrap all ingest operations in a transaction to ensure atomicity
    // If any item fails, all changes will be rolled back
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        try {
          // Create music library entry
          // Note: This is a simplified version - actual implementation would create
          // Music and MusicAssignment records
          await tx.music.create({
            data: {
              title: (item.extractedMeta as { title?: string })?.title || item.fileName,
              composer: (item.extractedMeta as { composer?: string })?.composer || 'Unknown',
              arrangement: (item.extractedMeta as { arrangement?: string })?.arrangement || '',
              publisher: (item.extractedMeta as { publisher?: string })?.publisher || '',
              storageKey: item.storageKey || '',
              source: 'smart_upload',
              originalUploadId: item.id,
            },
          });

          // Update item status
          await tx.smartUploadItem.update({
            where: { id: item.id },
            data: {
              status: SmartUploadStatus.COMPLETE,
              currentStep: SmartUploadStep.INGESTED,
              completedAt: new Date(),
            },
          });

          successCount++;
        } catch (error) {
          logger.error('Failed to ingest item', { itemId: item.id, error });
          failCount++;

          // Update item with error
          await tx.smartUploadItem.update({
            where: { id: item.id },
            data: {
              status: SmartUploadStatus.FAILED,
              errorMessage: error instanceof Error ? error.message : 'Ingestion failed',
            },
          });
        }

        await job.updateProgress(Math.round((i + 1) / items.length * 90));
      }
    });

    // Update batch with final counts
    await prisma.smartUploadBatch.update({
      where: { id: batchId },
      data: {
        status: failCount === 0 ? SmartUploadStatus.COMPLETE : SmartUploadStatus.PROCESSING,
        currentStep: SmartUploadStep.INGESTED,
        successFiles: successCount,
        failedFiles: failCount,
        completedAt: failCount === 0 ? new Date() : undefined,
      },
    });

    await job.updateProgress(100);

    logger.info('Ingest completed', {
      jobId: job.id,
      batchId,
      successCount,
      failCount,
    });
  } catch (error) {
    await prisma.smartUploadBatch.update({
      where: { id: batchId },
      data: {
        status: SmartUploadStatus.FAILED,
        errorSummary: error instanceof Error ? error.message : 'Ingest failed',
      },
    });
    throw error;
  }
}

/**
 * Process cleanup job - handles cancellation and failure cleanup
 */
async function handleCleanup(job: Job<SmartUploadCleanupPayload>): Promise<void> {
  const { batchId, itemId, reason } = job.data;

  logger.info('Processing cleanup job', {
    jobId: job.id,
    batchId,
    itemId,
    reason,
  });

  try {
    if (itemId) {
      // Clean up specific item
      const item = await prisma.smartUploadItem.findUnique({
        where: { id: itemId },
      });

      if (item?.storageKey) {
        try {
          await deleteFile(item.storageKey);
          logger.debug('Deleted uploaded file', { storageKey: item.storageKey });
        } catch {
          logger.warn('Failed to delete uploaded file', { storageKey: item.storageKey });
        }
      }

      // Update item status
      await prisma.smartUploadItem.update({
        where: { id: itemId },
        data: {
          status: reason === 'cancelled' ? SmartUploadStatus.CANCELLED : SmartUploadStatus.FAILED,
          currentStep: null,
        },
      });
    }

    if (batchId) {
      // Clean up all items in batch
      const items = await prisma.smartUploadItem.findMany({
        where: { batchId },
      });

      for (const item of items) {
        if (item.storageKey) {
          try {
            await deleteFile(item.storageKey);
          } catch {
            logger.warn('Failed to delete uploaded file', { storageKey: item.storageKey });
          }
        }
      }

      // Update batch status
      await prisma.smartUploadBatch.update({
        where: { id: batchId },
        data: {
          status: reason === 'cancelled' ? SmartUploadStatus.CANCELLED : SmartUploadStatus.FAILED,
          currentStep: null,
        },
      });
    }

    await job.updateProgress(100);

    logger.info('Cleanup completed', {
      jobId: job.id,
      batchId,
      itemId,
      reason,
    });
  } catch (error) {
    logger.error('Cleanup job failed', { error });
    throw error;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Enqueue a Smart Upload job
 */
async function enqueueJob<T extends keyof typeof SMART_UPLOAD_JOBS>(
  jobName: T,
  data: Parameters<typeof SMART_UPLOAD_JOBS[T] extends string ? infer P : never>[0] extends infer D ? D extends object ? D : never : never
): Promise<void> {
  const { addJob } = await import('@/lib/jobs/queue');
  const jobType = SMART_UPLOAD_JOBS[jobName] as Parameters<typeof addJob>[0];

  await addJob(jobType as Parameters<typeof addJob>[0], data as Parameters<typeof addJob>[1]);
}

/**
 * Handle job errors - update item status and log error
 */
async function handleJobError(
  itemId: string,
  step: string,
  error: unknown
): Promise<void> {
  logger.error(`Smart Upload job failed at step: ${step}`, {
    itemId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  try {
    await prisma.smartUploadItem.update({
      where: { id: itemId },
      data: {
        status: SmartUploadStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorDetails: error instanceof Error ? { stack: error.stack } : null,
      },
    });
  } catch {
    logger.error('Failed to update item status after error', { itemId });
  }
}

// =============================================================================
// Worker Creation
// =============================================================================

let smartUploadWorker: ReturnType<typeof createWorker> | null = null;

/**
 * Start the Smart Upload worker
 */
export function startSmartUploadWorker(): void {
  const config = JOB_CONFIGS['smartUpload.extractText'];

  smartUploadWorker = createWorker({
    queueName: 'SMART_UPLOAD',
    concurrency: 3,
    processor: async (job: Job) => {
      switch (job.name) {
        case SMART_UPLOAD_JOBS.EXTRACT_TEXT:
          await handleExtractText(job as Job<SmartUploadExtractTextPayload>);
          break;
        case SMART_UPLOAD_JOBS.LLM_EXTRACT_METADATA:
          await handleLlmExtractMetadata(job as Job<SmartUploadLlmPayload>);
          break;
        case SMART_UPLOAD_JOBS.CLASSIFY_AND_PLAN:
          await handleClassifyAndPlan(job as Job<SmartUploadLlmPayload>);
          break;
        case SMART_UPLOAD_JOBS.SPLIT_PDF:
          await handleSplitPdf(job as Job<SmartUploadSplitPayload>);
          break;
        case SMART_UPLOAD_JOBS.INGEST:
          await handleIngest(job as Job<SmartUploadIngestPayload>);
          break;
        case SMART_UPLOAD_JOBS.CLEANUP:
          await handleCleanup(job as Job<SmartUploadCleanupPayload>);
          break;
        default:
          throw new Error(`Unknown Smart Upload job type: ${job.name}`);
      }
    },
  });

  logger.info('Smart Upload worker started', {
    concurrency: 3,
  });
}

/**
 * Stop the Smart Upload worker
 */
export async function stopSmartUploadWorker(): Promise<void> {
  if (smartUploadWorker) {
    await smartUploadWorker.close();
    smartUploadWorker = null;
    logger.info('Smart Upload worker stopped');
  }
}

/**
 * Check if Smart Upload worker is running
 */
export function isSmartUploadWorkerRunning(): boolean {
  return smartUploadWorker !== null;
}

// =============================================================================
// Export Job Types for External Enqueueing
// =============================================================================

export { SMART_UPLOAD_JOBS };
export type {
  SmartUploadExtractTextPayload,
  SmartUploadLlmPayload,
  SmartUploadSplitPayload,
  SmartUploadIngestPayload,
  SmartUploadCleanupPayload,
} from '@/lib/jobs/definitions';
