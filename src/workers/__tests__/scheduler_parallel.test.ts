import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkEventReminders } from '../scheduler';
import { addJob } from '@/lib/jobs/queue';
import { prisma } from '@/lib/db';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/jobs/queue', () => ({
  addJob: vi.fn(),
  createWorker: vi.fn(),
  QUEUE_NAMES: {
    SCHEDULED: 'eccb:scheduled',
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Scheduler Parallel Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should schedule event reminders in parallel', async () => {
    // Setup 3 events
    const mockEvents = [
      { id: '1', title: 'Event 1', startTime: new Date() },
      { id: '2', title: 'Event 2', startTime: new Date() },
      { id: '3', title: 'Event 3', startTime: new Date() },
    ];

    // Mock db to return these events for 24h check, and empty for 1h check
    (prisma.event.findMany as any)
      .mockResolvedValueOnce(mockEvents)
      .mockResolvedValueOnce([]);

    // Mock addJob to take 100ms each
    (addJob as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { id: 'job-id' };
    });

    const startTime = Date.now();
    await checkEventReminders();
    const endTime = Date.now();
    const duration = endTime - startTime;

    // If sequential: 3 * 100ms = 300ms + overhead
    // If parallel: ~100ms + overhead
    // We assert duration is less than 200ms to verify parallelism
    // Note: Vitest environment might be slow, so 200ms is a reasonable threshold for 3 items
    // but if it's sequential it would be > 300ms.

    expect(duration).toBeLessThan(250);
    expect(addJob).toHaveBeenCalledTimes(3);
  });
});
