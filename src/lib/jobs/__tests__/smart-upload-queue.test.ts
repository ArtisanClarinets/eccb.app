import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { initializeQueues, closeQueues } from '../queue';
import { queueSmartUploadProcess, queueSmartUploadSecondPass } from '../smart-upload';
import { QUEUE_NAMES } from '../definitions';

// Mock Redis and BullMQ
vi.mock('ioredis', () => {
  class MockRedis {
    quit = vi.fn().mockResolvedValue(undefined);
    constructor() {}
  }
  return { default: MockRedis };
});

vi.mock('bullmq', () => {
  class MockQueue {
    add = vi.fn().mockImplementation((name, data, opts) => {
      return Promise.resolve({
        id: `job-${Date.now()}`,
        name,
        data,
        opts,
        queueName: 'eccb:smart-upload',
      } as unknown as Job);
    });
    getJobs = vi.fn().mockResolvedValue([]);
    getJob = vi.fn().mockResolvedValue(null);
    getWaitingCount = vi.fn().mockResolvedValue(0);
    getActiveCount = vi.fn().mockResolvedValue(0);
    getCompletedCount = vi.fn().mockResolvedValue(0);
    getFailedCount = vi.fn().mockResolvedValue(0);
    getDelayedCount = vi.fn().mockResolvedValue(0);
    getFailed = vi.fn().mockResolvedValue([]);
    close = vi.fn().mockResolvedValue(undefined);
    drain = vi.fn().mockResolvedValue(undefined);
    clean = vi.fn().mockResolvedValue(undefined);
  }

  class MockWorker {
    on = vi.fn().mockReturnThis();
    close = vi.fn().mockResolvedValue(undefined);
  }

  class MockQueueEvents {
    close = vi.fn().mockResolvedValue(undefined);
  }

  class MockJob {
    id?: string;
    name?: string;
    data?: unknown;
    opts?: unknown;
    queueName?: string;
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueEvents: MockQueueEvents,
    Job: MockJob,
  };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
  },
}));

describe('Smart Upload Queue', () => {
  beforeAll(async () => {
    // Initialize queues with mocked BullMQ
    initializeQueues();
  });

  afterAll(async () => {
    await closeQueues();
  });

  describe('queueSmartUploadProcess', () => {
    it('should queue process job with correct data', async () => {
      const job = await queueSmartUploadProcess('session-123', 'file-456');

      expect(job.id).toBeDefined();
      expect(job.data).toEqual({
        sessionId: 'session-123',
        fileId: 'file-456',
      });
      expect(job.name).toBe('smartupload.process');
    });

    it('should apply correct job options for process job', async () => {
      const job = await queueSmartUploadProcess('session-123', 'file-456');

      expect(job.opts).toMatchObject({
        priority: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    });
  });

  describe('queueSmartUploadSecondPass', () => {
    it('should queue second-pass job with correct data', async () => {
      const job = await queueSmartUploadSecondPass('session-789');

      expect(job.id).toBeDefined();
      expect(job.data).toEqual({
        sessionId: 'session-789',
      });
      expect(job.name).toBe('smartupload.secondPass');
    });

    it('should apply higher priority for second-pass jobs', async () => {
      const processJob = await queueSmartUploadProcess('low-priority', 'file-1');
      const secondPassJob = await queueSmartUploadSecondPass('high-priority');

      // Second pass should have higher priority (10 vs 5)
      expect(secondPassJob.opts).toMatchObject({ priority: 10 });
      expect(processJob.opts).toMatchObject({ priority: 5 });
    });

    it('should apply correct job options for second-pass job', async () => {
      const job = await queueSmartUploadSecondPass('session-789');

      expect(job.opts).toMatchObject({
        priority: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    });
  });

  describe('Queue Configuration', () => {
    it('should use correct queue name', () => {
      expect(QUEUE_NAMES.SMART_UPLOAD).toBe('eccb:smart-upload');
    });

    it('should map smartupload.secondPass to smart upload queue', async () => {
      const { getQueueNameForJob } = await import('../definitions');
      const queueName = getQueueNameForJob('smartupload.secondPass');
      expect(queueName).toBe(QUEUE_NAMES.SMART_UPLOAD);
    });
  });

  describe('Job Data Types', () => {
    it('should include correct types for process job data', async () => {
      const job = await queueSmartUploadProcess('session-abc', 'file-def');

      expect(job.data).toHaveProperty('sessionId');
      expect(job.data).toHaveProperty('fileId');
      expect(typeof (job.data as Record<string, unknown>).sessionId).toBe('string');
      expect(typeof (job.data as Record<string, unknown>).fileId).toBe('string');
    });

    it('should include correct types for second-pass job data', async () => {
      const job = await queueSmartUploadSecondPass('session-xyz');

      expect(job.data).toHaveProperty('sessionId');
      expect(typeof (job.data as Record<string, unknown>).sessionId).toBe('string');
      expect(Object.keys(job.data as Record<string, unknown>)).toHaveLength(1);
    });
  });
});
