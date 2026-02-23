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
// Schema
// =============================================================================

const SMART_UPLOAD_SETTING_KEYS = [
  'llm_provider',
  'llm_ollama_endpoint',
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_custom_base_url',
  'llm_custom_api_key',
  'llm_vision_model',
  'llm_verification_model',
  'llm_confidence_threshold',
  'llm_two_pass_enabled',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  'llm_vision_model_params',
  'llm_verification_model_params',
] as const;

type SmartUploadSettingKey = typeof SMART_UPLOAD_SETTING_KEYS[number];

const settingsSchema = z.record(z.string(), z.string());

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

    const settings = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value ?? '';
      return acc;
    }, {});

    // Mask sensitive keys in response
    const masked = { ...settings };
    const sensitiveKeys: SmartUploadSettingKey[] = [
      'llm_openai_api_key',
      'llm_anthropic_api_key',
      'llm_openrouter_api_key',
      'llm_custom_api_key',
    ];
    for (const key of sensitiveKeys) {
      if (masked[key]) {
        masked[key] = '***';
      }
    }

    return NextResponse.json({ settings: masked });
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
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Only persist recognised keys
    const updates = parsed.data;
    const allowedKeys = new Set<string>(SMART_UPLOAD_SETTING_KEYS);
    const toSave = Object.entries(updates).filter(([key]) => allowedKeys.has(key));

    if (toSave.length === 0) {
      return NextResponse.json({ error: 'No valid settings keys provided' }, { status: 400 });
    }

    // Upsert all settings in a transaction
    await prisma.$transaction(
      toSave.map(([key, value]) =>
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
      newValues: { keys: toSave.map(([k]) => k) },
    });

    logger.info('Smart upload settings updated', {
      userId: session.user.id,
      keys: toSave.map(([k]) => k),
    });

    return NextResponse.json({ success: true });
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
