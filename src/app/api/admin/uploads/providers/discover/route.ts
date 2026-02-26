/**
 * POST /api/admin/uploads/providers/discover
 *
 * Auto-discovers available free / local LLM providers and writes recommended
 * settings to the SystemSettings table.
 *
 * Checks (in priority order):
 *  1. Ollama  — localhost:11434
 *  2. Gemini  — if GEMINI_API_KEY env var (or DB key) is set
 *  3. OpenRouter — if OPENROUTER_API_KEY env var (or DB key) is set
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';

// =============================================================================
// Constants
// =============================================================================

const OLLAMA_DEFAULT_HOST = 'http://localhost:11434';
const OLLAMA_TAGS_PATH = '/api/tags';
const GEMINI_LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models?key=';
const OPENROUTER_FREE_URL = 'https://openrouter.ai/api/v1/models';

const DEFAULT_OLLAMA_VISION_MODEL = 'llava:latest';
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-1.5-flash';
const DEFAULT_OPENROUTER_FREE_VISION_MODEL = 'google/gemma-3-27b-it:free';

// =============================================================================
// Discovery Helpers
// =============================================================================

interface DiscoveryAction {
  provider: string;
  available: boolean;
  models?: string[];
  settingsWritten: string[];
  note?: string;
}

async function discoverOllama(): Promise<DiscoveryAction> {
  try {
    const res = await fetch(`${OLLAMA_DEFAULT_HOST}${OLLAMA_TAGS_PATH}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const modelNames = (data.models ?? []).map((m) => m.name);

    // Pick best vision model available
    const visionModel =
      modelNames.find((n) => /llava|bakllava|moondream|cogvlm|minicpm-v|qwen2.*vl/i.test(n)) ??
      (modelNames.length > 0 ? modelNames[0] : DEFAULT_OLLAMA_VISION_MODEL);

    return {
      provider: 'ollama',
      available: true,
      models: modelNames,
      settingsWritten: ['llm_provider', 'llm_endpoint_url', 'llm_vision_model', 'llm_verification_model'],
      note: `Discovered ${modelNames.length} models on ${OLLAMA_DEFAULT_HOST}. Using "${visionModel}" for vision.`,
    };
  } catch {
    return { provider: 'ollama', available: false, settingsWritten: [] };
  }
}

async function discoverGemini(apiKey: string | undefined): Promise<DiscoveryAction> {
  if (!apiKey) return { provider: 'gemini', available: false, settingsWritten: [], note: 'No API key found' };
  try {
    const res = await fetch(`${GEMINI_LIST_URL}${apiKey}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const visionModels = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /flash|pro/i.test(m.name))
      .map((m) => m.name.replace('models/', ''));
    const visionModel = visionModels.find((m) => m.includes('flash')) ?? DEFAULT_GEMINI_VISION_MODEL;
    return {
      provider: 'gemini',
      available: true,
      models: visionModels,
      settingsWritten: ['llm_provider', 'llm_vision_model', 'llm_verification_model', 'llm_gemini_api_key'],
      note: `Gemini key valid. Selected "${visionModel}".`,
    };
  } catch {
    return { provider: 'gemini', available: false, settingsWritten: [], note: 'Gemini key invalid or unreachable' };
  }
}

async function discoverOpenRouter(apiKey: string | undefined): Promise<DiscoveryAction> {
  if (!apiKey) return { provider: 'openrouter', available: false, settingsWritten: [], note: 'No API key found' };
  try {
    const res = await fetch(OPENROUTER_FREE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string; pricing?: { prompt: string } }> };
    const freeModels = (data.data ?? [])
      .filter((m) => m.pricing?.prompt === '0' || m.id.endsWith(':free'))
      .map((m) => m.id);
    const visionModel = freeModels.find((m) => /gemma|llama.*vision|llava|qwen.*vl/i.test(m)) ?? DEFAULT_OPENROUTER_FREE_VISION_MODEL;
    return {
      provider: 'openrouter',
      available: true,
      models: freeModels,
      settingsWritten: ['llm_provider', 'llm_vision_model', 'llm_verification_model', 'llm_openrouter_api_key'],
      note: `OpenRouter key valid. ${freeModels.length} free models found. Using "${visionModel}".`,
    };
  } catch {
    return { provider: 'openrouter', available: false, settingsWritten: [], note: 'OpenRouter key invalid or unreachable' };
  }
}

// =============================================================================
// Upsert Helper
// =============================================================================

async function upsertSetting(key: string, value: string, updatedBy: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requirePermission('system:settings');

    // Read existing API keys from DB
    const existingRows = await prisma.systemSetting.findMany({
      where: { key: { in: ['llm_gemini_api_key', 'llm_openrouter_api_key', 'llm_provider'] } },
    });
    const existing: Record<string, string> = {};
    for (const row of existingRows) {
      if (row.value) existing[row.key] = row.value;
    }

    const geminiKey = existing.llm_gemini_api_key || process.env.GEMINI_API_KEY;
    const openrouterKey = existing.llm_openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const currentProvider = existing.llm_provider;

    // Run all discovery checks in parallel
    const [ollamaResult, geminiResult, openrouterResult] = await Promise.all([
      discoverOllama(),
      discoverGemini(geminiKey),
      discoverOpenRouter(openrouterKey),
    ]);

    const allResults = [ollamaResult, geminiResult, openrouterResult];
    const availableProviders = allResults.filter((r) => r.available);

    logger.info('Provider discovery results', {
      userId: session.user.id,
      available: availableProviders.map((r) => r.provider),
    });

    // Only write settings if no provider is configured yet (or forced via query param)
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const shouldWrite = !currentProvider || force;

    const written: string[] = [];
    if (shouldWrite && availableProviders.length > 0) {
      // Priority: Ollama (free, local, no data leaves the machine) > Gemini > OpenRouter
      const best = ollamaResult.available ? ollamaResult
        : geminiResult.available ? geminiResult
        : openrouterResult;

      if (best.available) {
        const by = session.user.id;

        if (best.provider === 'ollama') {
          const model = best.models?.[0] ?? DEFAULT_OLLAMA_VISION_MODEL;
          const visionModel = best.models?.find((n) => /llava|bakllava|moondream/i.test(n)) ?? model;
          await upsertSetting('llm_provider', 'ollama', by);
          await upsertSetting('llm_endpoint_url', OLLAMA_DEFAULT_HOST, by);
          await upsertSetting('llm_vision_model', visionModel, by);
          await upsertSetting('llm_verification_model', visionModel, by);
          written.push('llm_provider', 'llm_endpoint_url', 'llm_vision_model', 'llm_verification_model');
        } else if (best.provider === 'gemini') {
          const visionModel = best.models?.find((m) => m.includes('flash')) ?? DEFAULT_GEMINI_VISION_MODEL;
          await upsertSetting('llm_provider', 'gemini', by);
          await upsertSetting('llm_vision_model', visionModel, by);
          await upsertSetting('llm_verification_model', visionModel, by);
          if (geminiKey) await upsertSetting('llm_gemini_api_key', geminiKey, by);
          written.push('llm_provider', 'llm_vision_model', 'llm_verification_model');
        } else if (best.provider === 'openrouter') {
          const visionModel = best.models?.find((m) => /gemma|llava|qwen.*vl/i.test(m)) ?? DEFAULT_OPENROUTER_FREE_VISION_MODEL;
          await upsertSetting('llm_provider', 'openrouter', by);
          await upsertSetting('llm_vision_model', visionModel, by);
          await upsertSetting('llm_verification_model', visionModel, by);
          if (openrouterKey) await upsertSetting('llm_openrouter_api_key', openrouterKey, by);
          written.push('llm_provider', 'llm_vision_model', 'llm_verification_model');
        }
      }
    }

    return NextResponse.json({
      success: true,
      discovered: allResults,
      settingsWritten: written,
      message: availableProviders.length === 0
        ? 'No providers discovered. Please configure manually.'
        : shouldWrite && written.length > 0
          ? `Auto-configured "${availableProviders[0].provider}" as the active provider.`
          : 'Discovery complete. Settings not changed (provider already configured — use ?force=true to override).',
    });
  } catch (error) {
    logger.error('Provider discovery failed', { error });
    return NextResponse.json({ error: 'Discovery failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
