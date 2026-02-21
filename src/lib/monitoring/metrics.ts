/**
 * Metrics Collection System
 * 
 * Features:
 * - Request duration metrics
 * - Error rate tracking
 * - Database query performance
 * - Cache hit/miss rates
 * - Custom business metrics
 * - In-memory storage with optional Redis persistence
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

// Metrics configuration
const METRICS_PREFIX = 'eccb:metrics';
const METRICS_TTL = 3600; // 1 hour in seconds
const WINDOW_SIZE = 300; // 5 minutes in seconds for rate calculations

// Metric types
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

export interface MetricValue {
  name: string;
  type: MetricType;
  value: number;
  timestamp: string;
  tags?: Record<string, string>;
}

export interface RequestMetrics {
  total: number;
  successful: number;
  failed: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

export interface ErrorMetrics {
  total: number;
  byCode: Record<string, number>;
  byEndpoint: Record<string, number>;
  rate: number;
}

export interface DatabaseMetrics {
  totalQueries: number;
  avgDuration: number;
  slowQueries: number;
  failedQueries: number;
  byOperation: Record<string, { count: number; avgDuration: number }>;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  size: number;
}

export interface BusinessMetrics {
  totalMembers: number;
  activeMembers: number;
  upcomingEvents: number;
  musicCatalogSize: number;
  pendingAnnouncements: number;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  nodeVersion: string;
  platform: string;
}

// In-memory metrics store for development/fallback
class InMemoryMetricsStore {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timers: Map<string, number[]> = new Map();
  private timestamps: Map<string, string[]> = new Map();

  incrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
    this.recordTimestamp(name);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
    this.recordTimestamp(name);
  }

  recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) || [];
    values.push(value);
    // Keep last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    this.histograms.set(name, values);
    this.recordTimestamp(name);
  }

  recordTimer(name: string, durationMs: number): void {
    const values = this.timers.get(name) || [];
    values.push(durationMs);
    // Keep last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    this.timers.set(name, values);
    this.recordTimestamp(name);
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getGauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  getHistogramValues(name: string): number[] {
    return this.histograms.get(name) || [];
  }

  getTimerValues(name: string): number[] {
    return this.timers.get(name) || [];
  }

  getRecentTimestamps(name: string, since: Date): string[] {
    const timestamps = this.timestamps.get(name) || [];
    return timestamps.filter((ts) => new Date(ts) >= since);
  }

  private recordTimestamp(name: string): void {
    const timestamps = this.timestamps.get(name) || [];
    timestamps.push(new Date().toISOString());
    // Keep last 1000 timestamps
    if (timestamps.length > 1000) {
      timestamps.shift();
    }
    this.timestamps.set(name, timestamps);
  }

  clear(name?: string): void {
    if (name) {
      this.counters.delete(name);
      this.gauges.delete(name);
      this.histograms.delete(name);
      this.timers.delete(name);
      this.timestamps.delete(name);
    } else {
      this.counters.clear();
      this.gauges.clear();
      this.histograms.clear();
      this.timers.clear();
      this.timestamps.clear();
    }
  }

  getAllCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  getAllGauges(): Record<string, number> {
    return Object.fromEntries(this.gauges);
  }
}

// Singleton store
const memoryStore = new InMemoryMetricsStore();

// Check if Redis is available
async function isRedisAvailable(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Increment a counter metric
 */
export async function incrementCounter(
  name: string,
  value = 1,
  tags?: Record<string, string>
): Promise<void> {
  const key = `${METRICS_PREFIX}:counter:${name}`;
  
  // Always update memory store
  memoryStore.incrementCounter(name, value);
  
  // Try to update Redis if available
  try {
    if (await isRedisAvailable()) {
      await redis.incrby(key, value);
      await redis.expire(key, METRICS_TTL);
    }
  } catch (error) {
    logger.debug('Failed to increment counter in Redis', { name, error: String(error) });
  }
}

/**
 * Set a gauge metric
 */
export async function setGauge(
  name: string,
  value: number,
  tags?: Record<string, string>
): Promise<void> {
  const key = `${METRICS_PREFIX}:gauge:${name}`;
  
  // Always update memory store
  memoryStore.setGauge(name, value);
  
  // Try to update Redis if available
  try {
    if (await isRedisAvailable()) {
      await redis.set(key, value.toString(), 'EX', METRICS_TTL);
    }
  } catch (error) {
    logger.debug('Failed to set gauge in Redis', { name, error: String(error) });
  }
}

/**
 * Record a histogram value
 */
