/**
 * Smart Upload Processor Worker Entry Point
 *
 * This module creates and manages the BullMQ worker for the main smart upload pipeline.
 */

import { Job } from 'bullmq';
import { createWorker } from '@/lib/jobs/queue';
import { processSmartUpload } from './smart-upload-processor';
import { commitSmartUploadSessionToLibrary } from '@/lib/smart-upload/commit';
import { SMART_UPLOAD_JOB_NAMES } from '@/lib/jobs/smart-upload';
import { loadSmartUploadRuntimeConfig } from '@/lib/llm/config-loader';
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
export async function startSmartUploadProcessorWorker(): Promise<void> {
  // Load concurrency from DB config so operators can tune it without redeploying
  const llmCfg = await loadSmartUploadRuntimeConfig().catch(() => null);
  const concurrency = llmCfg?.maxConcurrent ?? 2;

  const config = {
    priority: 5,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    concurrency,
  };

  smartUploadProcessorWorker = createWorker({
    queueName: 'SMART_UPLOAD',
    concurrency: config.concurrency,
    processor: async (job: Job) => {
      if (job.name === SMART_UPLOAD_JOB_NAMES.PROCESS) {
        await processSmartUpload(job);
      } else if (job.name === SMART_UPLOAD_JOB_NAMES.AUTO_COMMIT) {
        const { sessionId } = job.data as { sessionId: string };
        logger.info('Running auto-commit for session', { sessionId, jobId: job.id });
        await commitSmartUploadSessionToLibrary(sessionId, {}, 'system:auto-commit');
        logger.info('Auto-commit complete', { sessionId });
      } else {
        // This worker only handles PROCESS and AUTO_COMMIT; secondPass is
        // handled by smart-upload-worker. Skip gracefully.
        logger.debug('smart-upload-processor-worker: skipping unowned job', { name: job.name, jobId: job.id });
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
