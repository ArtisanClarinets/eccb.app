/**
 * Performance Logging Utilities
 * 
 * Features:
 * - Track slow operations (>1s)
 * - Track database query times
 * - Track API response times
 * - Log warnings for slow operations
 */

import { logger, type LogContext } from '@/lib/logger';

// Thresholds in milliseconds
const SLOW_OPERATION_THRESHOLD = 1000; // 1 second
const SLOW_DB_QUERY_THRESHOLD = 500; // 500ms
const SLOW_API_THRESHOLD = 2000; // 2 seconds

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  threshold: number;
  isSlow: boolean;
  timestamp: string;
  context?: LogContext;
}

/**
 * Performance timer for tracking operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private operation: string;
  private context?: LogContext;
  private threshold: number;

  constructor(operation: string, context?: LogContext, threshold: number = SLOW_OPERATION_THRESHOLD) {
    this.startTime = Date.now();
    this.operation = operation;
    this.context = context;
    this.threshold = threshold;
  }

  /**
   * End the timer and log the result
   */
  end(additionalContext?: LogContext): PerformanceMetrics {
    const duration = Date.now() - this.startTime;
    const isSlow = duration > this.threshold;
    const metrics: PerformanceMetrics = {
      operation: this.operation,
      duration,
      threshold: this.threshold,
      isSlow,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...additionalContext },
    };

    const context = {
      ...metrics.context,
      operation: this.operation,
      duration,
      durationMs: duration,
      threshold: this.threshold,
    };

    if (isSlow) {
      logger.warn(`Slow operation detected: ${this.operation}`, context);
    } else {
      logger.debug(`Operation completed: ${this.operation}`, context);
    }

    return metrics;
  }

  /**
   * Get elapsed time without ending the timer
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if operation is currently slow (without ending)
   */
  isSlow(): boolean {
    return this.elapsed() > this.threshold;
  }
}

/**
 * Track database query performance
 */
export function trackDbQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  context?: LogContext
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const timer = new PerformanceTimer(`db:${queryName}`, context, SLOW_DB_QUERY_THRESHOLD);
  
  return queryFn()
    .then((result) => ({
      result,
      metrics: timer.end(),
    }))
    .catch((error) => {
      timer.end({ error: true });
      throw error;
    });
}

/**
 * Track API call performance
 */
export function trackApiCall<T>(
  apiName: string,
  apiFn: () => Promise<T>,
  context?: LogContext
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const timer = new PerformanceTimer(`api:${apiName}`, context, SLOW_API_THRESHOLD);
  
  return apiFn()
    .then((result) => ({
      result,
      metrics: timer.end(),
    }))
    .catch((error) => {
      timer.end({ error: true });
      throw error;
    });
}

/**
 * Track any async operation
 */
export function trackOperation<T>(
  operationName: string,
  operationFn: () => Promise<T>,
  context?: LogContext,
  threshold?: number
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const timer = new PerformanceTimer(operationName, context, threshold);
  
  return operationFn()
    .then((result) => ({
      result,
      metrics: timer.end(),
    }))
    .catch((error) => {
      timer.end({ error: true });
      throw error;
    });
}

/**
 * Create a performance timer for manual tracking
 */
export function startTimer(
  operation: string,
  context?: LogContext,
  threshold?: number
): PerformanceTimer {
  return new PerformanceTimer(operation, context, threshold);
}

/**
 * Log performance metrics summary
 */
export function logPerformanceSummary(metrics: PerformanceMetrics[]): void {
  const slowOperations = metrics.filter((m) => m.isSlow);
  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
  
  logger.info('Performance summary', {
    totalOperations: metrics.length,
    slowOperations: slowOperations.length,
    totalDuration,
    totalDurationMs: totalDuration,
    averageDuration: Math.round(totalDuration / metrics.length),
  });
}

/**
 * Performance thresholds constants
 */
export const THRESHOLDS = {
  SLOW_OPERATION: SLOW_OPERATION_THRESHOLD,
  SLOW_DB_QUERY: SLOW_DB_QUERY_THRESHOLD,
  SLOW_API: SLOW_API_THRESHOLD,
} as const;

/**
 * Decorator for tracking method performance (for class methods)
 */
export function TrackPerformance(operationName?: string, threshold?: number) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: unknown[]) => Promise<unknown>>
  ) {
    const originalMethod = descriptor.value;
    const name = operationName || propertyKey;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const timer = new PerformanceTimer(name, undefined, threshold);
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return await originalMethod.apply(this, args);
      } finally {
        timer.end();
      }
    };

    return descriptor;
  };
}

// Export default object for convenience
export default {
  startTimer,
  trackDbQuery,
  trackApiCall,
  trackOperation,
  logPerformanceSummary,
  THRESHOLDS,
  PerformanceTimer,
};
