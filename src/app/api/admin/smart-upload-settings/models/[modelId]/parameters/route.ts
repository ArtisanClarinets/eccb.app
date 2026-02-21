/**
 * Model Parameters API
 *
 * GET: Get parameters for a model
 * PUT: Update user-defined parameter values for a model
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  updateModelParameters,
} from '@/lib/services/smart-upload-settings';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

// ============================================================================
// Request Validation
// ============================================================================

const updateParametersSchema = z.object({
  parameters: z.record(z.string(), z.union([z.number(), z.string()])),
});


// ============================================================================
// GET: Get model parameters
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;

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

    // Get the model with parameters
    const model = await prisma.aIModel.findUnique({
      where: { id: modelId },
      include: {
        parameters: {
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json({ model });
  } catch (error) {
    logger.error(
      'Failed to get model parameters',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get model parameters' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: Update model parameters
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;

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
    const parsed = updateParametersSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { parameters } = parsed.data;
    const userId = session.user.id;

    // Update the parameters
    await updateModelParameters(modelId, parameters, userId);

    // Get the updated model with parameters
    const model = await prisma.aIModel.findUnique({
      where: { id: modelId },
      include: {
        parameters: {
          orderBy: { name: 'asc' },
        },
      },
    });

    return NextResponse.json({
      success: true,
      model,
    });
  } catch (error) {
    logger.error(
      'Failed to update model parameters',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to update parameters' },
      { status: 500 }
    );
  }
}
