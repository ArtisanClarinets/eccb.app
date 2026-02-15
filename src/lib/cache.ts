/**
 * Cache utility for Redis-based caching with TTL support
 * Provides a consistent interface for caching CMS content and other data
 */

import { redis } from '@/lib/redis';

/**
 * Cache configuration constants
 */
export const CACHE_CONFIG = {
  /** Default TTL for public page content (5 minutes) */
  PAGE_TTL: 300,
  /** TTL for page metadata (10 minutes) */
  PAGE_META_TTL: 600,
  /** TTL for announcements (2 minutes) */
  ANNOUNCEMENT_TTL: 120,
  /** TTL for public events (5 minutes) */
  EVENT_TTL: 300,
  /** TTL for music catalog listings (5 minutes) */
  MUSIC_LIST_TTL: 300,
  /** TTL for individual music piece details (10 minutes) */
  MUSIC_PIECE_TTL: 600,
  /** TTL for music assignments (3 minutes) */
  MUSIC_ASSIGNMENT_TTL: 180,
  /** TTL for librarian dashboard stats (2 minutes) */
  MUSIC_DASHBOARD_TTL: 120,
  /** Prefix for all cache keys */
  KEY_PREFIX: 'eccb:',
} as const;

/**
 * Cache key generators for consistent key naming
 */
export const cacheKeys = {
  page: (slug: string) => `${CACHE_CONFIG.KEY_PREFIX}page:${slug}`,
  pageMeta: (slug: string) => `${CACHE_CONFIG.KEY_PREFIX}page:meta:${slug}`,
  pageList: (status?: string) => `${CACHE_CONFIG.KEY_PREFIX}pages:list:${status ?? 'all'}`,
  announcement: (id: string) => `${CACHE_CONFIG.KEY_PREFIX}announcement:${id}`,
  announcementList: (activeOnly: boolean) => `${CACHE_CONFIG.KEY_PREFIX}announcements:${activeOnly ? 'active' : 'all'}`,
  event: (id: string) => `${CACHE_CONFIG.KEY_PREFIX}event:${id}`,
  eventList: (upcoming: boolean) => `${CACHE_CONFIG.KEY_PREFIX}events:${upcoming ? 'upcoming' : 'all'}`,
  // Music cache keys
  musicPiece: (id: string) => `${CACHE_CONFIG.KEY_PREFIX}music:piece:${id}`,
  musicList: (filters: string) => `${CACHE_CONFIG.KEY_PREFIX}music:list:${filters}`,
  musicAssignments: (pieceId?: string, memberId?: string) => 
    `${CACHE_CONFIG.KEY_PREFIX}music:assignments:${pieceId ?? 'all'}:${memberId ?? 'all'}`,
  musicAssignment: (id: string) => `${CACHE_CONFIG.KEY_PREFIX}music:assignment:${id}`,
  musicDashboard: () => `${CACHE_CONFIG.KEY_PREFIX}music:dashboard`,
} as const;

/**
 * Cache entry metadata for tracking cache operations
 */
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
}

/**
 * Get a value from cache, with optional fallback fetcher
 */
export async function cacheGet<T>(
  key: string,
  fetcher?: () => Promise<T>,
  ttl: number = CACHE_CONFIG.PAGE_TTL,
): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry<T>;
      return entry.data;
    }
    
    if (fetcher) {
      const data = await fetcher();
      await cacheSet(key, data, ttl);
      return data;
    }
    
    return null;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    // On cache error, fall through to fetcher if available
    if (fetcher) {
      return fetcher();
    }
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export async function cacheSet<T>(
  key: string,
  data: T,
  ttl: number = CACHE_CONFIG.PAGE_TTL,
): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      ttl,
    };
    await redis.setex(key, ttl, JSON.stringify(entry));
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
    // Don't throw - caching failures shouldn't break the app
  }
}

/**
 * Delete a specific key from cache
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
}

/**
 * Delete multiple keys matching a pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Cache delete pattern error for ${pattern}:`, error);
  }
}

/**
 * Invalidate all page-related cache entries
 */
