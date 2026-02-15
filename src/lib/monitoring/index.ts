/**
 * Monitoring Service - Unified Interface
 * 
 * Central export for all monitoring utilities including:
 * - Logging (structured, file-based)
 * - Metrics collection
 * - Performance tracking
 * - Error tracking and aggregation
 * - Health checks
 */

// Re-export logger utilities
export {
  logger,
  createLoggerWithContext,
  type Logger,
  type LogLevel,
  type LogContext,
} from '@/lib/logger';

// Re-export error logging utilities
export {
  ApiError,
  ErrorCode,
  errorResponse,
  logError,
  logAndThrow,
  notFoundError,
  assert,
  assertDefined,
  withErrorHandling,
  type ApiErrorResponse,
} from '@/lib/error-logging';

// Re-export file logger
export {
  fileLogger,
  combinedLogger,
  type FileLogger,
} from '@/lib/file-logger';

// Re-export performance utilities
export {
  PerformanceTimer,
  startTimer,
  trackDbQuery,
  trackApiCall,
  trackOperation,
  logPerformanceSummary,
  THRESHOLDS,
  type PerformanceMetrics,
} from '@/lib/performance';

// Export metrics collection
export {
  incrementCounter,
  setGauge,
  recordHistogram,
  recordTimer,
  getCounter,
  getGauge,
  getTimerValues,
  calculateRequestMetrics,
  calculateErrorMetrics,
  calculateDatabaseMetrics,
  calculateCacheMetrics,
  getSystemMetrics,
  trackRequest,
  trackDatabaseQuery,
  trackCacheOperation,
  clearMetrics,
  getAllMetrics,
  type MetricType,
  type MetricValue,
  type RequestMetrics,
  type ErrorMetrics,
  type DatabaseMetrics,
  type CacheMetrics,
  type BusinessMetrics,
  type SystemMetrics,
} from './metrics';

// Import types for the monitoring service
import { logger, type LogContext } from '@/lib/logger';
import { logError as logErrorUtil, ApiError } from '@/lib/error-logging';
import { startTimer, type PerformanceMetrics } from '@/lib/performance';
import {
  trackRequest,
  trackDatabaseQuery,
  trackCacheOperation,
  incrementCounter,
  getAllMetrics,
  type RequestMetrics,
  type ErrorMetrics,
  type DatabaseMetrics,
  type CacheMetrics,
  type SystemMetrics,
} from './metrics';

/**
 * Error context for tracking
 */