export async function recordHistogram(
  name: string,
  value: number,
  tags?: Record<string, string>
): Promise<void> {
  const key = `${METRICS_PREFIX}:histogram:${name}`;
  
  // Always update memory store
  memoryStore.recordHistogram(name, value);
  
  // Try to update Redis if available
  try {
    if (await isRedisAvailable()) {
      await redis.rpush(key, value.toString());
      await redis.ltrim(key, -1000, -1); // Keep last 1000 values
      await redis.expire(key, METRICS_TTL);
    }
  } catch (error) {
    logger.debug('Failed to record histogram in Redis', { name, error: String(error) });
  }
}

/**
 * Record a timer value (in milliseconds)
 */
export async function recordTimer(
  name: string,
  durationMs: number,
  tags?: Record<string, string>
): Promise<void> {
  const key = `${METRICS_PREFIX}:timer:${name}`;
  
  // Always update memory store
  memoryStore.recordTimer(name, durationMs);
  
  // Try to update Redis if available
  try {
    if (await isRedisAvailable()) {
      await redis.rpush(key, durationMs.toString());
      await redis.ltrim(key, -1000, -1); // Keep last 1000 values
      await redis.expire(key, METRICS_TTL);
    }
  } catch (error) {
    logger.debug('Failed to record timer in Redis', { name, error: String(error) });
  }
}

/**
 * Get counter value
 */
export async function getCounter(name: string): Promise<number> {
  // Try Redis first
  try {
    if (await isRedisAvailable()) {
      const key = `${METRICS_PREFIX}:counter:${name}`;
      const value = await redis.get(key);
      if (value !== null) {
        return parseInt(value, 10);
      }
    }
  } catch (error) {
    logger.debug('Failed to get counter from Redis', { name, error: String(error) });
  }
  
  // Fallback to memory store
  return memoryStore.getCounter(name);
}

/**
 * Get gauge value
 */
export async function getGauge(name: string): Promise<number | undefined> {
  // Try Redis first
  try {
    if (await isRedisAvailable()) {
      const key = `${METRICS_PREFIX}:gauge:${name}`;
      const value = await redis.get(key);
      if (value !== null) {
        return parseFloat(value);
      }
    }
  } catch (error) {
    logger.debug('Failed to get gauge from Redis', { name, error: String(error) });
  }
  
  // Fallback to memory store
  return memoryStore.getGauge(name);
}

/**
 * Get timer values for percentile calculations
 */
export async function getTimerValues(name: string): Promise<number[]> {
  // Try Redis first
  try {
    if (await isRedisAvailable()) {
      const key = `${METRICS_PREFIX}:timer:${name}`;
      const values = await redis.lrange(key, 0, -1);
      return values.map((v) => parseFloat(v));
    }
  } catch (error) {
    logger.debug('Failed to get timer values from Redis', { name, error: String(error) });
  }
  
  // Fallback to memory store
  return memoryStore.getTimerValues(name);
}

/**
 * Calculate percentile of a sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Calculate request metrics from timer data
 */
export async function calculateRequestMetrics(): Promise<RequestMetrics> {
  const values = await getTimerValues('request_duration');
  const sorted = [...values].sort((a, b) => a - b);
  
  const total = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  
  // Get success/failure counts
  const successful = await getCounter('request_success');
  const failed = await getCounter('request_error');
  
  return {
    total,
    successful,
    failed,
    avgDuration: total > 0 ? Math.round(sum / total) : 0,
    p50Duration: percentile(sorted, 50),
    p95Duration: percentile(sorted, 95),
    p99Duration: percentile(sorted, 99),
  };
}

/**
 * Calculate error metrics
 */
export async function calculateErrorMetrics(): Promise<ErrorMetrics> {
  const total = await getCounter('error_total');
  const windowStart = new Date(Date.now() - WINDOW_SIZE * 1000);
  
  // Get error counts by code
  const errorCodes = ['400', '401', '403', '404', '422', '429', '500', '502', '503'];
  const byCode: Record<string, number> = {};
  for (const code of errorCodes) {
    byCode[code] = await getCounter(`error_${code}`);
  }
  
  // Get error counts by endpoint (simplified)
  const endpoints = ['/api/auth', '/api/members', '/api/events', '/api/music', '/api/files'];
  const byEndpoint: Record<string, number> = {};
  for (const endpoint of endpoints) {
    byEndpoint[endpoint] = await getCounter(`error_endpoint:${endpoint}`);
  }
  
  // Calculate error rate (errors per minute)
  const recentErrors = memoryStore.getRecentTimestamps('error_total', windowStart);
  const rate = recentErrors.length / (WINDOW_SIZE / 60);
  
  return {
    total,
    byCode,
    byEndpoint,
    rate: Math.round(rate * 100) / 100,
  };
}

