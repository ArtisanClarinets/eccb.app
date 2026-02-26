// src/lib/smart-upload/bootstrap.ts
// ============================================================
// Bootstrap Smart Upload settings from DB, with defaults.
// Ensures prompts and core settings are always present.
// ============================================================

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  SMART_UPLOAD_SETTING_KEYS,
  type ProviderValue,
  getApiKeyFieldForProvider,
  providerRequiresApiKey,
  maskSecrets,
  SMART_UPLOAD_SCHEMA_VERSION,
} from './schema';
import {
  getDefaultPromptsRecord,
  promptsNeedReset,
  PROMPT_VERSION,
} from './prompts';
import { LLM_PROVIDERS } from '@/lib/llm/providers';

// =============================================================================
// Bootstrap Configuration
// =============================================================================

interface BootstrapOptions {
  /** Whether to reset prompts to defaults even if they exist */
  forceResetPrompts?: boolean;
  /** User ID performing the bootstrap (for audit) */
  updatedBy?: string;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_NUMERIC_SETTINGS: Record<string, string> = {
  smart_upload_confidence_threshold: '70',
  smart_upload_auto_approve_threshold: '90',
  smart_upload_rate_limit_rpm: '15',
  smart_upload_max_concurrent: '3',
  smart_upload_max_pages: '20',
  smart_upload_max_file_size_mb: '50',
  smart_upload_allowed_mime_types: JSON.stringify(['application/pdf']),
  llm_two_pass_enabled: 'true',
  // Autonomy settings
  smart_upload_enable_autonomous_mode: 'false',
  smart_upload_autonomous_approval_threshold: '95',
};

const DEFAULT_JSON_SETTINGS: Record<string, string> = {
  vision_model_params: JSON.stringify({ temperature: 0.1, max_tokens: 4096 }),
  verification_model_params: JSON.stringify({ temperature: 0.1, max_tokens: 4096 }),
};

// =============================================================================
// Bootstrap Logic
// =============================================================================

/**
 * Bootstrap Smart Upload settings to ensure all required fields exist in DB.
 * This should be called on application startup.
 */
export async function bootstrapSmartUploadSettings(
  options: BootstrapOptions = {}
): Promise<{ initialized: boolean; actions: string[] }> {
  const actions: string[] = [];
  
  try {
    // 1. Load existing settings
    const existingRows = await prisma.systemSetting.findMany({
      where: { key: { in: [...SMART_UPLOAD_SETTING_KEYS] } },
    });
    
    const existingSettings: Record<string, string> = {};
    for (const row of existingRows) {
      if (row.value !== null && row.value !== undefined) {
        existingSettings[row.key] = row.value;
      }
    }
    
    // 2. Initialize prompts if missing or forced
    const needsPromptInit =
      options.forceResetPrompts || promptsNeedReset(existingSettings);
    
    if (needsPromptInit) {
      const defaultPrompts = getDefaultPromptsRecord();
      for (const [key, value] of Object.entries(defaultPrompts)) {
        await upsertSetting(key, value, options.updatedBy);
        actions.push(`initialized ${key}`);
      }
    }
    
    // 3. Initialize numeric defaults if missing
    for (const [key, value] of Object.entries(DEFAULT_NUMERIC_SETTINGS)) {
      if (!(key in existingSettings)) {
        await upsertSetting(key, value, options.updatedBy);
        actions.push(`initialized ${key}`);
      }
    }
    
    // 4. Initialize JSON defaults if missing
    for (const [key, value] of Object.entries(DEFAULT_JSON_SETTINGS)) {
      if (!(key in existingSettings)) {
        await upsertSetting(key, value, options.updatedBy);
        actions.push(`initialized ${key}`);
      }
    }
    
    // 5. Initialize provider if missing
    if (!existingSettings.llm_provider) {
      await upsertSetting('llm_provider', 'ollama', options.updatedBy);
      actions.push('initialized llm_provider to ollama');
    }
    
    // 6. Initialize models for the selected provider if missing
    const provider = (existingSettings.llm_provider || 'ollama') as ProviderValue;
    const providerMeta = LLM_PROVIDERS.find((p) => p.value === provider);
    
    if (providerMeta) {
      if (!existingSettings.llm_vision_model) {
        await upsertSetting('llm_vision_model', providerMeta.defaultVisionModel, options.updatedBy);
        actions.push(`initialized llm_vision_model to ${providerMeta.defaultVisionModel}`);
      }
      
      if (!existingSettings.llm_verification_model) {
        await upsertSetting(
          'llm_verification_model',
          providerMeta.defaultVerificationModel,
          options.updatedBy
        );
        actions.push(`initialized llm_verification_model to ${providerMeta.defaultVerificationModel}`);
      }
    }
    
    // 7. Initialize schema version if missing
    if (!existingSettings.smart_upload_schema_version) {
      await upsertSetting('smart_upload_schema_version', SMART_UPLOAD_SCHEMA_VERSION, options.updatedBy);
      actions.push(`initialized schema version to ${SMART_UPLOAD_SCHEMA_VERSION}`);
    }
    
    // 8. Initialize endpoint for custom provider
    if (provider === 'custom' && !existingSettings.llm_endpoint_url) {
      await upsertSetting('llm_endpoint_url', '', options.updatedBy);
      actions.push('initialized empty endpoint_url for custom provider');
    }

    // 9. Migration bridge: copy legacy key values to canonical smart_upload_* keys
    const legacyMigrations: Array<[string, string]> = [
      ['llm_auto_approve_threshold', 'smart_upload_auto_approve_threshold'],
    ];
    for (const [legacyKey, newKey] of legacyMigrations) {
      const legacyValue = existingSettings[legacyKey];
      if (legacyValue && !existingSettings[newKey]) {
        await upsertSetting(newKey, legacyValue, options.updatedBy);
        actions.push(`migrated ${legacyKey} → ${newKey}`);
      }
    }
    
    if (actions.length > 0) {
      logger.info('Smart Upload settings bootstrapped', {
        actions,
        provider,
      });
    }
    
    return { initialized: true, actions };
  } catch (error) {
    logger.error('Failed to bootstrap Smart Upload settings', { error });
    throw error;
  }
}

/**
 * Reset prompts to default values
 */
export async function resetPromptsToDefaults(
  updatedBy?: string
): Promise<{ success: boolean; resetKeys: string[] }> {
  try {
    const defaultPrompts = getDefaultPromptsRecord();
    const resetKeys: string[] = [];
    
    for (const [key, value] of Object.entries(defaultPrompts)) {
      await upsertSetting(key, value, updatedBy);
      resetKeys.push(key);
    }
    
    logger.info('Smart Upload prompts reset to defaults', {
      resetKeys,
      version: PROMPT_VERSION,
    });
    
    return { success: true, resetKeys };
  } catch (error) {
    logger.error('Failed to reset prompts', { error });
    throw error;
  }
}

/**
 * Load Smart Upload settings from database
 */
export async function loadSmartUploadSettingsFromDB(): Promise<{
  settings: Record<string, string>;
  masked: Record<string, string>;
}> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...SMART_UPLOAD_SETTING_KEYS] } },
  });
  
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null && row.value !== undefined) {
      settings[row.key] = row.value;
    }
  }
  
  return {
    settings,
    masked: maskSecrets(settings),
  };
}

