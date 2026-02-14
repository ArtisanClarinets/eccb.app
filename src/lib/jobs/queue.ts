/**
 * Redis-backed Job Queue System for ECCB Platform
 * 
 * This module provides a BullMQ-based job queue with:
 * - Multiple named queues for different job types
 * - Job status tracking
 * - Dead letter queue for failed jobs
 * - Graceful shutdown support
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { env } from '@/lib/env';
import {
  JobType,
  JobTypeNameMap,
  QUEUE_NAMES,
  getJobOptions,
  getQueueNameForJob,
  getConcurrencyForJob,
  type EmailSendJobData,
  type EmailBulkJobData,
} from './definitions';
import { logger } from '@/lib/logger';

// ============================================================================
// Redis Connection
// ============================================================================

const createRedisConnection = (): Redis => {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });
};

// Global Redis connection for queues
let redisConnection: Redis | null = null;

function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
}

// ============================================================================
// Queue Instances
// ============================================================================

interface QueueInstances {
  email: Queue | null;
  notification: Queue | null;
  scheduled: Queue | null;
  cleanup: Queue | null;
  deadLetter: Queue | null;
}

const queues: QueueInstances = {
  email: null,
  notification: null,
  scheduled: null,
  cleanup: null,
  deadLetter: null,
};

const queueEvents: Map<string, QueueEvents> = new Map();

/**
 * Initialize all queues
 */
export function initializeQueues(): void {
  const connection = getRedisConnection();

  // Email queue
  queues.email = new Queue(QUEUE_NAMES.EMAIL, { connection });
  queueEvents.set(QUEUE_NAMES.EMAIL, new QueueEvents(QUEUE_NAMES.EMAIL, { connection }));

  // Notification queue
  queues.notification = new Queue(QUEUE_NAMES.NOTIFICATION, { connection });
  queueEvents.set(QUEUE_NAMES.NOTIFICATION, new QueueEvents(QUEUE_NAMES.NOTIFICATION, { connection }));

  // Scheduled queue
  queues.scheduled = new Queue(QUEUE_NAMES.SCHEDULED, { connection });
  queueEvents.set(QUEUE_NAMES.SCHEDULED, new QueueEvents(QUEUE_NAMES.SCHEDULED, { connection }));

  // Cleanup queue
  queues.cleanup = new Queue(QUEUE_NAMES.CLEANUP, { connection });
  queueEvents.set(QUEUE_NAMES.CLEANUP, new QueueEvents(QUEUE_NAMES.CLEANUP, { connection }));

  // Dead letter queue
  queues.deadLetter = new Queue(QUEUE_NAMES.DEAD_LETTER, { connection });
  queueEvents.set(QUEUE_NAMES.DEAD_LETTER, new QueueEvents(QUEUE_NAMES.DEAD_LETTER, { connection }));

  logger.info('All job queues initialized');
}

/**
 * Get a queue by name
 */
export function getQueue(name: keyof typeof QUEUE_NAMES): Queue | null {
  switch (name) {
    case 'EMAIL':
      return queues.email;
    case 'NOTIFICATION':
      return queues.notification;
    case 'SCHEDULED':
      return queues.scheduled;
    case 'CLEANUP':
      return queues.cleanup;
    case 'DEAD_LETTER':
      return queues.deadLetter;
    default:
      return null;
  }
}

/**
 * Get queue events by name
 */
export function getQueueEvents(name: keyof typeof QUEUE_NAMES): QueueEvents | undefined {
  const queueName = QUEUE_NAMES[name];
  return queueEvents.get(queueName);
}

// ============================================================================
// Job Queueing Functions
// ============================================================================

/**
 * Add a job to the appropriate queue
 */
export async function addJob<T extends JobType>(
  jobType: T,
  data: JobTypeNameMap[T],
  options?: { delay?: number; jobId?: string }
): Promise<Job> {
  const queueName = getQueueNameForJob(jobType);
  const queue = getQueue(queueName === QUEUE_NAMES.EMAIL ? 'EMAIL' :
    queueName === QUEUE_NAMES.NOTIFICATION ? 'NOTIFICATION' :
    queueName === QUEUE_NAMES.SCHEDULED ? 'SCHEDULED' :
    queueName === QUEUE_NAMES.CLEANUP ? 'CLEANUP' : 'DEAD_LETTER');

  if (!queue) {
    throw new Error(`Queue not initialized: ${queueName}`);
  }

  const jobOptions = {
    ...getJobOptions(jobType),
    ...options,
  };

  const job = await queue.add(jobType, data, jobOptions);
  logger.debug(`Job added: ${jobType}`, { jobId: job.id, queue: queueName });

  return job;
}

/**
 * Add an email job
 */
export async function queueEmail(data: EmailSendJobData, options?: { delay?: number }): Promise<Job> {
  return addJob('email.send', data, options);
}

/**
 * Add a bulk email job
 */
export async function queueBulkEmail(data: EmailBulkJobData, options?: { delay?: number }): Promise<Job> {
  return addJob('email.bulk', data, options);
}

// ============================================================================
// Job Status Functions
// ============================================================================

