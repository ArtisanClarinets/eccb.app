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
import { PROMPT_VERSION } from '@/lib/smart-upload/prompts';

export interface LLMRuntimeConfig {
  provider: LLMProviderValue;
  endpointUrl: string;
  visionModel: string;
  verificationModel: string;
  /** Adjudicator (3rd pass) model — defaults to verificationModel */
  adjudicatorModel: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  customApiKey: string;
  confidenceThreshold: number;
  twoPassEnabled: boolean;
  visionSystemPrompt?: string;
  verificationSystemPrompt?: string;
  /** Prompt for the header-labelling cheap-model pass */
  headerLabelPrompt?: string;
  /** Prompt for the adjudicator 3rd pass */
  adjudicatorPrompt?: string;
  rateLimit: number;
  autoApproveThreshold: number;
  skipParseThreshold: number;
  maxPages: number;
  maxFileSizeMb: number;
  maxConcurrent: number;
  allowedMimeTypes: string[];
  enableFullyAutonomousMode: boolean;
  autonomousApprovalThreshold: number;
  visionModelParams: Record<string, unknown>;
  verificationModelParams: Record<string, unknown>;
  promptVersion?: string;
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
  // Behaviour — smart_upload_* are the canonical keys; legacy llm_* honoured as fallback
  'smart_upload_confidence_threshold',
  'smart_upload_auto_approve_threshold',
  'smart_upload_rate_limit_rpm',
  'smart_upload_skip_parse_threshold',
  'smart_upload_max_concurrent',
  'smart_upload_max_pages',
  'smart_upload_max_file_size_mb',
  'smart_upload_allowed_mime_types',
  'smart_upload_enable_autonomous_mode',
  'smart_upload_autonomous_approval_threshold',
  'llm_adjudicator_model',
  'llm_two_pass_enabled',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_header_label_prompt',
  'llm_adjudicator_prompt',
  // Legacy behaviour keys
  'llm_confidence_threshold',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  // Model params
  'vision_model_params',
  'verification_model_params',
  // Legacy model param keys
  'llm_vision_model_params',
  'llm_verification_model_params',
  // Prompt version
  'llm_prompt_version',
] as const;

function parseJsonParam(raw: string | undefined): Record<string, unknown> {
  try {
    if (!raw || raw.trim() === '') return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseMimeTypes(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return ['application/pdf'];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['application/pdf'];

    const mimeTypes = parsed.filter((entry): entry is string => typeof entry === 'string');
    return mimeTypes.length > 0 ? mimeTypes : ['application/pdf'];
  } catch {
    return ['application/pdf'];
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
    adjudicatorModel:
      db['llm_adjudicator_model'] ||
      (provider === 'openai' ? 'gpt-4o' :
       provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
       verificationModel),
    openaiApiKey: db['llm_openai_api_key'] || process.env.LLM_OPENAI_API_KEY || '',
    anthropicApiKey: db['llm_anthropic_api_key'] || process.env.LLM_ANTHROPIC_API_KEY || '',
    openrouterApiKey: db['llm_openrouter_api_key'] || process.env.LLM_OPENROUTER_API_KEY || '',
    geminiApiKey: db['llm_gemini_api_key'] || process.env.LLM_GEMINI_API_KEY || '',
    customApiKey: db['llm_custom_api_key'] || process.env.LLM_CUSTOM_API_KEY || '',
    // Prefer smart_upload_* canonical keys, fall back to legacy llm_* keys
    confidenceThreshold: Number(
      db['smart_upload_confidence_threshold'] ||
      db['llm_confidence_threshold'] ||
      70
    ),
    twoPassEnabled: (db['llm_two_pass_enabled'] ?? 'true') === 'true',
    visionSystemPrompt: db['llm_vision_system_prompt'] || undefined,
    verificationSystemPrompt: db['llm_verification_system_prompt'] || undefined,
    headerLabelPrompt: db['llm_header_label_prompt'] || undefined,
    adjudicatorPrompt: db['llm_adjudicator_prompt'] || undefined,
    rateLimit: Number(
      db['smart_upload_rate_limit_rpm'] ||
      db['llm_rate_limit_rpm'] ||
      15
    ),
    autoApproveThreshold: Number(
      db['smart_upload_auto_approve_threshold'] ||
      db['llm_auto_approve_threshold'] ||
      90
    ),
    skipParseThreshold: Number(
      db['smart_upload_skip_parse_threshold'] ||
      db['llm_skip_parse_threshold'] ||
      60
    ),
    maxPages: Number(db['smart_upload_max_pages'] ?? 20),
    maxFileSizeMb: Number(db['smart_upload_max_file_size_mb'] ?? 50),
    maxConcurrent: Number(db['smart_upload_max_concurrent'] ?? 3),
    allowedMimeTypes: parseMimeTypes(db['smart_upload_allowed_mime_types']),
    enableFullyAutonomousMode: (db['smart_upload_enable_autonomous_mode'] ?? 'false') === 'true',
    autonomousApprovalThreshold: Number(db['smart_upload_autonomous_approval_threshold'] ?? 95),
    visionModelParams,
    verificationModelParams,
    promptVersion: db['llm_prompt_version'] || PROMPT_VERSION,
  };
}

/**
 * Alias for loadLLMConfig — reads canonical smart_upload_* settings.
 * Workers should call this instead of loadLLMConfig.
 */
export async function loadSmartUploadRuntimeConfig(): Promise<LLMRuntimeConfig> {
  return loadLLMConfig();
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