export interface ErrorContext {
  userId?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated error entry
 */
export interface AggregatedError {
  fingerprint: string;
  message: string;
  stack?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  contexts: ErrorContext[];
}

// In-memory error aggregation (for development/small scale)
const errorAggregation = new Map<string, AggregatedError>();
const MAX_CONTEXTS_PER_ERROR = 10;

/**
 * Generate a fingerprint for error aggregation
 */
function generateErrorFingerprint(error: Error, context?: ErrorContext): string {
  // Use error message and first line of stack for fingerprinting
  const stackFirstLine = error.stack?.split('\n')[1]?.trim() || '';
  const component = context?.component || '';
  return `${error.name}:${error.message}:${stackFirstLine}:${component}`.slice(0, 200);
}

/**
 * Track an error with context for aggregation
 */
export function trackError(
  error: Error,
  context?: ErrorContext
): AggregatedError {
  const fingerprint = generateErrorFingerprint(error, context);
  const now = new Date().toISOString();
  
  const existing = errorAggregation.get(fingerprint);
  
  if (existing) {
    existing.count++;
    existing.lastSeen = now;
    if (context && existing.contexts.length < MAX_CONTEXTS_PER_ERROR) {
      existing.contexts.push(context);
    }
    return existing;
  }
  
  const aggregated: AggregatedError = {
    fingerprint,
    message: error.message,
    stack: error.stack,
    count: 1,
    firstSeen: now,
    lastSeen: now,
    contexts: context ? [context] : [],
  };
  
  errorAggregation.set(fingerprint, aggregated);
  return aggregated;
}

/**
 * Get aggregated errors
 */
export function getAggregatedErrors(options?: {
  limit?: number;
  since?: Date;
  minCount?: number;
}): AggregatedError[] {
  let errors = Array.from(errorAggregation.values());
  
  if (options?.since) {
    errors = errors.filter((e) => new Date(e.firstSeen) >= options.since!);
  }
  
  if (options?.minCount) {
    errors = errors.filter((e) => e.count >= options.minCount!);
  }
  
  // Sort by count descending
  errors.sort((a, b) => b.count - a.count);
  
  if (options?.limit) {
    errors = errors.slice(0, options.limit);
  }
  
  return errors;
}

/**
 * Clear aggregated errors
 */
export function clearAggregatedErrors(): void {
  errorAggregation.clear();
}

/**
 * Log and track an error with full context
 */
export function logAndTrackError(
  error: Error,
  context?: ErrorContext
): AggregatedError {
  // Log the error
  const logContext: LogContext = {
    userId: context?.userId,
    requestId: context?.requestId,
    endpoint: context?.endpoint,
    method: context?.method,
    component: context?.component,
    action: context?.action,
    ...context?.metadata,
  };
  
  logErrorUtil(error, logContext, context?.requestId);
  
  // Track for aggregation
  const aggregated = trackError(error, context);
  
  // Increment error counters
  incrementCounter('error_total');
  if (error instanceof ApiError) {
    incrementCounter(`error_${error.statusCode}`);
  }
  
  return aggregated;
}

/**
 * Create a monitoring context for a request
 */
export function createRequestContext(options: {
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
}): {
  logger: typeof logger;
  trackError: (error: Error, metadata?: Record<string, unknown>) => AggregatedError;
  trackPerformance: (operation: string) => { end: (metadata?: Record<string, unknown>) => PerformanceMetrics };
  startTimer: () => number;
} {
  const { requestId, userId, endpoint, method } = options;
  const requestLogger = logger.withRequestId(requestId);
  const startTime = Date.now();
  
  return {
    logger: requestLogger,
    
    trackError: (error: Error, metadata?: Record<string, unknown>) => {
      return logAndTrackError(error, {
        requestId,
        userId,
        endpoint,
        method,
        metadata,
      });
    },
    
    trackPerformance: (operation: string) => {
      const timer = startTimer(`${endpoint}:${operation}`);
      return {
        end: (metadata?: Record<string, unknown>) => {
          const metrics = timer.end(metadata);
          void trackRequest(endpoint, method, 200, metrics.duration);
          return metrics;
        },
      };
    },
    
    startTimer: () => startTime,
  };
}

/**
 * Monitoring service class for dependency injection
 */
export class MonitoringService {
  private prefix: string;
  
  constructor(prefix: string = 'app') {
    this.prefix = prefix;
  }
  
  log = logger;
  
  incrementCounter(name: string, value?: number): Promise<void> {
    return incrementCounter(`${this.prefix}:${name}`, value);
  }
  
  trackRequest(endpoint: string, method: string, statusCode: number, durationMs: number): Promise<void> {
    return trackRequest(`${this.prefix}:${endpoint}`, method, statusCode, durationMs);
  }
  
  trackDatabaseQuery(operation: string, table: string, durationMs: number, success: boolean): Promise<void> {
    return trackDatabaseQuery(operation, table, durationMs, success);
  }
  
  trackCacheOperation(operation: 'hit' | 'miss' | 'eviction'): Promise<void> {
    return trackCacheOperation(operation);
  }
  
  trackError(error: Error, context?: ErrorContext): AggregatedError {
    return logAndTrackError(error, { ...context, metadata: { ...context?.metadata, service: this.prefix } });
  }
  
  async getMetrics(): Promise<{
    requests: RequestMetrics;
    errors: ErrorMetrics;
    database: DatabaseMetrics;
    cache: CacheMetrics;
    system: SystemMetrics;
  }> {
    return getAllMetrics();
  }
}

// Default monitoring service instance
export const monitoring = new MonitoringService();

// Export default
export default monitoring;