export interface JobStatus {
  id: string;
  name: string;
  state: 'completed' | 'failed' | 'delayed' | 'active' | 'waiting' | 'unknown';
  progress: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  returnValue?: unknown;
  data: unknown;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(queueName: keyof typeof QUEUE_NAMES, jobId: string): Promise<JobStatus | null> {
  const queue = getQueue(queueName);
  if (!queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();

  return {
    id: job.id ?? 'unknown',
    name: job.name,
    state: state as JobStatus['state'],
    progress: typeof job.progress === 'number' ? job.progress : 0,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    returnValue: job.returnvalue,
    data: job.data,
  };
}

/**
 * Get queue statistics
 */
export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueStats(queueName: keyof typeof QUEUE_NAMES): Promise<QueueStats | null> {
  const queue = getQueue(queueName);
  if (!queue) return null;

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    name: QUEUE_NAMES[queueName],
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats(): Promise<QueueStats[]> {
  const stats: QueueStats[] = [];

  for (const key of Object.keys(QUEUE_NAMES) as (keyof typeof QUEUE_NAMES)[]) {
    const stat = await getQueueStats(key);
    if (stat) stats.push(stat);
  }

  return stats;
}

// ============================================================================
// Dead Letter Queue Functions
// ============================================================================

/**
 * Move a failed job to the dead letter queue
 */
export async function moveToDeadLetterQueue(job: Job, reason: string): Promise<void> {
  const dlq = queues.deadLetter;
  if (!dlq) {
    logger.error('Dead letter queue not initialized');
    return;
  }

  await dlq.add('dead-letter', {
    originalJobId: job.id,
    originalQueue: job.queueName,
    originalName: job.name,
    originalData: job.data,
    failedReason: reason,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
  }, {
    removeOnComplete: 1000,
    removeOnFail: false,
  });

  logger.warn(`Job moved to dead letter queue`, {
    jobId: job.id,
    originalQueue: job.queueName,
    reason,
  });
}

/**
 * Get failed jobs from dead letter queue
 */
export async function getDeadLetterJobs(count: number = 50): Promise<Job[]> {
  const dlq = queues.deadLetter;
  if (!dlq) return [];

  return dlq.getFailed(0, count - 1);
}

/**
 * Retry a job from the dead letter queue
 */
export async function retryDeadLetterJob(dlqJobId: string): Promise<boolean> {
  const dlq = queues.deadLetter;
  if (!dlq) return false;

  const job = await dlq.getJob(dlqJobId);
  if (!job) return false;

  const data = job.data as {
    originalQueue: string;
    originalName: string;
    originalData: unknown;
  };

  // Find the original queue
  const queueKey = Object.entries(QUEUE_NAMES).find(([, v]) => v === data.originalQueue)?.[0] as keyof typeof QUEUE_NAMES | undefined;
  if (!queueKey) return false;

  const originalQueue = getQueue(queueKey);
  if (!originalQueue) return false;

  // Re-add the job to the original queue
  await originalQueue.add(data.originalName, data.originalData, getJobOptions(data.originalName as JobType));

  // Remove from DLQ
  await job.remove();

  logger.info(`Retried job from dead letter queue`, { dlqJobId, originalQueue: data.originalQueue });
  return true;
}

// ============================================================================
// Worker Creation Helper
// ============================================================================

export type JobProcessor<T = unknown> = (job: Job<T>) => Promise<void>;

interface WorkerOptions {
  queueName: keyof typeof QUEUE_NAMES;
  concurrency?: number;
  processor: JobProcessor;
}

/**
 * Create a worker for a queue
 */
export function createWorker(options: WorkerOptions): Worker {
  const { queueName, concurrency = 1, processor } = options;
  const connection = getRedisConnection();

  const worker = new Worker(QUEUE_NAMES[queueName], processor, {
    connection,
    concurrency,
  });

  // Event handlers
  worker.on('completed', (job: Job) => {
    logger.debug(`Job completed`, { jobId: job.id, name: job.name });
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) {
      logger.error(`Job failed`, {
        jobId: job.id,
        name: job.name,
        error: error.message,
        attemptsMade: job.attemptsMade,
      });

      // Move to DLQ if all retries exhausted
      if (job.attemptsMade >= (job.opts.attempts || 1)) {
        moveToDeadLetterQueue(job, error.message).catch((err) => {
          logger.error('Failed to move job to DLQ', { error: err });
        });
      }
    }
  });

  worker.on('error', (error: Error) => {
    logger.error('Worker error', { error: error.message });
  });

  return worker;
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Close all queues and connections
 */
export async function closeQueues(): Promise<void> {
  logger.info('Closing all queues...');

  // Close queue events
  for (const [name, events] of queueEvents) {
    await events.close();
    logger.debug(`Queue events closed: ${name}`);
  }
  queueEvents.clear();

  // Close queues
  for (const [name, queue] of Object.entries(queues)) {
    if (queue) {
      await queue.close();
      logger.debug(`Queue closed: ${name}`);
    }
  }

  // Close Redis connection
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }

  logger.info('All queues closed');
}

/**
 * Clear all jobs from all queues (use with caution!)
 */
export async function clearAllQueues(): Promise<void> {
  for (const queue of Object.values(queues)) {
    if (queue) {
      await queue.drain();
      await queue.clean(0, 1000, 'completed');
      await queue.clean(0, 1000, 'failed');
      await queue.clean(0, 1000, 'delayed');
    }
  }
  logger.warn('All queues cleared');
}

// ============================================================================
// Export Queue Names for External Use
// ============================================================================

export { QUEUE_NAMES } from './definitions';
