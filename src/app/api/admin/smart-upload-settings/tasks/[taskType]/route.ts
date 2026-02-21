/**
 * Task Model Configuration API (Single Task)
 *
 * GET: Get config for a specific task
 * PUT: Update config for a specific task
 *
 * Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  getTaskConfig,
  setTaskConfig,
} from '@/lib/services/smart-upload-settings';
import { UploadTaskType } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Validation Schema
// ============================================================================

const updateTaskConfigSchema = z.object({
  modelId: z.string().optional().nullable(),
  primaryProviderId: z.string().optional().nullable(),
  fallbackProviderId: z.string().optional().nullable(),
  fallbackModelId: z.string().optional().nullable(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  topP: z.number().min(0).max(1).optional(),
});

// ============================================================================
// Helper: Validate task type
// ============================================================================

function isValidTaskType(taskType: string): taskType is UploadTaskType {
  return [
    'METADATA_EXTRACTION',
    'AUDIO_ANALYSIS',
    'SUMMARIZATION',
    'TRANSCRIPTION',
    'CLASSIFICATION',
  ].includes(taskType);
}

// ============================================================================
// GET: Get config for a specific task
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskType: string }> }
) {
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

    const { taskType } = await params;

    // Validate task type
    if (!isValidTaskType(taskType)) {
      return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
    }

    const config = await getTaskConfig(taskType);

    return NextResponse.json({ config });
  } catch (error) {
    logger.error(
      'Failed to get task config',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to get task config' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: Update config for a specific task
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskType: string }> }
) {
  try {
    // Check authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission (need edit access for updates)
    const hasAdminAccess = await checkUserPermission(
      session.user.id,
      'system.edit.all'
    );
    if (!hasAdminAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { taskType } = await params;

    // Validate task type
    if (!isValidTaskType(taskType)) {
      return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateTaskConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { 
      modelId, 
      primaryProviderId, 
      fallbackProviderId, 
      fallbackModelId, 
      temperature, 
      maxTokens, 
      topP 
    } = validationResult.data;

    // Update the config
    const config = await setTaskConfig(
      taskType,
      modelId ?? null,
      {
        temperature,
        maxTokens,
        topP,
      },
      session.user.id,
      primaryProviderId,
      fallbackProviderId,
      fallbackModelId,
    );

    return NextResponse.json({ config });
  } catch (error) {
    logger.error(
      'Failed to update task config',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to update task config' },
      { status: 500 }
    );
  }
}
