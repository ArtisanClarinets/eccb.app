import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceTimer, THRESHOLDS } from '../performance';
import { logger } from '@/lib/logger';

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PerformanceTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default threshold', () => {
      const timer = new PerformanceTimer('test-op');
      // The threshold is not publicly exposed, but we can verify it via isSlow
      expect(timer.isSlow()).toBe(false);
      vi.advanceTimersByTime(THRESHOLDS.SLOW_OPERATION + 1);
      expect(timer.isSlow()).toBe(true);
    });

    it('initializes with custom threshold', () => {
      const customThreshold = 500;
      const timer = new PerformanceTimer('test-op', undefined, customThreshold);

      vi.advanceTimersByTime(customThreshold - 1);
      expect(timer.isSlow()).toBe(false);

      vi.advanceTimersByTime(2);
      expect(timer.isSlow()).toBe(true);
    });
  });

  describe('elapsed', () => {
    it('returns the elapsed time correctly', () => {
      const timer = new PerformanceTimer('test-op');

      expect(timer.elapsed()).toBe(0);

      vi.advanceTimersByTime(150);
      expect(timer.elapsed()).toBe(150);

      vi.advanceTimersByTime(350);
      expect(timer.elapsed()).toBe(500);
    });
  });

  describe('isSlow', () => {
    it('returns false when elapsed time is below threshold', () => {
      const timer = new PerformanceTimer('test-op', undefined, 100);

      vi.advanceTimersByTime(50);
      expect(timer.isSlow()).toBe(false);
    });

    it('returns true when elapsed time exceeds threshold', () => {
      const timer = new PerformanceTimer('test-op', undefined, 100);

      vi.advanceTimersByTime(150);
      expect(timer.isSlow()).toBe(true);
    });
  });

  describe('end', () => {
    it('returns correct metrics for fast operation', () => {
      const timer = new PerformanceTimer('test-op', { initial: 'context' }, 1000);

      vi.advanceTimersByTime(200);

      const metrics = timer.end({ additional: 'data' });

      expect(metrics).toEqual({
        operation: 'test-op',
        duration: 200,
        threshold: 1000,
        isSlow: false,
        timestamp: expect.any(String),
        context: { initial: 'context', additional: 'data' },
      });

      // Should log debug for fast operations
      expect(logger.debug).toHaveBeenCalledWith(
        'Operation completed: test-op',
        expect.objectContaining({
          initial: 'context',
          additional: 'data',
          operation: 'test-op',
          duration: 200,
          durationMs: 200,
          threshold: 1000,
        })
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('returns correct metrics for slow operation', () => {
      const timer = new PerformanceTimer('test-op', { user: '123' }, 1000);

      vi.advanceTimersByTime(1500);

      const metrics = timer.end();

      expect(metrics).toEqual({
        operation: 'test-op',
        duration: 1500,
        threshold: 1000,
        isSlow: true,
        timestamp: expect.any(String),
        context: { user: '123' },
      });

      // Should log warn for slow operations
      expect(logger.warn).toHaveBeenCalledWith(
        'Slow operation detected: test-op',
        expect.objectContaining({
          user: '123',
          operation: 'test-op',
          duration: 1500,
          durationMs: 1500,
          threshold: 1000,
        })
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });
});
