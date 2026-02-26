// src/lib/smart-upload/schema.ts
// ============================================================
// Canonical Smart Upload configuration schema.
// Single source of truth for validation across UI/API/Runtime.
// ============================================================

import { z } from 'zod';

// =============================================================================
// Version Constants
// =============================================================================

export const SMART_UPLOAD_SCHEMA_VERSION = '1.0.0';
export const PROMPT_VERSION = '1.0.0';

// =============================================================================
// Provider-specific validation
// =============================================================================

// Create provider enum from the existing values array
const providerTuple = ['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom'] as const;
export const ProviderValueSchema = z.enum(providerTuple);
export type ProviderValue = z.infer<typeof ProviderValueSchema>;

// =============================================================================
// Core Settings Schema
// =============================================================================

/**
 * Smart Upload settings keys that are stored in SystemSettings
 */
export const SMART_UPLOAD_SETTING_KEYS = [
  // Core settings
  'llm_provider',
  'llm_endpoint_url',
  'llm_vision_model',
  'llm_verification_model',
  
  // API Keys (one per provider)
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
  
  // Prompts (source of truth)
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_prompt_version',
  
  // Behavior settings
  'smart_upload_confidence_threshold',
  'smart_upload_auto_approve_threshold',
  'smart_upload_rate_limit_rpm',
  'smart_upload_max_concurrent',
  'smart_upload_max_pages',
  'smart_upload_max_file_size_mb',
  'smart_upload_allowed_mime_types',
  'llm_two_pass_enabled',
  
  // Model parameters (JSON)
  'vision_model_params',
  'verification_model_params',
  
  // Metadata
  'smart_upload_schema_version',
] as const;

export type SmartUploadSettingKey = typeof SMART_UPLOAD_SETTING_KEYS[number];

// =============================================================================
// JSON Parameter Schemas
// =============================================================================

// Simple string schemas for form compatibility
const JsonParamsSchema = z.string().optional();

const MimeTypesSchema = z.string().optional();

// =============================================================================
// Main Settings Schema
// =============================================================================

/**
 * Strict schema for Smart Upload settings validation.
 * Used by API, UI, and runtime.
 */
export const SmartUploadSettingsSchema = z.object({
  // Provider selection
  llm_provider: ProviderValueSchema,
  
  // Endpoint (required for custom, optional for others)
  llm_endpoint_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  
  // Models (required)
  llm_vision_model: z.string().min(1, 'Vision model is required'),
  llm_verification_model: z.string().min(1, 'Verification model is required'),
  
  // API Keys (provider-specific, at least one must be set for non-local providers)
  llm_openai_api_key: z.string().optional(),
  llm_anthropic_api_key: z.string().optional(),
  llm_openrouter_api_key: z.string().optional(),
  llm_gemini_api_key: z.string().optional(),
  llm_custom_api_key: z.string().optional(),
  
  // Prompts (required, will be populated with defaults if empty)
  llm_vision_system_prompt: z.string().min(1, 'Vision system prompt is required'),
  llm_verification_system_prompt: z.string().min(1, 'Verification system prompt is required'),
  llm_prompt_version: z.string().default(PROMPT_VERSION),
  
  // Behavior settings with defaults
  smart_upload_confidence_threshold: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(0, Math.min(100, num));
    })
    .default(70),
  
  smart_upload_auto_approve_threshold: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(0, Math.min(100, num));
    })
    .default(90),
  
  smart_upload_rate_limit_rpm: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(1, Math.min(1000, num));
    })
    .default(15),
  
  smart_upload_max_concurrent: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(1, Math.min(50, num));
    })
    .default(3),
  
  smart_upload_max_pages: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(1, Math.min(100, num));
    })
    .default(20),
  
  smart_upload_max_file_size_mb: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const num = typeof v === 'string' ? Number(v) : v;
      return Math.max(1, Math.min(500, num));
    })
    .default(50),
  
  smart_upload_allowed_mime_types: MimeTypesSchema,
  llm_two_pass_enabled: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(true),
  
  // Model parameters
  vision_model_params: JsonParamsSchema,
  verification_model_params: JsonParamsSchema,
  
  // Schema version for migrations
  smart_upload_schema_version: z.string().default(SMART_UPLOAD_SCHEMA_VERSION),
});

export type SmartUploadSettings = z.infer<typeof SmartUploadSettingsSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Get the API key field name for a provider
 */
