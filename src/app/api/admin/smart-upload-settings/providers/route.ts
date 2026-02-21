/**
 * Smart Upload Providers API
 *
 * GET: List all AI providers
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import { getProviders } from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

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
