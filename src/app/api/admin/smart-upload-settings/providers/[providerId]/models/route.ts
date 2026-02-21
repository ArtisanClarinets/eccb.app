/**
 * Provider Models API
 *
 * GET: Get models for a provider
 * POST: Refresh models from provider API
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getModelsForProvider,
  getDefaultModel,
  refreshModelsFromProvider,
  getProvider,
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

    // Validate provider exists
    const provider = await getProvider(providerId);
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
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
    
    // DIAGNOSTIC: Log the incoming providerId
    console.log('[refreshModels] POST called with providerId:', providerId);

    // Check authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      console.log('[refreshModels] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    const hasAdminAccess = await checkUserPermission(
      session.user.id,
      'system.edit.all'
    );
    if (!hasAdminAccess) {
      console.log('[refreshModels] Forbidden - no admin access');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // DIAGNOSTIC: Log before calling refreshModelsFromProvider
    console.log('[refreshModels] Calling refreshModelsFromProvider with providerId:', providerId);
    
    const result = await refreshModelsFromProvider(providerId);

    // DIAGNOSTIC: Log the result
    console.log('[refreshModels] Result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.log('[refreshModels] Failed - returning 400 with error:', result.error);
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
