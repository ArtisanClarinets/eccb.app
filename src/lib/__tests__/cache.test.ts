import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../cache';

// Mock the redis module
vi.mock('../redis', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    info: vi.fn(),
  },
}));

import { redis } from '../redis';

const mockRedis = vi.mocked(redis);

describe('Cache Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('CACHE_CONFIG', () => {
    it('should have correct default TTL values', () => {
      expect(CACHE_CONFIG.PAGE_TTL).toBe(300);
      expect(CACHE_CONFIG.PAGE_META_TTL).toBe(600);
      expect(CACHE_CONFIG.ANNOUNCEMENT_TTL).toBe(120);
      expect(CACHE_CONFIG.EVENT_TTL).toBe(300);
      expect(CACHE_CONFIG.KEY_PREFIX).toBe('eccb:');
    });

    it('should have correct music-specific TTL values', () => {
      expect(CACHE_CONFIG.MUSIC_LIST_TTL).toBe(300);
      expect(CACHE_CONFIG.MUSIC_PIECE_TTL).toBe(600);
      expect(CACHE_CONFIG.MUSIC_ASSIGNMENT_TTL).toBe(180);
      expect(CACHE_CONFIG.MUSIC_DASHBOARD_TTL).toBe(120);
    });
  });

  describe('cacheKeys', () => {
    it('should generate correct page cache key', () => {
      expect(cacheKeys.page('about')).toBe('eccb:page:about');
    });

    it('should generate correct page meta cache key', () => {
      expect(cacheKeys.pageMeta('about')).toBe('eccb:page:meta:about');
    });

    it('should generate correct page list cache key', () => {
      expect(cacheKeys.pageList()).toBe('eccb:pages:list:all');
      expect(cacheKeys.pageList('PUBLISHED')).toBe('eccb:pages:list:PUBLISHED');
    });

    it('should generate correct announcement cache keys', () => {
      expect(cacheKeys.announcement('123')).toBe('eccb:announcement:123');
      expect(cacheKeys.announcementList(true)).toBe('eccb:announcements:active');
      expect(cacheKeys.announcementList(false)).toBe('eccb:announcements:all');
    });

    it('should generate correct event cache keys', () => {
      expect(cacheKeys.event('456')).toBe('eccb:event:456');
      expect(cacheKeys.eventList(true)).toBe('eccb:events:upcoming');
      expect(cacheKeys.eventList(false)).toBe('eccb:events:all');
    });

    it('should generate correct music piece cache key', () => {
      expect(cacheKeys.musicPiece('piece-123')).toBe('eccb:music:piece:piece-123');
    });

    it('should generate correct music list cache key', () => {
      expect(cacheKeys.musicList('status:ACTIVE')).toBe('eccb:music:list:status:ACTIVE');
      expect(cacheKeys.musicList('all')).toBe('eccb:music:list:all');
    });

    it('should generate correct music assignments cache key', () => {
      expect(cacheKeys.musicAssignments()).toBe('eccb:music:assignments:all:all');
      expect(cacheKeys.musicAssignments('piece-123')).toBe('eccb:music:assignments:piece-123:all');
      expect(cacheKeys.musicAssignments(undefined, 'member-456')).toBe('eccb:music:assignments:all:member-456');
      expect(cacheKeys.musicAssignments('piece-123', 'member-456')).toBe('eccb:music:assignments:piece-123:member-456');
    });

    it('should generate correct music assignment cache key', () => {
      expect(cacheKeys.musicAssignment('assignment-789')).toBe('eccb:music:assignment:assignment-789');
    });

    it('should generate correct music dashboard cache key', () => {
      expect(cacheKeys.musicDashboard()).toBe('eccb:music:dashboard');
    });
  });

  describe('cacheGet', () => {
    it('should return cached data when available', async () => {
      const testData = { title: 'Test Page', content: 'Test content' };
      const cacheEntry = {
        data: testData,
        cachedAt: Date.now(),
        ttl: 300,
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cacheEntry));
      
      const result = await cacheGet('test-key');
      
      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should fetch and cache data when not in cache', async () => {
      const testData = { title: 'Test Page', content: 'Test content' };
      const fetcher = vi.fn().mockResolvedValue(testData);
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      const result = await cacheGet('test-key', fetcher, 300);
      
      expect(result).toEqual(testData);
      expect(fetcher).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test-key',
        300,
        expect.stringContaining('"title":"Test Page"')
      );
    });

    it('should return null when not in cache and no fetcher', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      
      const result = await cacheGet('test-key');
      
      expect(result).toBeNull();
    });

    it('should fall through to fetcher on cache error', async () => {
      const testData = { title: 'Test Page' };
      const fetcher = vi.fn().mockResolvedValue(testData);
      
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await cacheGet('test-key', fetcher);
      
      expect(result).toEqual(testData);
      expect(fetcher).toHaveBeenCalled();
    });
  });

  describe('cacheSet', () => {
    it('should set cache with correct TTL', async () => {
      const testData = { title: 'Test Page' };
      
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      await cacheSet('test-key', testData, 600);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test-key',
        600,
        expect.stringContaining('"title":"Test Page"')
      );
    });

    it('should use default TTL when not specified', async () => {
      const testData = { title: 'Test Page' };
      
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      await cacheSet('test-key', testData);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test-key',
        CACHE_CONFIG.PAGE_TTL,
        expect.any(String)
      );
    });

    it('should not throw on cache set error', async () => {
      const testData = { title: 'Test Page' };
      
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis error'));
      
      // Should not throw
      await expect(cacheSet('test-key', testData)).resolves.toBeUndefined();
    });
  });

  describe('cacheDelete', () => {
    it('should delete cache key', async () => {
      mockRedis.del.mockResolvedValueOnce(1);
      
      await cacheDelete('test-key');
      
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should not throw on delete error', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Redis error'));
      
      await expect(cacheDelete('test-key')).resolves.toBeUndefined();
    });
  });

  describe('cacheDeletePattern', () => {
    it('should delete all matching keys', async () => {
      mockRedis.keys.mockResolvedValueOnce(['key1', 'key2', 'key3']);
      mockRedis.del.mockResolvedValueOnce(3);
      
      await cacheDeletePattern('test-*');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('test-*');
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should handle no matching keys', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      
      await cacheDeletePattern('test-*');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('test-*');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('invalidatePageCache', () => {
    it('should invalidate specific page cache', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      await invalidatePageCache('about');
      
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:page:about');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:page:meta:about');
    });

    it('should invalidate all page cache when no slug provided', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:page:about', 'eccb:page:meta:about']);
      mockRedis.del.mockResolvedValueOnce(2);
      
      await invalidatePageCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:page:*');
    });
  });

  describe('invalidateAnnouncementCache', () => {
    it('should invalidate all announcement cache', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:announcement:1', 'eccb:announcements:active']);
      mockRedis.del.mockResolvedValueOnce(2);
      
      await invalidateAnnouncementCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:announcement*');
    });
  });

  describe('invalidateEventCache', () => {
    it('should invalidate specific event and all event lists', async () => {
      mockRedis.del.mockResolvedValue(1);
      mockRedis.keys.mockResolvedValueOnce(['eccb:events:upcoming', 'eccb:events:all']);
      mockRedis.del.mockResolvedValueOnce(2);
      
      await invalidateEventCache('123');
      
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:event:123');
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:events:*');
    });

    it('should invalidate only event lists when no id provided', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:events:upcoming', 'eccb:events:all']);
      mockRedis.del.mockResolvedValueOnce(2);
      
      await invalidateEventCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:events:*');
    });
  });

  describe('clearAllCache', () => {
    it('should clear all application cache', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:page:1', 'eccb:event:2']);
      mockRedis.del.mockResolvedValueOnce(2);
      
      await clearAllCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:*');
    });
  });

  describe('invalidateMusicCache', () => {
    it('should invalidate specific piece and its assignments', async () => {
      mockRedis.del.mockResolvedValue(1);
      mockRedis.keys.mockResolvedValueOnce(['eccb:music:assignments:piece-123:member-1']);
      
      await invalidateMusicCache('piece-123');
      
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:piece:piece-123');
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:assignments:piece-123:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:list:*');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });

    it('should invalidate all music caches when no id provided', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:music:list:all', 'eccb:music:list:active']);
      mockRedis.del.mockResolvedValue(2);
      
      await invalidateMusicCache();
      
      expect(mockRedis.del).not.toHaveBeenCalledWith('eccb:music:piece:piece-123');
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:list:*');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });
  });

  describe('invalidateMusicAssignmentCache', () => {
    it('should invalidate specific assignment combination', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      await invalidateMusicAssignmentCache('piece-123', 'member-456');
      
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:assignments:piece-123:member-456');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });

    it('should invalidate all assignments for a piece', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:music:assignments:piece-123:member-1', 'eccb:music:assignments:piece-123:member-2']);
      mockRedis.del.mockResolvedValue(2);
      
      await invalidateMusicAssignmentCache('piece-123');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:assignments:piece-123:*');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });

    it('should invalidate all assignments for a member', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:music:assignments:piece-1:member-456', 'eccb:music:assignments:piece-2:member-456']);
      mockRedis.del.mockResolvedValue(2);
      
      await invalidateMusicAssignmentCache(undefined, 'member-456');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:assignments:*:member-456');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });

    it('should invalidate all assignment caches when no params provided', async () => {
      mockRedis.keys.mockResolvedValueOnce(['eccb:music:assignments:all:all', 'eccb:music:assignments:piece-1:all']);
      mockRedis.del.mockResolvedValue(2);
      
      await invalidateMusicAssignmentCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('eccb:music:assignments:*');
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });
  });

  describe('invalidateMusicDashboardCache', () => {
    it('should invalidate dashboard cache', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      await invalidateMusicDashboardCache();
      
      expect(mockRedis.del).toHaveBeenCalledWith('eccb:music:dashboard');
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.keys.mockResolvedValueOnce(['key1', 'key2', 'key3']);
      mockRedis.info.mockResolvedValueOnce('used_memory_human:1.5M\nother_info:value');
      
      const stats = await getCacheStats();
      
      expect(stats.keys).toBe(3);
      expect(stats.memory).toBe('1.5M');
    });

    it('should handle missing memory info', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      mockRedis.info.mockResolvedValueOnce('other_info:value');
      
      const stats = await getCacheStats();
      
      expect(stats.keys).toBe(0);
      expect(stats.memory).toBe('unknown');
    });

    it('should return error stats on failure', async () => {
      mockRedis.keys.mockRejectedValueOnce(new Error('Redis error'));
      
      const stats = await getCacheStats();
      
      expect(stats.keys).toBe(0);
      expect(stats.memory).toBe('error');
    });
  });

  describe('withCache', () => {
    it('should return cached data when available', async () => {
      const testData = { value: 42 };
      const cacheEntry = {
        data: testData,
        cachedAt: Date.now(),
        ttl: 300,
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cacheEntry));
      
      const fetcher = vi.fn();
      const cachedFn = withCache(
        (id: string) => `test:${id}`,
        fetcher,
        300
      );
      
      const result = await cachedFn('123');
      
      expect(result).toEqual(testData);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache on cache miss', async () => {
      const testData = { value: 42 };
      const fetcher = vi.fn().mockResolvedValue(testData);
      
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValueOnce('OK');
      
      const cachedFn = withCache(
        (id: string) => `test:${id}`,
        fetcher,
        300
      );
      
      const result = await cachedFn('123');
      
      expect(result).toEqual(testData);
      expect(fetcher).toHaveBeenCalledWith('123');
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });
});
