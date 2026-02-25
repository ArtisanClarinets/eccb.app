/**
 * Smart Upload Processor Worker Entry Point
 *
 * This module creates and manages the BullMQ worker for the main smart upload pipeline.
 */

import { Job } from 'bullmq';
import { createWorker } from '@/lib/jobs/queue';
import { processSmartUpload } from './smart-upload-processor';
import { logger } from '@/lib/logger';

// =============================================================================
// Worker Instance
// =============================================================================

let smartUploadProcessorWorker: ReturnType<typeof createWorker> | null = null;

// =============================================================================
// Worker Management
// =============================================================================

/**
 * Start the smart upload processor worker
 */
export function startSmartUploadProcessorWorker(): void {
  const config = {
    priority: 5,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    concurrency: 2,
  };

  smartUploadProcessorWorker = createWorker({
    queueName: 'SMART_UPLOAD',
    concurrency: config.concurrency,
    processor: async (job: Job) => {
      if (job.name === 'smartupload.process') {
        await processSmartUpload(job);
      } else {
        throw new Error(`Unknown job type: ${job.name}`);
      }
    },
  });

  logger.info('Smart upload processor worker started', { concurrency: config.concurrency });
}

/**
 * Stop the smart upload processor worker
 */
export async function stopSmartUploadProcessorWorker(): Promise<void> {
  if (smartUploadProcessorWorker) {
    await smartUploadProcessorWorker.close();
    smartUploadProcessorWorker = null;
    logger.info('Smart upload processor worker stopped');
  }
}

/**
 * Check if smart upload processor worker is running
 */
export function isSmartUploadProcessorWorkerRunning(): boolean {
  return smartUploadProcessorWorker !== null;
}
