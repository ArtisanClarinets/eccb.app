/**
 * OAuth Metrics for Smart Upload System
 * Emits operational metrics for platform observability and debugging.
 * Integrates with Prometheus, DataDog, and standard logging.
 */

import { SmartUploadErrorCode } from './error-codes';

export interface MetricEvent {
  timestamp: number; // ms since epoch
  sessionId?: string;
  errorCode?: SmartUploadErrorCode;
  errorMessage?: string;
  duration?: number; // ms
  provider?: string;
  model?: string;
  pageCount?: number;
  imageCount?: number;
  confidence?: number;
  success: boolean;
  step: 'vision' | 'verification' | 'header_label' | 'adjudication' | 'ocr' | 'segmentation' | 'split' | 'overall';
  labels?: Record<string, string | number>;
}

interface MetricsCollector {
  recordMetric(event: MetricEvent): void;
  recordError(sessionId: string, errorCode: SmartUploadErrorCode, step: MetricEvent['step'], duration: number): void;
  recordSuccess(sessionId: string, step: MetricEvent['step'], duration: number, metadata?: Record<string, string | number>): void;
  recordLatency(sessionId: string, step: MetricEvent['step'], duration: number): void;
  flush(): Promise<void>;
}

class SmartUploadMetrics implements MetricsCollector {
  private buffer: MetricEvent[] = [];
  private flushInterval = 60000; // 1 minute
  private maxBufferSize = 1000;

  constructor() {
    this.startPeriodicFlush();
  }

  recordMetric(event: MetricEvent): void {
    this.buffer.push(event);

    // Auto-flush if buffer exceeds threshold
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.debug('[METRICS]', event);
    }
  }

  recordError(sessionId: string, errorCode: SmartUploadErrorCode, step: MetricEvent['step'], duration: number): void {
    this.recordMetric({
      timestamp: Date.now(),
      sessionId,
      errorCode,
      step,
      duration,
      success: false,
    });
  }

  recordSuccess(
    sessionId: string,
    step: MetricEvent['step'],
    duration: number,
    metadata?: Record<string, string | number>,
  ): void {
    this.recordMetric({
      timestamp: Date.now(),
      sessionId,
      step,
      duration,
      success: true,
      labels: metadata,
    });
  }

  recordLatency(sessionId: string, step: MetricEvent['step'], duration: number): void {
    // Record latency metrics separately for alerting
    if (duration > 10000) {
      // Log slow operations (>10s)
      console.warn(`[LATENCY_WARNING] Step ${step} exceeded 10s (${duration}ms) for session ${sessionId}`);
    }

    this.recordMetric({
      timestamp: Date.now(),
      sessionId,
      step,
      duration,
      success: true,
      labels: { slow: duration > 10000 ? 1 : 0 },
    });
  }

  private emit(events: MetricEvent[]): void {
    if (events.length === 0) return;

    // Emit to stdout in JSON lines format (picked up by logging infrastructure)
    events.forEach((event) => {
      console.log(
        JSON.stringify({
          level: event.success ? 'INFO' : 'ERROR',
          type: 'SMART_UPLOAD_METRIC',
          ...event,
        }),
      );
    });

    // Platform-specific integrations can be added here
    // Example: sendToDataDog(events)
    // Example: sendToPrometheus(events)
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0, this.buffer.length);
    this.emit(events);
  }

  private startPeriodicFlush(): void {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        void this.flush();
      }, this.flushInterval);
    }
  }
}

// Global singleton instance
let metricsInstance: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector.
 */
export function getMetrics(): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new SmartUploadMetrics();
  }
  return metricsInstance;
}

/**
 * Record a metric event.
 */
export function recordMetric(event: MetricEvent): void {
  getMetrics().recordMetric(event);
}

/**
 * Record an error event.
 */
export function recordMetricError(
  sessionId: string,
  errorCode: SmartUploadErrorCode,
  step: MetricEvent['step'],
  duration: number,
): void {
  getMetrics().recordError(sessionId, errorCode, step, duration);
}

/**
 * Record a successful operation.
 */
export function recordMetricSuccess(
  sessionId: string,
  step: MetricEvent['step'],
  duration: number,
  metadata?: Record<string, string | number>,
): void {
  getMetrics().recordSuccess(sessionId, step, duration, metadata);
}

/**
 * Record latency for monitoring and alerting.
 */
export function recordLatency(sessionId: string, step: MetricEvent['step'], duration: number): void {
  getMetrics().recordLatency(sessionId, step, duration);
}

/**
 * Utility: Create timing wrapper for async functions
 */
export async function withMetrics<T>(
  fn: () => Promise<T>,
  {
    sessionId,
    step,
    onSuccess,
    onError,
  }: {
    sessionId: string;
    step: MetricEvent['step'];
    onSuccess?: (duration: number) => void;
    onError?: (duration: number, error: unknown) => void;
  },
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    recordMetricSuccess(sessionId, step, duration);
    onSuccess?.(duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    // Extract error code if available
    const errorCode = error instanceof Error && 'code' in error ? (error.code as SmartUploadErrorCode) : ('UNKNOWN' as SmartUploadErrorCode);
    recordMetricError(sessionId, errorCode, step, duration);
    onError?.(duration, error);
    throw error;
  }
}
