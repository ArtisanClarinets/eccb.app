import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { getUserRoles } from '@/lib/auth/permissions';
import { applyRateLimit } from '@/lib/rate-limit';
import {
  jsonOk,
  json401,
  json404,
  json500,
  parseBody,
} from '@/lib/stand/http';
import {
  getStandSettings,
  updateStandSettings,
  type StandGlobalSettings,
} from '@/lib/stand/settings';
import { z } from 'zod';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR'];

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  maxAnnotationsPerPage: z.number().int().min(1).max(1000).optional(),
  maxFileSizeMb: z.number().min(1).max(500).optional(),
  allowOfflineSync: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).nullable().optional(),
});

// ─── GET /api/stand/settings ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const roles = await getUserRoles(session.user.id);
    const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
    if (!isAdmin) return json404();

    const settings = await getStandSettings();
    return jsonOk(settings);
  } catch (error) {
    console.error('[Settings GET]', error);
    return json500();
  }
}

// ─── PUT /api/stand/settings ──────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) return json401();

    const roles = await getUserRoles(session.user.id);
    const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
    if (!isAdmin) return json404();

    const parsed = await parseBody(request, updateSettingsSchema);
    if (parsed instanceof Response) return parsed;

    const updated = await updateStandSettings(parsed as Partial<StandGlobalSettings>);
    return jsonOk(updated);
  } catch (error) {
    console.error('[Settings PUT]', error);
    return json500();
  }
}