/**
 * Calculate database metrics
 */
export async function calculateDatabaseMetrics(): Promise<DatabaseMetrics> {
  const totalQueries = await getCounter('db_query_total');
  const slowQueries = await getCounter('db_query_slow');
  const failedQueries = await getCounter('db_query_failed');
  
  const values = await getTimerValues('db_query_duration');
  const avgDuration = values.length > 0
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0;
  
  // Get metrics by operation type
  const operations = ['select', 'insert', 'update', 'delete'];
  const byOperation: Record<string, { count: number; avgDuration: number }> = {};
  
  for (const op of operations) {
    const count = await getCounter(`db_query_${op}`);
    const opValues = memoryStore.getTimerValues(`db_query_${op}_duration`);
    const opAvg = opValues.length > 0
      ? Math.round(opValues.reduce((a, b) => a + b, 0) / opValues.length)
      : 0;
    byOperation[op] = { count, avgDuration: opAvg };
  }
  
  return {
    totalQueries,
    avgDuration,
    slowQueries,
    failedQueries,
    byOperation,
  };
}

/**
 * Calculate cache metrics
 */
export async function calculateCacheMetrics(): Promise<CacheMetrics> {
  const hits = await getCounter('cache_hit');
  const misses = await getCounter('cache_miss');
  const evictions = await getCounter('cache_eviction');
  
  const total = hits + misses;
  const hitRate = total > 0 ? Math.round((hits / total) * 100) / 100 : 0;
  
  // Try to get cache size from Redis
  let size = 0;
  try {
    if (await isRedisAvailable()) {
      const keys = await redis.keys(`${METRICS_PREFIX}:*`);
      size = keys.length;
    }
  } catch {
    // Ignore
  }
  
  return {
    hits,
    misses,
    hitRate,
    evictions,
    size,
  };
}

/**
 * Get system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  return {
    memoryUsage: process.memoryUsage(),
    uptime: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
  };
}

/**
 * Track a request
 */
export async function trackRequest(
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number
): Promise<void> {
  // Record duration
  await recordTimer('request_duration', durationMs, { endpoint, method });
  
  // Track success/error
  if (statusCode >= 400) {
    await incrementCounter('request_error');
    await incrementCounter(`error_${statusCode}`);
    await incrementCounter(`error_endpoint:${endpoint}`);
  } else {
    await incrementCounter('request_success');
  }
  
  // Track by endpoint
  await incrementCounter(`request:${method}:${endpoint}`);
}

/**
 * Track a database query
 */
export async function trackDatabaseQuery(
  operation: string,
  table: string,
  durationMs: number,
  success: boolean
): Promise<void> {
  await incrementCounter('db_query_total');
  await recordTimer('db_query_duration', durationMs, { operation, table });
  
  if (!success) {
    await incrementCounter('db_query_failed');
  }
  
  if (durationMs > 500) {
    await incrementCounter('db_query_slow');
  }
  
  // Track by operation
  await incrementCounter(`db_query_${operation}`);
  memoryStore.recordTimer(`db_query_${operation}_duration`, durationMs);
}

/**
 * Track cache operation
 */
export async function trackCacheOperation(
  operation: 'hit' | 'miss' | 'eviction'
): Promise<void> {
  await incrementCounter(`cache_${operation}`);
}

/**
 * Clear all metrics
 */
export async function clearMetrics(name?: string): Promise<void> {
  memoryStore.clear(name);
  
  try {
    if (await isRedisAvailable()) {
      if (name) {
        const pattern = `${METRICS_PREFIX}:*:${name}`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        const pattern = `${METRICS_PREFIX}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    }
  } catch (error) {
    logger.debug('Failed to clear metrics in Redis', { name, error: String(error) });
  }
}

/**
 * Get all metrics for dashboard
 */
export async function getAllMetrics(): Promise<{
  requests: RequestMetrics;
  errors: ErrorMetrics;
  database: DatabaseMetrics;
  cache: CacheMetrics;
  system: SystemMetrics;
  counters: Record<string, number>;
  gauges: Record<string, number>;
}> {
  const [requests, errors, database, cache] = await Promise.all([
    calculateRequestMetrics(),
    calculateErrorMetrics(),
    calculateDatabaseMetrics(),
    calculateCacheMetrics(),
  ]);
  
  return {
    requests,
    errors,
    database,
    cache,
    system: getSystemMetrics(),
    counters: memoryStore.getAllCounters(),
    gauges: memoryStore.getAllGauges(),
  };
}

// Export the memory store for testing
export { memoryStore };
