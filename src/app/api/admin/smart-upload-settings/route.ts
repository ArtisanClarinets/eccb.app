/**
 * Smart Upload Settings API
 *
 * GET: Get all settings, providers, and their status
 * PUT: Update settings
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getSettingsStatus,
  setSetting,
  setSmartUploadEnabled,
} from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

// ============================================================================
// Request Validation
// ============================================================================

const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

// ============================================================================
// GET: Get all settings
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    const hasAdminAccess = await checkUserPermission(
      session.user.id,
      'system.view.all'
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = await getSettingsStatus();

    return NextResponse.json(status);
  } catch (error) {
    logger.error(
      'Failed to get smart upload settings',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: Update settings
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    const hasAdminAccess = await checkUserPermission(
      session.user.id,
      'system.edit.all'
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const userId = session.user.id;

    // Update feature enabled status
    if (data.enabled !== undefined) {
      await setSmartUploadEnabled(data.enabled, userId);
    }

    // Update individual settings
    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        await setSetting(key, value, userId);
      }
    }

    // Return updated status
    const status = await getSettingsStatus();

    return NextResponse.json(status);
  } catch (error) {
    logger.error(
      'Failed to update smart upload settings',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
