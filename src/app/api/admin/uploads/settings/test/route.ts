import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { SYSTEM_CONFIG } from '@/lib/auth/permission-constants';
import { z } from 'zod';

// =============================================================================
// Schema
// =============================================================================

const testSchema = z.object({
  provider: z.string(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string(),
});

// =============================================================================
// POST /api/admin/uploads/settings/test
// =============================================================================

export async function POST(request: NextRequest) {
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
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { provider, endpoint, apiKey, model } = parsed.data;

    logger.info('Testing LLM connection', {
      userId: session.user.id,
      provider,
      model,
      endpoint: endpoint?.replace(/^(https?:\/\/[^/]+).*/, '$1'),
    });

    // Build the request depending on provider
    let testUrl: string;
    const testHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (provider) {
      case 'ollama': {
        const base = (endpoint || 'http://localhost:11434').replace(/\/$/, '');
        testUrl = `${base}/api/tags`;
        break;
      }

      case 'openai': {
        testUrl = 'https://api.openai.com/v1/models';
        if (apiKey) testHeaders['Authorization'] = `Bearer ${apiKey}`;
        break;
      }

      case 'anthropic': {
        testUrl = 'https://api.anthropic.com/v1/models';
        if (apiKey) {
          testHeaders['x-api-key'] = apiKey;
          testHeaders['anthropic-version'] = '2023-06-01';
        }
        break;
      }

      case 'gemini': {
        const key = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
        testUrl = `https://generativelanguage.googleapis.com/v1beta/models${key}`;
        break;
      }

      case 'openrouter': {
        testUrl = 'https://openrouter.ai/api/v1/models';
        if (apiKey) testHeaders['Authorization'] = `Bearer ${apiKey}`;
        break;
      }

      case 'custom': {
        const base = (endpoint || '').replace(/\/$/, '');
        if (!base) {
          return NextResponse.json(
            { ok: false, error: 'Custom base URL is required.' },
            { status: 400 }
          );
        }
        // Try a generic /models endpoint (works for most OpenAI-compat servers)
        testUrl = `${base}/models`;
        if (apiKey) testHeaders['Authorization'] = `Bearer ${apiKey}`;
        break;
      }

      default: {
        return NextResponse.json(
          { ok: false, error: `Unknown provider: ${provider}` },
          { status: 400 }
        );
      }
    }

    let response: Response;
    try {
      response = await fetch(testUrl, {
        method: 'GET',
        headers: testHeaders,
        signal: AbortSignal.timeout(10_000), // 10-second timeout
      });
    } catch (netErr) {
      const msg =
        netErr instanceof Error && netErr.name === 'TimeoutError'
          ? `Connection timed out after 10 seconds. Make sure the endpoint is reachable.`
          : `Network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`;
      return NextResponse.json({ ok: false, error: msg });
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const hint = response.status === 401
        ? ' — check your API key.'
        : response.status === 404
          ? ' — check the endpoint URL.'
          : '';
      return NextResponse.json({
        ok: false,
        error: `Server responded with ${response.status}${hint}`,
        detail: errBody.substring(0, 200),
      });
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully connected to ${provider} (model: ${model}).`,
    });
  } catch (error) {
    logger.error('LLM connection test failed', { error });
    return NextResponse.json(
      { ok: false, error: 'Internal server error during connection test.' },
      { status: 500 }
    );
  }
}

// =============================================================================
// OPTIONS
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