export function getApiKeyFieldForProvider(provider: ProviderValue): string {
  const mapping: Record<ProviderValue, string> = {
    ollama: '',
    openai: 'llm_openai_api_key',
    anthropic: 'llm_anthropic_api_key',
    gemini: 'llm_gemini_api_key',
    openrouter: 'llm_openrouter_api_key',
    custom: 'llm_custom_api_key',
  };
  return mapping[provider] || '';
}

/**
 * Check if a provider requires an API key
 */
export function providerRequiresApiKey(provider: ProviderValue): boolean {
  return provider !== 'ollama';
}

/**
 * Check if a provider requires an endpoint URL
 */
export function providerRequiresEndpoint(provider: ProviderValue): boolean {
  return provider === 'custom';
}

/**
 * Validate that the API key is set for the selected provider
 */
export function validateProviderApiKey(
  provider: ProviderValue,
  settings: Partial<SmartUploadSettings>
): { valid: boolean; error?: string } {
  if (!providerRequiresApiKey(provider)) {
    return { valid: true };
  }

  const keyField = getApiKeyFieldForProvider(provider);
  const keyValue = settings[keyField as keyof SmartUploadSettings];

  if (!keyValue || (typeof keyValue === 'string' && keyValue.trim() === '')) {
    return {
      valid: false,
      error: `${provider} requires an API key. Please configure ${keyField}.`,
    };
  }

  return { valid: true };
}

/**
 * Validate that the endpoint URL is set if required
 */
export function validateProviderEndpoint(
  provider: ProviderValue,
  endpointUrl?: string
): { valid: boolean; error?: string } {
  if (!providerRequiresEndpoint(provider)) {
    return { valid: true };
  }

  if (!endpointUrl || endpointUrl.trim() === '') {
    return {
      valid: false,
      error: 'Custom provider requires an endpoint URL.',
    };
  }

  try {
    new URL(endpointUrl);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Endpoint URL must be a valid URL.',
    };
  }
}

// =============================================================================
// Settings Transformation
// =============================================================================

/**
 * Convert database settings record to typed SmartUploadSettings
 */
export function dbRecordToSettings(record: Record<string, string>): SmartUploadSettings {
  return SmartUploadSettingsSchema.parse({
    ...record,
    // Ensure required fields have defaults if missing
    llm_vision_system_prompt: record.llm_vision_system_prompt || '',
    llm_verification_system_prompt: record.llm_verification_system_prompt || '',
  });
}

/**
 * Convert SmartUploadSettings to database record format
 */
export function settingsToDbRecord(settings: SmartUploadSettings): Record<string, string> {
  const record: Record<string, string> = {};
  
  for (const key of SMART_UPLOAD_SETTING_KEYS) {
    const value = settings[key as keyof SmartUploadSettings];
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        record[key] = JSON.stringify(value);
      } else {
        record[key] = String(value);
      }
    }
  }
  
  return record;
}

// =============================================================================
// Secret Key Management
// =============================================================================

export const SECRET_KEYS: readonly string[] = [
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_gemini_api_key',
  'llm_custom_api_key',
];

/**
 * Mask secret values in API responses
 */
export function maskSecrets(record: Record<string, string>): Record<string, string> {
  const masked = { ...record };
  for (const key of SECRET_KEYS) {
    if (key in masked) {
      masked[key] = masked[key] ? '__SET__' : '__UNSET__';
    }
  }
  return masked;
}

/**
 * Merge new settings with existing, preserving secrets when masked
 */
export function mergeSettingsPreservingSecrets(
  existing: Record<string, string>,
  updates: Record<string, string>
): Record<string, string> {
  const merged = { ...existing };
  
  for (const [key, value] of Object.entries(updates)) {
    // Skip placeholder values
    if (value === '__SET__' || value === '***' || value === '******') {
      continue;
    }
    // Allow explicit clear
    if (value === '__CLEAR__') {
      merged[key] = '';
      continue;
    }
    merged[key] = value;
  }
  
  return merged;
}

// =============================================================================
// Validation Entry Point
// =============================================================================

/**
 * Full validation of Smart Upload settings
 */
export function validateSmartUploadSettings(
  settings: Partial<SmartUploadSettings>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Schema validation
  const schemaResult = SmartUploadSettingsSchema.safeParse(settings);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Provider-specific validation
  if (settings.llm_provider) {
    const apiKeyResult = validateProviderApiKey(settings.llm_provider, settings);
    if (!apiKeyResult.valid) {
      errors.push(apiKeyResult.error!);
    }

    const endpointResult = validateProviderEndpoint(
      settings.llm_provider,
      settings.llm_endpoint_url
    );
    if (!endpointResult.valid) {
      errors.push(endpointResult.error!);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