/**
 * Check if Smart Upload is properly configured
 */
export async function isSmartUploadConfigured(): Promise<{
  configured: boolean;
  missing: string[];
  provider?: string;
}> {
  const { settings } = await loadSmartUploadSettingsFromDB();
  const missing: string[] = [];
  
  // Check provider
  if (!settings.llm_provider) {
    missing.push('llm_provider');
  }
  
  const provider = settings.llm_provider as ProviderValue | undefined;
  
  // Check API key for non-local providers
  if (provider && providerRequiresApiKey(provider)) {
    const keyField = getApiKeyFieldForProvider(provider);
    const keyValue = settings[keyField];
    if (!keyValue || keyValue.trim() === '') {
      missing.push(keyField);
    }
  }
  
  // Check models
  if (!settings.llm_vision_model) {
    missing.push('llm_vision_model');
  }
  if (!settings.llm_verification_model) {
    missing.push('llm_verification_model');
  }
  
  // Check prompts
  if (!settings.llm_vision_system_prompt) {
    missing.push('llm_vision_system_prompt');
  }
  if (!settings.llm_verification_system_prompt) {
    missing.push('llm_verification_system_prompt');
  }
  
  return {
    configured: missing.length === 0,
    missing,
    provider,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

async function upsertSetting(
  key: string,
  value: string,
  updatedBy?: string
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value,
      updatedBy: updatedBy || null,
    },
    update: {
      value,
      updatedBy: updatedBy || undefined,
    },
  });
}