export async function invalidatePageCache(slug?: string): Promise<void> {
  try {
    if (slug) {
      // Invalidate specific page
      await Promise.all([
        cacheDelete(cacheKeys.page(slug)),
        cacheDelete(cacheKeys.pageMeta(slug)),
      ]);
    } else {
      // Invalidate all pages
      await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}page:*`);
    }
  } catch (error) {
    console.error('Failed to invalidate page cache:', error);
  }
}

/**
 * Invalidate announcement cache
 */
export async function invalidateAnnouncementCache(): Promise<void> {
  try {
    await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}announcement*`);
  } catch (error) {
    console.error('Failed to invalidate announcement cache:', error);
  }
}

/**
 * Invalidate event cache
 */
export async function invalidateEventCache(id?: string): Promise<void> {
  try {
    if (id) {
      await cacheDelete(cacheKeys.event(id));
    }
    // Always invalidate event lists since they might contain the updated event
    await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}events:*`);
  } catch (error) {
    console.error('Failed to invalidate event cache:', error);
  }
}

/**
 * Invalidate music piece cache
 * @param id - Optional specific piece ID. If not provided, invalidates all music caches.
 */
export async function invalidateMusicCache(id?: string): Promise<void> {
  try {
    if (id) {
      // Invalidate specific piece
      await cacheDelete(cacheKeys.musicPiece(id));
      // Invalidate assignment caches for this piece
      await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}music:assignments:${id}:*`);
    }
    // Always invalidate music lists since they might contain the updated piece
    await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}music:list:*`);
    // Invalidate dashboard stats
    await cacheDelete(cacheKeys.musicDashboard());
  } catch (error) {
    console.error('Failed to invalidate music cache:', error);
  }
}

/**
 * Invalidate music assignment cache
 * @param pieceId - Optional piece ID to invalidate assignments for
 * @param memberId - Optional member ID to invalidate assignments for
 */
export async function invalidateMusicAssignmentCache(
  pieceId?: string,
  memberId?: string
): Promise<void> {
  try {
    if (pieceId && memberId) {
      // Invalidate specific assignment combination
      await cacheDelete(cacheKeys.musicAssignments(pieceId, memberId));
    } else if (pieceId) {
      // Invalidate all assignments for this piece
      await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}music:assignments:${pieceId}:*`);
    } else if (memberId) {
      // Invalidate all assignments for this member
      await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}music:assignments:*:${memberId}`);
    } else {
      // Invalidate all assignment caches
      await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}music:assignments:*`);
    }
    // Always invalidate dashboard stats when assignments change
    await cacheDelete(cacheKeys.musicDashboard());
  } catch (error) {
    console.error('Failed to invalidate music assignment cache:', error);
  }
}

/**
 * Invalidate librarian dashboard cache
 */
export async function invalidateMusicDashboardCache(): Promise<void> {
  try {
    await cacheDelete(cacheKeys.musicDashboard());
  } catch (error) {
    console.error('Failed to invalidate music dashboard cache:', error);
  }
}

/**
 * Clear all application cache
 */
export async function clearAllCache(): Promise<void> {
  try {
    await cacheDeletePattern(`${CACHE_CONFIG.KEY_PREFIX}*`);
  } catch (error) {
    console.error('Failed to clear all cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  keys: number;
  memory: string;
}> {
  try {
    const keys = await redis.keys(`${CACHE_CONFIG.KEY_PREFIX}*`);
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    
    return {
      keys: keys.length,
      memory: memoryMatch?.[1] ?? 'unknown',
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { keys: 0, memory: 'error' };
  }
}

/**
 * Higher-order function to wrap any async function with caching
 */
export function withCache<TArgs extends unknown[], TResult>(
  keyFn: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TResult>,
  ttl: number = CACHE_CONFIG.PAGE_TTL,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args);
    const cached = await cacheGet<TResult>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const result = await fn(...args);
    await cacheSet(key, result, ttl);
    return result;
  };
}

export default {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  invalidatePageCache,
  invalidateAnnouncementCache,
  invalidateEventCache,
  invalidateMusicCache,
  invalidateMusicAssignmentCache,
  invalidateMusicDashboardCache,
  clearAllCache,
  getCacheStats,
  withCache,
  cacheKeys,
  CACHE_CONFIG,
};
