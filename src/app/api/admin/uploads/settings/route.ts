import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/services/audit';
import { SYSTEM_CONFIG } from '@/lib/auth/permission-constants';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

// All Smart Upload setting keys - supports both new and legacy naming
const SMART_UPLOAD_SETTING_KEYS = [
  // New database-driven settings
  'llm_provider',
  'llm_endpoint_url',
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
  'llm_vision_model',
  'llm_verification_model',
  'smart_upload_confidence_threshold',
  'smart_upload_auto_approve_threshold',
  'smart_upload_rate_limit_rpm',
  'smart_upload_max_concurrent',
  'smart_upload_max_pages',
  'smart_upload_max_file_size_mb',
  'smart_upload_allowed_mime_types',
  'vision_model_params',
  'verification_model_params',
  // Legacy keys (for backward compatibility)
  'llm_ollama_endpoint',
  'llm_custom_base_url',
  'llm_confidence_threshold',
  'llm_two_pass_enabled',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_vision_model_params',
  'llm_verification_model_params',
] as const;

type SmartUploadSettingKey = typeof SMART_UPLOAD_SETTING_KEYS[number];

// Keys that contain secrets - these will be masked in GET responses
const SECRET_KEYS: SmartUploadSettingKey[] = [
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
];

// Keys that must contain valid JSON
const JSON_KEYS: SmartUploadSettingKey[] = [
  'smart_upload_allowed_mime_types',
  'vision_model_params',
  'verification_model_params',
  'llm_vision_model_params',
  'llm_verification_model_params',
];

// =============================================================================
// Schema
// =============================================================================

const settingUpdateSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const settingsUpdateSchema = z.object({
  settings: z.array(settingUpdateSchema),
});

// =============================================================================
// GET /api/admin/uploads/settings
// =============================================================================

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPermission = await checkUserPermission(session.user.id, SYSTEM_CONFIG);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...SMART_UPLOAD_SETTING_KEYS] } },
    });

    // Sanitize settings - mask secrets with __SET__ or __UNSET__
    const sanitizedSettings = rows.map((row) => {
      const isSecret = SECRET_KEYS.includes(row.key as SmartUploadSettingKey);
      return {
        ...row,
        value: isSecret
          ? (row.value ? '__SET__' : '__UNSET__')
          : row.value ?? '',
      };
    });

    return NextResponse.json({ settings: sanitizedSettings });
  } catch (error) {
    logger.error('Failed to fetch smart upload settings', { error });
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// =============================================================================
// PUT /api/admin/uploads/settings
// =============================================================================

export async function PUT(request: NextRequest) {
  // CSRF validation
  const csrfResult = validateCSRF(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: 'CSRF validation failed', reason: csrfResult.reason },
      { status: 403 }
    );
  }

  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPermission = await checkUserPermission(session.user.id, SYSTEM_CONFIG);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error }, { status: 400 });
    }

    const { settings } = parsed.data;
    const allowedKeys = new Set<string>(SMART_UPLOAD_SETTING_KEYS);
    const updates: Array<{ key: string; value: string }> = [];
    const skippedKeys: string[] = [];

    for (const { key, value } of settings) {
      // Skip if key is not allowed
      if (!allowedKeys.has(key)) {
        skippedKeys.push(key);
        continue;
      }

      // Reject placeholder values (frontend masking)
      if (value === '***' || value === '******' || value === '__SET__') {
        skippedKeys.push(key);
        continue; // Skip, preserve existing
      }

      // Handle clear instruction
      if (value === '__CLEAR__') {
        updates.push({ key, value: '' });
        continue;
      }

      // Validate JSON fields
      if (JSON_KEYS.includes(key as SmartUploadSettingKey)) {
        try {
          JSON.parse(value);
        } catch {
          return NextResponse.json(
            { error: `Invalid JSON for setting: ${key}` },
            { status: 400 }
          );
        }
      }

      // Validate numeric fields
      if (key.includes('threshold') || key.includes('limit') || key.includes('max_') || key.includes('rate_')) {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          return NextResponse.json(
            { error: `Invalid number for setting: ${key}` },
            { status: 400 }
          );
        }
      }

      updates.push({ key, value });
    }

    if (updates.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No valid settings to update',
        skipped: skippedKeys,
      });
    }

    // Upsert all settings in a transaction
    await prisma.$transaction(
      updates.map(({ key, value }) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: session.user.id },
          update: { value, updatedBy: session.user.id },
        })
      )
    );

    await auditLog({
      action: 'UPDATE_SMART_UPLOAD_SETTINGS',
      entityType: 'SETTING',
      entityId: 'smart_upload',
      newValues: { keys: updates.map(({ key }) => key) },
    });

    logger.info('Smart upload settings updated', {
      userId: session.user.id,
      keys: updates.map(({ key }) => key),
      skipped: skippedKeys,
    });

    return NextResponse.json({ 
      success: true,
      updated: updates.map(({ key }) => key),
      skipped: skippedKeys.length > 0 ? skippedKeys : undefined,
    });
  } catch (error) {
    logger.error('Failed to update smart upload settings', { error });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

// =============================================================================
// OPTIONS
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
