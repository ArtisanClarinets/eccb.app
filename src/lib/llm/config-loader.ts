// src/lib/llm/config-loader.ts
// ============================================================
// Canonical LLM configuration loader.
// Reads the authoritative `llm_endpoint_url` key from the DB,
// falls back to provider-specific defaults when not set.
// SECURITY: Provider keys are strictly isolated.
// ============================================================

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getDefaultEndpointForProvider } from './providers';
import type { LLMProviderValue } from './providers';

export interface LLMRuntimeConfig {
  provider: LLMProviderValue;
  endpointUrl: string;
  visionModel: string;
  verificationModel: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  customApiKey: string;
  confidenceThreshold: number;
  twoPassEnabled: boolean;
  visionSystemPrompt?: string;
  verificationSystemPrompt?: string;
  rateLimit: number;
  autoApproveThreshold: number;
  skipParseThreshold: number;
  visionModelParams: Record<string, unknown>;
  verificationModelParams: Record<string, unknown>;
}

const DB_KEYS = [
  'llm_provider',
  'llm_endpoint_url',
  // Legacy keys (still honoured as fallback)
  'llm_ollama_endpoint',
  'llm_custom_base_url',
  // API keys
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
  // Models
  'llm_vision_model',
  'llm_verification_model',
  // Behaviour
  'llm_confidence_threshold',
  'llm_two_pass_enabled',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  // Model params
  'vision_model_params',
  'verification_model_params',
  // Legacy model param keys
  'llm_vision_model_params',
  'llm_verification_model_params',
] as const;

function parseJsonParam(raw: string | undefined): Record<string, unknown> {
  try {
    if (!raw || raw.trim() === '') return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Load LLM configuration from the database with environment variable fallback.
 * Call once per job/request; cache the result if calling multiple times.
 */
export async function loadLLMConfig(): Promise<LLMRuntimeConfig> {
  let db: Record<string, string> = {};

  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...DB_KEYS] } },
      select: { key: true, value: true },
    });
    db = rows.reduce<Record<string, string>>((acc, r) => {
      if (r.value !== null && r.value !== undefined) acc[r.key] = r.value;
      return acc;
    }, {});
  } catch (err) {
    logger.warn('loadLLMConfig: DB unavailable, using env vars only', { err });
  }

  const provider = (
    db['llm_provider'] ||
    process.env.LLM_PROVIDER ||
    'ollama'
  ) as LLMProviderValue;

  // ── Endpoint resolution ──────────────────────────────────────────────────
  // Priority: explicit DB value → legacy DB key → env var → provider default
  let endpointUrl = db['llm_endpoint_url'] || '';

  if (!endpointUrl) {
    // Legacy / provider-specific env fallbacks
    switch (provider) {
      case 'ollama':
        endpointUrl =
          process.env.LLM_OLLAMA_ENDPOINT ||
          db['llm_ollama_endpoint'] ||
          getDefaultEndpointForProvider('ollama');
        break;
      case 'custom':
        endpointUrl =
          process.env.LLM_CUSTOM_BASE_URL ||
          db['llm_custom_base_url'] ||
          '';
        break;
      case 'openai':
        endpointUrl =
          process.env.LLM_OPENAI_ENDPOINT ||
          getDefaultEndpointForProvider('openai');
        break;
      default:
        endpointUrl = getDefaultEndpointForProvider(provider);
    }
  }

  // ── Models ───────────────────────────────────────────────────────────────
  const visionModel =
    db['llm_vision_model'] ||
    process.env.LLM_VISION_MODEL ||
    'llama3.2-vision';

  const verificationModel =
    db['llm_verification_model'] ||
    process.env.LLM_VERIFICATION_MODEL ||
    'qwen2.5:7b';

  // ── Model params — prefer new keys, fall back to legacy prefixed keys ────
  const visionModelParams = parseJsonParam(
    db['vision_model_params'] || db['llm_vision_model_params']
  );
  const verificationModelParams = parseJsonParam(
    db['verification_model_params'] || db['llm_verification_model_params']
  );

  return {
    provider,
    endpointUrl,
    visionModel,
    verificationModel,
    openaiApiKey: db['llm_openai_api_key'] || process.env.LLM_OPENAI_API_KEY || '',
    anthropicApiKey: db['llm_anthropic_api_key'] || process.env.LLM_ANTHROPIC_API_KEY || '',
    openrouterApiKey: db['llm_openrouter_api_key'] || process.env.LLM_OPENROUTER_API_KEY || '',
    geminiApiKey: db['llm_gemini_api_key'] || process.env.LLM_GEMINI_API_KEY || '',
    customApiKey: db['llm_custom_api_key'] || process.env.LLM_CUSTOM_API_KEY || '',
    confidenceThreshold: Number(db['llm_confidence_threshold'] ?? 70),
    twoPassEnabled: (db['llm_two_pass_enabled'] ?? 'true') === 'true',
    visionSystemPrompt: db['llm_vision_system_prompt'] || undefined,
    verificationSystemPrompt: db['llm_verification_system_prompt'] || undefined,
    rateLimit: Number(db['llm_rate_limit_rpm'] ?? 15),
    autoApproveThreshold: Number(db['llm_auto_approve_threshold'] ?? 90),
    skipParseThreshold: Number(db['llm_skip_parse_threshold'] ?? 60),
    visionModelParams,
    verificationModelParams,
  };
}

/**
 * Convert LLMRuntimeConfig to the LLMConfig interface expected by adapters.
 * SECURITY: Only the correct provider key is included per call; others are omitted.
 */
export function runtimeToAdapterConfig(cfg: LLMRuntimeConfig) {
  return {
    llm_provider: cfg.provider,
    llm_endpoint_url: cfg.endpointUrl,
    llm_vision_model: cfg.visionModel,
    llm_verification_model: cfg.verificationModel,
    llm_openai_api_key: cfg.openaiApiKey,
    llm_anthropic_api_key: cfg.anthropicApiKey,
    llm_openrouter_api_key: cfg.openrouterApiKey,
    llm_gemini_api_key: cfg.geminiApiKey,
    llm_custom_api_key: cfg.customApiKey,
  } as const;
}
