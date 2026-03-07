/**
 * /api/stand/settings — Admin-only endpoint for managing stand global settings.
 *
 * GET  → returns current settings (admin only)
 * PUT  → updates settings (admin only) with strict allowlist validation
 *
 * Members use /api/stand/config for the member-safe read-only view.
 */

import { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';
import {
  getStandSettings,
  updateStandSettings,
  type StandGlobalSettings,
} from '@/lib/stand/settings';
import { getStandSession } from '@/lib/stand/access';
import { jsonOk, json404, json500, parseBody } from '@/lib/stand/http';
import { getUserRoles } from '@/lib/auth/permissions';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR'];

/** Only keys in the allowlist can be written. */
const updateSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    realtimeMode: z.enum(['polling', 'websocket', 'off']).optional(),
    maxStrokeDataBytes: z.number().int().min(1024).max(2_097_152).optional(),
    maxAnnotationsPerPage: z.number().int().min(1).max(1000).optional(),
    offlineEnabled: z.boolean().optional(),
    practiceTrackingEnabled: z.boolean().optional(),
    audioSyncEnabled: z.boolean().optional(),
    defaultAutoTurnDelay: z.number().int().min(500).max(30_000).optional(),
    maxPdfSizeBytes: z.number().int().min(1_000_000).max(500_000_000).optional(),
    maxFileSizeMb: z.number().min(1).max(500).optional(),
    allowOfflineSync: z.boolean().optional(),
    accessPolicy: z.enum(['any_member', 'rsvp_only']).optional(),
    maintenanceMessage: z.string().max(500).nullable().optional(),
    pollingIntervalMs: z.number().int().min(1000).max(60_000).optional(),
  })
  .strict();

async function requireAdmin(): Promise<string | Response> {
  const session = await getStandSession();
  if (session instanceof Response) return session;
  const roles = await getUserRoles(session.user.id);
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
  if (!isAdmin) return json404();
  return session.user.id;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const adminResult = await requireAdmin();
    if (adminResult instanceof Response) return adminResult;

    const settings = await getStandSettings();
    return jsonOk(settings);
  } catch (error) {
    console.error('[Settings GET]', error);
    return json500();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const adminResult = await requireAdmin();
    if (adminResult instanceof Response) return adminResult;

    const parsed = await parseBody(request, updateSettingsSchema);
    if (parsed instanceof Response) return parsed;

    const updated = await updateStandSettings(
      parsed as Partial<StandGlobalSettings>,
      adminResult as string
    );
    return jsonOk(updated);
  } catch (error) {
    console.error('[Settings PUT]', error);
    return json500();
  }
}
