/**
 * Validate API Key Route
 *
 * POST: Validate API key without saving
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateApiKey } from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';

// ============================================================================
// Request Validation
// ============================================================================

const validateApiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

// ============================================================================
// POST: Validate API key (without saving)
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
      'system.view.all'
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = validateApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { apiKey } = parsed.data;

    // Validate the key
    const result = await validateApiKey(providerId, apiKey);

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
    });
  } catch (error) {
    logger.error(
      'Failed to validate API key',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to validate API key' },
      { status: 500 }
    );
  }
}
