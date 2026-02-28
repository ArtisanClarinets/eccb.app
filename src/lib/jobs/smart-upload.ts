/**
 * Smart Upload Job Queue Functions
 *
 * This file provides job queueing functions for the Smart Upload pipeline.
 * - Main processing job (render → vision → split → verify)
 * - Second pass verification job
 */

import { Job } from 'bullmq';
import { getQueue, initializeQueues } from './queue';
import { logger } from '@/lib/logger';

// =============================================================================
// Job Data Interfaces
// =============================================================================

interface SmartUploadProcessData {
  sessionId: string;
  fileId: string;
}

interface SmartUploadSecondPassData {
  sessionId: string;
}

interface SmartUploadAutoCommitData {
  sessionId: string;
}

// =============================================================================
// Queue Names and Job Names
// =============================================================================

export const SMART_UPLOAD_JOB_NAMES = {
  PROCESS: 'smartupload.process',
  SECOND_PASS: 'smartupload.secondPass',
  AUTO_COMMIT: 'smartupload.autoCommit',
} as const;

// =============================================================================
// Job Queueing Functions
// =============================================================================

/**
 * Queue a smart upload for main processing.
 * This handles the full pipeline: render → vision → split → verify
 *
 * @param sessionId - The smart upload session ID
 * @param fileId - The file record ID
 * @returns The created job
 */
export async function queueSmartUploadProcess(
  sessionId: string,
  fileId: string
): Promise<Job> {
  initializeQueues();
  const queue = getQueue('SMART_UPLOAD');

  if (!queue) {
    throw new Error('Smart upload queue not initialized');
  }

  const job = await queue.add(
    SMART_UPLOAD_JOB_NAMES.PROCESS,
    { sessionId, fileId } as SmartUploadProcessData,
    {
      priority: 5,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: false,
    }
  );

  logger.info('Smart upload process job queued', {
    jobId: job.id,
    sessionId,
    fileId,
  });

  return job;
}

/**
 * Queue a smart upload for second pass verification.
 * This runs a secondary LLM verification to improve confidence.
 *
 * @param sessionId - The smart upload session ID
 * @returns The created job
 */
export async function queueSmartUploadSecondPass(
  sessionId: string
): Promise<Job> {
  initializeQueues();
  const queue = getQueue('SMART_UPLOAD');

  if (!queue) {
    throw new Error('Smart upload queue not initialized');
  }

  const job = await queue.add(
    SMART_UPLOAD_JOB_NAMES.SECOND_PASS,
    { sessionId } as SmartUploadSecondPassData,
    {
      priority: 10, // Higher priority than initial processing
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: false,
    }
  );

  logger.info('Smart upload second pass job queued', {
    jobId: job.id,
    sessionId,
  });

  return job;
}

/**
 * Queue a smart upload for autonomous auto-commit.
 * Only triggered when confidence >= autonomousApprovalThreshold.
 *
 * @param sessionId - The smart upload session ID
 * @returns The created job
 */
export async function queueSmartUploadAutoCommit(sessionId: string): Promise<Job> {
  initializeQueues();
  const queue = getQueue('SMART_UPLOAD');

  if (!queue) {
    throw new Error('Smart upload queue not initialized');
  }

  const job = await queue.add(
    SMART_UPLOAD_JOB_NAMES.AUTO_COMMIT,
    { sessionId } as SmartUploadAutoCommitData,
    {
      priority: 3, // Higher priority than second pass
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: false,
    }
  );

  logger.info('Smart upload auto-commit job queued', { jobId: job.id, sessionId });
  return job;
}

// =============================================================================
// Job Status Types
// =============================================================================

export interface SmartUploadJobProgress {
  step: SmartUploadStep;
  percent: number;
  message?: string;
  sessionId?: string;
}

export type SmartUploadStep =
  | 'starting'
  | 'downloading'
  | 'rendering'
  | 'analyzing'
  | 'validating'
  | 'splitting'
  | 'saving'
  | 'complete'
  | 'failed'
  | 'queued_for_second_pass'
  | 'auto_committing';

// Re-export types for convenience
export type { SmartUploadProcessData, SmartUploadSecondPassData, SmartUploadAutoCommitData };
