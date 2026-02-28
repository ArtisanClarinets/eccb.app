/**
 * Stand Settings — DB-backed kill switch + admin configuration.
 *
 * Settings are cached in Redis with a short TTL. Admin changes flush the cache.
 * Falls back to feature-flag defaults when no DB row exists.
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { isFeatureEnabled, FEATURES } from '@/lib/feature-flags';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandGlobalSettings {
  /** Master kill switch — disables the entire stand */
  enabled: boolean;
  /** Real-time mode: 'polling' | 'websocket' | 'off' */
  realtimeMode: 'polling' | 'websocket' | 'off';
  /** Max annotation stroke data size in bytes */
  maxStrokeDataBytes: number;
  /** Max annotations per page per user */
  maxAnnotationsPerPage: number;
  /** Offline PWA caching enabled */
  offlineEnabled: boolean;
  /** Practice tracking enabled */
  practiceTrackingEnabled: boolean;
  /** Audio sync enabled */
  audioSyncEnabled: boolean;
  /** Default auto-page-turn delay (ms) */
  defaultAutoTurnDelay: number;
  /** Max file size for stand PDF proxy (bytes) */
  maxPdfSizeBytes: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: StandGlobalSettings = {
  enabled: true,
  realtimeMode: 'polling',
  maxStrokeDataBytes: 512_000, // 500KB
  maxAnnotationsPerPage: 100,
  offlineEnabled: false,
  practiceTrackingEnabled: true,
  audioSyncEnabled: false,
  defaultAutoTurnDelay: 3000,
  maxPdfSizeBytes: 50_000_000, // 50MB
};

const CACHE_KEY = 'stand:global-settings';
const CACHE_TTL = 300; // 5 minutes

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * Get the global stand settings with Redis caching.
 * Falls back to defaults if no DB row or Redis is unavailable.
 */
export async function getStandSettings(): Promise<StandGlobalSettings> {
  // Check Redis cache first
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(cached as string) };
    }
  } catch {
    // Redis unavailable, continue to DB
  }

  // Check DB — stored in a system settings table or UserPreferences for admin
  try {
    // Use a system-level preferences row (userId = 'system')
    const row = await prisma.userPreferences.findUnique({
      where: { userId: 'system' },
      select: { otherSettings: true },
    });

    if (row?.otherSettings) {
      const settings = (row.otherSettings as Record<string, unknown>)
        ?.standSettings as Partial<StandGlobalSettings> | undefined;
      if (settings) {
        const merged = { ...DEFAULT_SETTINGS, ...settings };
        // Cache in Redis
        try {
          await redis.set(CACHE_KEY, JSON.stringify(merged), 'EX', CACHE_TTL);
        } catch {
          // Ignore cache write failure
        }
        return merged;
      }
    }
  } catch {
    // DB unavailable, use defaults
  }

  // Merge with feature flags
  return {
    ...DEFAULT_SETTINGS,
    enabled: isFeatureEnabled(FEATURES.MUSIC_STAND),
    practiceTrackingEnabled: isFeatureEnabled(FEATURES.PRACTICE_TRACKING),
    offlineEnabled: isFeatureEnabled(FEATURES.STAND_OFFLINE),
    audioSyncEnabled: isFeatureEnabled(FEATURES.STAND_AUDIO_SYNC),
    realtimeMode: isFeatureEnabled(FEATURES.STAND_WEBSOCKET_SYNC)
      ? 'websocket'
      : 'polling',
  };
}

// ─── Setters (Admin) ──────────────────────────────────────────────────────────

/**
 * Update global stand settings. Admin-only operation.
 * Flushes the Redis cache.
 */
export async function updateStandSettings(
  updates: Partial<StandGlobalSettings>
): Promise<StandGlobalSettings> {
  const current = await getStandSettings();
  const merged = { ...current, ...updates };

  // Upsert into DB
  await prisma.userPreferences.upsert({
    where: { userId: 'system' },
    create: {
      userId: 'system',
      nightMode: false,
      otherSettings: { standSettings: merged },
    },
    update: {
      otherSettings: {
        ...((
          await prisma.userPreferences.findUnique({
            where: { userId: 'system' },
            select: { otherSettings: true },
          })
        )?.otherSettings as Record<string, unknown> ?? {}),
        standSettings: merged,
      },
    },
  });

  // Flush cache
  try {
    await redis.del(CACHE_KEY);
  } catch {
    // Ignore
  }

  return merged;
}

/**
 * Check if the stand is enabled (quick check with caching).
 */
export async function isStandEnabled(): Promise<boolean> {
  const settings = await getStandSettings();
  return settings.enabled;
}
