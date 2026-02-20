/**
 * Provider Models API
 *
 * GET: Get models for a provider
 * POST: Refresh models from provider API
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getModelsForProvider,
  getDefaultModel,
  refreshModelsFromProvider,
} from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

// ============================================================================
// GET: Get models for provider
// ============================================================================

export async function GET(
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
      'system.view.all'
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const models = await getModelsForProvider(providerId);
    const defaultModel = await getDefaultModel(providerId);

    return NextResponse.json({
      models,
      defaultModelId: defaultModel?.id ?? null,
    });
  } catch (error) {
    logger.error(
      'Failed to get models',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get models' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST: Refresh models from provider
// ============================================================================

export async function POST(
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

    const result = await refreshModelsFromProvider(providerId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Failed to refresh models',
          details: result.error,
        },
        { status: 400 }
      );
    }

    // Return updated models
    const models = await getModelsForProvider(providerId);
    const defaultModel = await getDefaultModel(providerId);

    return NextResponse.json({
      success: true,
      count: result.count,
      models,
      defaultModelId: defaultModel?.id ?? null,
    });
  } catch (error) {
    logger.error(
      'Failed to refresh models',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to refresh models' },
      { status: 500 }
    );
  }
}
