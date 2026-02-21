/**
 * Task Model Configuration API
 *
 * GET: Get all task model configurations
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import { getTaskConfigs } from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

// ============================================================================
// GET: Get all task configs
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

    const configs = await getTaskConfigs();

    return NextResponse.json({ configs });
  } catch (error) {
    logger.error(
      'Failed to get task configs',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get task configs' },
      { status: 500 }
    );
  }
}
