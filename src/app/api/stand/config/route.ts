/**
 * GET /api/stand/config
 *
 * Returns a member-safe subset of the global stand settings.
 * This endpoint is consumed by StandViewer on initial load to hydrate
 * runtime configuration (realtime mode, polling interval, practice tracking, etc.).
 *
 * Exposed fields are intentionally limited — no admin-only settings leak here.
 * Returns 404 if the stand is disabled or the user has no access.
 */

import { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';
import { getStandSettings } from '@/lib/stand/settings';
import { requireStandAccess } from '@/lib/stand/access';
import { jsonOk, json404, json500 } from '@/lib/stand/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    // Auth check — returns 401 if not signed in, 404 if not a member
    const ctx = await requireStandAccess();
    if (ctx instanceof Response) return ctx;

    const settings = await getStandSettings();

    // Kill switch — return 404 so the page can show a proper "unavailable" state
    if (!settings.enabled) {
      return json404('Music Stand is currently unavailable');
    }

    // Return only the member-safe subset
    return jsonOk({
      enabled: settings.enabled,
      realtimeMode: settings.realtimeMode,
      websocketEnabled: settings.websocketEnabled,
      pollingIntervalMs: settings.pollingIntervalMs,
      offlineEnabled: settings.offlineEnabled,
      practiceTrackingEnabled: settings.practiceTrackingEnabled,
      audioSyncEnabled: settings.audioSyncEnabled,
      defaultAutoTurnDelay: settings.defaultAutoTurnDelay,
      maxStrokeDataBytes: settings.maxStrokeDataBytes,
      maxAnnotationsPerPage: settings.maxAnnotationsPerPage,
      maintenanceMessage: settings.maintenanceMessage,
    });
  } catch (error) {
    console.error('[Stand Config GET]', error);
    return json500();
  }
}
