/**
 * Provider API Key Routes
 *
 * POST: Save API key for provider
 * POST: Validate API key (without saving)
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  saveApiKey,
  validateApiKey,
} from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

// ============================================================================
// Request Validation
// ============================================================================

const saveApiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

// ============================================================================
// POST: Save API key for provider
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

    // Parse and validate request body
    const body = await request.json();
    const parsed = saveApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { apiKey } = parsed.data;
    const userId = session.user.id;

    // First validate the key
    const validationResult = await validateApiKey(providerId, apiKey);

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: 'Invalid API key',
          details: validationResult.error,
        },
        { status: 400 }
      );
    }

    // Save the API key (encrypted)
    await saveApiKey(providerId, apiKey, userId);

    // Mark the key as valid
    await prisma.aPIKey.updateMany({
      where: { providerId, isActive: true },
      data: { isValid: true, validationError: null, lastValidated: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: 'API key saved and validated successfully',
    });
  } catch (error) {
    logger.error(
      'Failed to save API key',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}
