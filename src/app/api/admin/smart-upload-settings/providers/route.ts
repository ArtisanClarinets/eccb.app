/**
 * Smart Upload Providers API
 *
 * GET: List all AI providers
 * PUT: Enable/disable provider or set as default
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getProviders,
  enableProvider,
  setDefaultProvider,
} from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

// ============================================================================
// Request Validation
// ============================================================================

const updateProviderSchema = z.object({
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

// ============================================================================
// GET: List all providers
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

    const providers = await getProviders();

    return NextResponse.json({ providers });
  } catch (error) {
    logger.error(
      'Failed to get providers',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get providers' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: Update provider
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { providerId } = await params;

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
    const parsed = updateProviderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const userId = session.user.id;

    // Handle enabled status
    if (data.enabled !== undefined) {
      await enableProvider(providerId, data.enabled, userId);
    }

    // Handle default setting
    if (data.isDefault === true) {
      await setDefaultProvider(providerId, userId);
    }

    // Return updated providers list
    const providers = await getProviders();

    return NextResponse.json({ providers });
  } catch (error) {
    logger.error(
      'Failed to update provider',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to update provider' },
      { status: 500 }
    );
  }
}
