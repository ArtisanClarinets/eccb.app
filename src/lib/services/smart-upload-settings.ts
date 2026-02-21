/**
 * Smart Upload Settings Service
 *
 * Comprehensive service for managing Smart Upload settings, AI providers,
 * API keys, models, and audit logging.
 */

import { prisma, AIProvider, AIModel, TaskModelConfig, UploadTaskType } from '@/lib/db';
import { encryptApiKey, decryptApiKey, hashApiKey } from '@/lib/encryption';
import { getProviderConfig, PROVIDER_CONFIGS } from '@/lib/ai/provider-config';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface ProviderWithStatus {
  id: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  hasValidApiKey: boolean;
  capabilities: {
    vision: boolean;
    structuredOutput: boolean;
  } | null;
  defaultModel: string | null;
}

export interface ModelWithParameters {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  maxTokens: number | null;
  contextWindow: number | null;
  isDefault: boolean;
  isPreferred: boolean;
  isAvailable: boolean;
  lastFetched: Date | null;
  parameters: ParameterWithValues[];
}

export interface ParameterWithValues {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  paramType: string;
  defaultValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  stringDefault: string | null;
  allowedValues: unknown | null;
  userValue: number | null;
  userStringValue: string | null;
  isAdvanced: boolean;
  isVisible: boolean;
}

export interface SettingsStatus {
  smartUploadEnabled: boolean;
  settings: Record<string, string>;
  providers: ProviderWithStatus[];
}

// ============================================================================
// Feature Toggle Functions
// ============================================================================

/**
 * Check if Smart Upload feature is enabled
 */
export async function isSmartUploadEnabled(): Promise<boolean> {
  const setting = await prisma.smartUploadSetting.findUnique({
    where: { key: 'enabled' },
  });

  return setting?.value === 'true';
}

/**
 * Enable or disable Smart Upload feature
 */
export async function setSmartUploadEnabled(enabled: boolean, userId: string): Promise<void> {
  await prisma.smartUploadSetting.upsert({
    where: { key: 'enabled' },
    update: {
      value: enabled.toString(),
      updatedBy: userId,
    },
    create: {
      key: 'enabled',
      value: enabled.toString(),
      description: 'Master toggle for Smart Upload feature',
      category: 'feature',
      updatedBy: userId,
    },
  });

  await logAudit({
    entityType: 'SmartUploadSetting',
    entityId: 'enabled',
    action: enabled ? 'ENABLE' : 'DISABLE',
    newValue: enabled.toString(),
    userId,
  });
}

// ============================================================================
// Settings Management Functions
// ============================================================================

/**
 * Get a single setting by key
 */
export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.smartUploadSetting.findUnique({
    where: { key },
  });

  return setting?.value ?? null;
}

/**
 * Set a single setting
 */
export async function setSetting(
  key: string,
  value: string,
  userId: string,
  description?: string
): Promise<void> {
  const existing = await prisma.smartUploadSetting.findUnique({
    where: { key },
  });

  await prisma.smartUploadSetting.upsert({
    where: { key },
    update: {
      value,
      updatedBy: userId,
    },
    create: {
      key,
      value,
      description: description ?? null,
      category: 'general',
      updatedBy: userId,
    },
  });

  await logAudit({
    entityType: 'SmartUploadSetting',
    entityId: key,
    action: existing ? 'UPDATE' : 'CREATE',
    fieldName: 'value',
    oldValue: existing?.value ?? undefined,
    newValue: value,
    userId,
  });
}

/**
 * Get all settings as a key-value record
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await prisma.smartUploadSetting.findMany({
    orderBy: { key: 'asc' },
  });

  return settings.reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, string>);
}

// ============================================================================
// Provider Management Functions
// ============================================================================

/**
 * Get all AI providers
 */
export async function getProviders(): Promise<AIProvider[]> {
  return prisma.aIProvider.findMany({
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Get only enabled providers
 */
export async function getEnabledProviders(): Promise<AIProvider[]> {
  return prisma.aIProvider.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Enable or disable a provider
 */
export async function enableProvider(
  providerId: string,
  enabled: boolean,
  userId: string
): Promise<void> {
  const provider = await prisma.aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  await prisma.aIProvider.update({
    where: { id: providerId },
    data: { isEnabled: enabled },
  });

  await logAudit({
    entityType: 'AIProvider',
    entityId: providerId,
    action: enabled ? 'ENABLE' : 'DISABLE',
    fieldName: 'isEnabled',
    oldValue: provider.isEnabled.toString(),
    newValue: enabled.toString(),
    userId,
  });
}

/**
 * Set a provider as the default
 */
export async function setDefaultProvider(providerId: string, userId: string): Promise<void> {
  // First, clear any existing default
  await prisma.aIProvider.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  });

  // Then set the new default
  const provider = await prisma.aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  await prisma.aIProvider.update({
    where: { id: providerId },
    data: { isDefault: true },
  });

  await logAudit({
    entityType: 'AIProvider',
    entityId: providerId,
    action: 'SET_DEFAULT',
    userId,
  });
}

/**
 * Get provider by ID
 */
export async function getProvider(providerId: string): Promise<AIProvider | null> {
  return prisma.aIProvider.findUnique({
    where: { id: providerId },
  });
}

// ============================================================================
// API Key Management Functions
// ============================================================================

/**
 * Save API key for a provider (encrypts before storing)
 */
export async function saveApiKey(
  providerId: string,
  apiKey: string,
  userId: string
): Promise<void> {
  const provider = await prisma.aIProvider.findUnique({
    where: { id: providerId },
    include: { apiKeys: { where: { isActive: true } } },
  });

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  // Encrypt the API key
  const encryptedKey = encryptApiKey(apiKey);
  const keyHash = hashApiKey(apiKey);

  // Deactivate any existing active keys
  await prisma.aPIKey.updateMany({
    where: { providerId, isActive: true },
    data: { isActive: false },
  });

  // Create the new API key
  await prisma.aPIKey.create({
    data: {
      providerId,
      encryptedKey,
      keyHash,
      isValid: false, // Will be validated after saving
      isActive: true,
      createdBy: userId,
    },
  });

  await logAudit({
    entityType: 'APIKey',
    entityId: providerId,
    action: 'CREATE',
    userId,
  });
}

/**
 * Validate an API key (tests it without saving)
 */
export async function validateApiKey(
  providerId: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const provider = await prisma.aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    return { valid: false, error: 'Provider not found' };
  }

  const config = getProviderConfig(provider.providerId);
  if (!config) {
    return { valid: false, error: 'Provider configuration not found' };
  }

  try {
    // Build the request to test the API key
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.headerFormat === 'bearer') {
      headers[config.apiKeyHeaderName] = `Bearer ${apiKey}`;
    } else {
      headers[config.apiKeyHeaderName] = apiKey;
    }

    // Add Anthropic-specific headers
    if (provider.providerId === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }

    // Add Google-specific headers
    if (provider.providerId === 'google') {
      headers['Content-Type'] = 'application/json';
    }

    const testUrl = provider.baseUrl || config.baseUrl;
    const endpoint = config.testEndpoint || '';

    // Make a simple test request
    const response = await fetch(`${testUrl}${endpoint}`, {
      method: 'GET',
      headers,
    });

    // Check for various success indicators
    if (response.ok || response.status === 200) {
      return { valid: true };
    }

    // Parse error response
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.error?.message ||
      errorData.error?.type ||
      `HTTP ${response.status}: ${response.statusText}`;

    return { valid: false, error: errorMessage };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: errorMessage };
  }
}

/**
 * Get decrypted API key for a provider (for internal use only)
 */
export async function getDecryptedApiKey(providerId: string): Promise<string | null> {
  const apiKey = await prisma.aPIKey.findFirst({
    where: { providerId, isActive: true },
  });

  if (!apiKey) {
    return null;
  }

  try {
    return decryptApiKey(apiKey.encryptedKey);
  } catch (error) {
    logger.error('Failed to decrypt API key', {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if a provider has a valid API key
 */
export async function hasValidApiKey(providerId: string): Promise<boolean> {
  const apiKey = await prisma.aPIKey.findFirst({
    where: { providerId, isActive: true },
  });

  return apiKey?.isValid ?? false;
}

// ============================================================================
// Model Management Functions
// ============================================================================

/**
 * Get models for a specific provider
 */
export async function getModelsForProvider(providerId: string): Promise<AIModel[]> {
  return prisma.aIModel.findMany({
    where: { providerId },
    orderBy: [{ isDefault: 'desc' }, { displayName: 'asc' }],
    include: {
      parameters: {
        orderBy: { name: 'asc' },
      },
    },
  });
}

/**
 * Get default model for a provider
 */
export async function getDefaultModel(providerId: string): Promise<AIModel | null> {
  return prisma.aIModel.findFirst({
    where: { providerId, isDefault: true },
  });
}

/**
 * Set default model for a provider
 */
export async function setDefaultModel(
  providerId: string,
  modelId: string,
  userId: string
): Promise<void> {
  // First, clear any existing default
  await prisma.aIModel.updateMany({
    where: { providerId, isDefault: true },
    data: { isDefault: false },
  });

  // Then set the new default
  const model = await prisma.aIModel.findUnique({
    where: { id: modelId },
  });

  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }

  await prisma.aIModel.update({
    where: { id: modelId },
    data: { isDefault: true },
  });

  await logAudit({
    entityType: 'AIModel',
    entityId: modelId,
    action: 'SET_DEFAULT',
    userId,
  });
}

/**
 * Refresh models from provider API
 */
export async function refreshModelsFromProvider(
  providerId: string
): Promise<{ success: boolean; count?: number; error?: string; errorType?: 'invalid_key' | 'rate_limited' | 'network' | 'unknown' }> {
  const provider = await prisma.aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    return { success: false, error: 'Provider not found' };
  }

  const config = getProviderConfig(provider.providerId);
  if (!config) {
    return { success: false, error: 'Provider configuration not found' };
  }

  // Get the decrypted API key
  const apiKey = await getDecryptedApiKey(providerId);
  if (!apiKey) {
    return { success: false, error: 'No API key configured' };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.headerFormat === 'bearer') {
      headers[config.apiKeyHeaderName] = `Bearer ${apiKey}`;
    } else {
      headers[config.apiKeyHeaderName] = apiKey;
    }

    // Add Anthropic-specific headers
    if (provider.providerId === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }

    const baseUrl = provider.baseUrl || config.baseUrl;
    const endpoint = config.modelsEndpoint || '/models';

    // Create abort controller for 30 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 401 Unauthorized - mark API key as invalid
    if (response.status === 401) {
      await prisma.aPIKey.updateMany({
        where: { providerId, isActive: true },
        data: { 
          isValid: false, 
          validationError: 'Invalid API key (401 Unauthorized)',
          lastValidated: new Date(),
        },
      });

      logger.warn('API key marked as invalid due to 401 response', { providerId });

      return {
        success: false,
        error: 'Invalid API key. Please check your API key and try again.',
        errorType: 'invalid_key',
      };
    }

    // Handle 429 Rate Limited - return existing models without wiping
    if (response.status === 429) {
      logger.warn('Rate limited while refreshing models, keeping existing models', { providerId });

      // Get count of existing models
      const existingCount = await prisma.aIModel.count({ where: { providerId } });

      return {
        success: true,
        count: existingCount,
        error: 'Rate limited. Existing models preserved.',
        errorType: 'rate_limited',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        errorType: 'network',
      };
    }

    const data = await response.json();

    // Parse models based on provider format
    const modelsData = parseModelsResponse(provider.providerId, data);

    // Upsert models
    let count = 0;
    for (const modelData of modelsData) {
      await prisma.aIModel.upsert({
        where: {
          providerId_modelId: {
            providerId,
            modelId: modelData.modelId,
          },
        },
        update: {
          displayName: modelData.displayName,
          description: modelData.description,
          supportsVision: modelData.supportsVision,
          supportsStructuredOutput: modelData.supportsStructuredOutput,
          maxTokens: modelData.maxTokens,
          contextWindow: modelData.contextWindow,
          lastFetched: new Date(),
          isAvailable: true,
        },
        create: {
          providerId,
          modelId: modelData.modelId,
          displayName: modelData.displayName,
          description: modelData.description,
          supportsVision: modelData.supportsVision,
          supportsStructuredOutput: modelData.supportsStructuredOutput,
          supportsStreaming: modelData.supportsStreaming,
          maxTokens: modelData.maxTokens,
          contextWindow: modelData.contextWindow,
          lastFetched: new Date(),
          isAvailable: true,
        },
      });
      count++;
    }

    // Mark API key as valid after successful refresh
    await prisma.aPIKey.updateMany({
      where: { providerId, isActive: true },
      data: { 
        isValid: true, 
        validationError: null,
        lastValidated: new Date(),
      },
    });

    return { success: true, count };
  } catch (error) {
    // Handle timeout/abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out after 30 seconds',
        errorType: 'network',
      };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to refresh models from provider', {
      providerId,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      errorType: 'unknown',
    };
  }
}

/**
 * Parse models response from different providers
 */
function parseModelsResponse(
  providerId: string,
  data: unknown
): Array<{
  modelId: string;
  displayName: string;
  description: string | null;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  maxTokens: number | null;
  contextWindow: number | null;
}> {
  switch (providerId) {
    case 'openai':
    case 'openrouter':
    case 'openai_compat': {
      const models = (data as { data?: Array<{ id: string; description?: string }> })?.data || [];
      return models.map((m) => ({
        modelId: m.id,
        displayName: m.id,
        description: m.description ?? null,
        supportsVision: m.id.includes('vision') || m.id.includes('4o'),
        supportsStructuredOutput: true,
        supportsStreaming: m.id.includes('realtime'),
        maxTokens: null,
        contextWindow: null,
      }));
    }

    case 'anthropic': {
      const models = (data as { models?: Array<{ id: string; description?: string; context_window?: number }> })?.models || [];
      return models.map((m) => ({
        modelId: m.id,
        displayName: m.id,
        description: m.description ?? null,
        supportsVision: m.id.includes('3-5'),
        supportsStructuredOutput: true,
        supportsStreaming: m.id.includes('3-5-sonnet'),
        maxTokens: null,
        contextWindow: m.context_window ?? null,
      }));
    }

    case 'google': {
      const models = (data as { models?: Array<{ name: string; description?: string }> })?.models || [];
      return models.map((m) => ({
        modelId: m.name.split('/').pop() ?? m.name,
        displayName: m.name.split('/').pop() ?? m.name,
        description: m.description ?? null,
        supportsVision: true,
        supportsStructuredOutput: true,
        supportsStreaming: false,
        maxTokens: null,
        contextWindow: null,
      }));
    }

    case 'mistral':
    case 'cohere': {
      const models = (data as { data?: Array<{ id: string; description?: string }> })?.data || [];
      return models.map((m) => ({
        modelId: m.id,
        displayName: m.id,
        description: m.description ?? null,
        supportsVision: false,
        supportsStructuredOutput: true,
        supportsStreaming: false,
        maxTokens: null,
        contextWindow: null,
      }));
    }

    default:
      return [];
  }
}

// ============================================================================
// Model Parameter Management
// ============================================================================

/**
 * Update user-defined parameter values for a model
 */
export async function updateModelParameters(
  modelId: string,
  parameters: Record<string, number | string>,
  userId: string
): Promise<void> {
  for (const [name, value] of Object.entries(parameters)) {
    const param = await prisma.modelParameter.findUnique({
      where: {
        modelId_name: {
          modelId,
          name,
        },
      },
    });

    if (!param) {
      throw new Error(`Parameter not found: ${name} for model ${modelId}`);
    }

    const updateData =
      param.paramType === 'float' || param.paramType === 'int'
        ? { userValue: value as number }
        : { userStringValue: value as string };

    await prisma.modelParameter.update({
      where: { id: param.id },
      data: updateData,
    });

    await logAudit({
      entityType: 'ModelParameter',
      entityId: param.id,
      action: 'UPDATE',
      fieldName: name,
      oldValue: param.userValue?.toString() ?? param.userStringValue ?? undefined,
      newValue: value.toString(),
      userId,
    });
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log an audit entry
 */
export async function logAudit(params: {
  entityType: string;
  entityId: string;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  request?: unknown;
}): Promise<void> {
  try {
    await prisma.settingsAuditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        fieldName: params.fieldName ?? null,
        oldValue: params.oldValue ?? null,
        newValue: params.newValue ?? null,
        changedBy: params.userId ?? null,
        ipAddress: (params.request as { headers?: { get?: (name: string) => string | null } })?.headers?.get?.('x-forwarded-for') ?? null,
        userAgent: (params.request as { headers?: { get?: (name: string) => string | null } })?.headers?.get?.('user-agent') ?? null,
      },
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error('Failed to write audit log', {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get full settings status (for API response)
 */
export async function getSettingsStatus(): Promise<SettingsStatus> {
  const [enabled, settings, providers] = await Promise.all([
    isSmartUploadEnabled(),
    getAllSettings(),
    getProviders(),
  ]);

  // Get API key status for each provider
  const providersWithStatus: ProviderWithStatus[] = await Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      displayName: p.displayName,
      description: p.description ?? '',
      isEnabled: p.isEnabled,
      isDefault: p.isDefault,
      sortOrder: p.sortOrder,
      hasValidApiKey: await hasValidApiKey(p.id),
      capabilities: p.capabilities as { vision: boolean; structuredOutput: boolean } | null,
      defaultModel: null, // Will be populated separately if needed
    }))
  );

  return {
    smartUploadEnabled: enabled,
    settings,
    providers: providersWithStatus,
  };
}

/**
 * Seed default providers from registry
 */
export async function seedDefaultProviders(): Promise<void> {
  for (let i = 0; i < PROVIDER_CONFIGS.length; i++) {
    const config = PROVIDER_CONFIGS[i];
    const isDefault = config.id === 'openai';

    await prisma.aIProvider.upsert({
      where: { providerId: config.id },
      update: {
        displayName: config.displayName,
        description: config.description,
        sortOrder: i,
        capabilities: {
          vision: config.supportsVision ?? false,
          structuredOutput: config.supportsStructuredOutput ?? false,
        },
      },
      create: {
        providerId: config.id,
        displayName: config.displayName,
        description: config.description,
        baseUrl: config.baseUrl,
        isEnabled: true, // Enable all providers by default
        isDefault, // Only OpenAI is default
        sortOrder: i,
        capabilities: {
          vision: config.supportsVision ?? false,
          structuredOutput: config.supportsStructuredOutput ?? false,
        },
      },
    });
  }
}

// ============================================================================
// Task Model Configuration Functions
// ============================================================================

/**
 * Get all task model configurations
 */
export async function getTaskConfigs(): Promise<TaskModelConfig[]> {
  try {
    return await prisma.taskModelConfig.findMany({
      include: {
        model: {
          include: {
            provider: true,
          },
        },
        primaryProvider: true,
        fallbackProvider: true,
        fallbackModel: {
          include: {
            provider: true,
          },
        },
      },
      orderBy: { taskType: 'asc' },
    });
  } catch (error) {
    logger.error('Failed to fetch task configs', { error });
    return [];
  }
}

/**
 * Get configuration for a specific task type
 */
export async function getTaskConfig(
  taskType: UploadTaskType
): Promise<TaskModelConfig | null> {
  return prisma.taskModelConfig.findUnique({
    where: { taskType },
    include: {
      model: {
        include: {
          provider: true,
        },
      },
      primaryProvider: true,
      fallbackProvider: true,
      fallbackModel: {
        include: {
          provider: true,
        },
      },
    },
  });
}

/**
 * Set or update task model configuration
 */
export async function setTaskConfig(
  taskType: UploadTaskType,
  modelId: string | null,
  params: { temperature?: number; maxTokens?: number; topP?: number },
  userId: string,
  primaryProviderId?: string | null,
  fallbackProviderId?: string | null,
  fallbackModelId?: string | null,
): Promise<TaskModelConfig> {
  const existing = await prisma.taskModelConfig.findUnique({
    where: { taskType },
  });

  const config = await prisma.taskModelConfig.upsert({
    where: { taskType },
    update: {
      modelId,
      primaryProviderId: primaryProviderId ?? null,
      fallbackProviderId: fallbackProviderId ?? null,
      fallbackModelId: fallbackModelId ?? null,
      temperature: params.temperature ?? null,
      maxTokens: params.maxTokens ?? null,
      topP: params.topP ?? null,
    },
    create: {
      taskType,
      modelId,
      primaryProviderId: primaryProviderId ?? null,
      fallbackProviderId: fallbackProviderId ?? null,
      fallbackModelId: fallbackModelId ?? null,
      temperature: params.temperature ?? null,
      maxTokens: params.maxTokens ?? null,
      topP: params.topP ?? null,
    },
  });

  await logAudit({
    entityType: 'TaskModelConfig',
    entityId: taskType,
    action: existing ? 'UPDATE' : 'CREATE',
    fieldName: 'modelId',
    oldValue: existing?.modelId ?? undefined,
    newValue: modelId ?? 'null (use default)',
    userId,
  });

  return config;
}

// ============================================================================
// Task Model Configuration Helper for Pipeline Integration
// ============================================================================

/**
 * Result of getModelForTask - contains all info needed to make an AI call
 */
export interface ModelForTaskResult {
  /** The model ID to use (e.g., 'gpt-4o-mini') */
  modelId: string;
  /** The provider ID (e.g., 'openai') */
  providerId: string;
  /** The database ID of the AIModel record */
  modelDbId: string;
  /** Temperature override (if configured) */
  temperature?: number;
  /** Max tokens override (if configured) */
  maxTokens?: number;
  /** Top P override (if configured) */
  topP?: number;
  /** The decrypted API key for the provider */
  apiKey: string;
  /** The base URL for the provider */
  baseUrl: string;
  /** Whether this is a fallback configuration */
  isFallback?: boolean;
}

/**
 * Get the model configuration for a specific task type.
 * 
 * This is the main entry point for the Smart Upload pipeline to get
 * AI model configuration. It:
 * 1. Checks if there's a task-specific config with a model assigned
 * 2. Falls back to the default provider's default model if not
 * 3. Returns all parameters needed to make an AI call
 * 
 * @param taskType - The upload task type
 * @returns The model configuration or null if no valid configuration exists
 */
export async function getModelForTask(
  taskType: UploadTaskType
): Promise<ModelForTaskResult | null> {
  // Try to get task-specific config
  const taskConfig = await prisma.taskModelConfig.findUnique({
    where: { taskType },
    include: {
      model: {
        include: {
          provider: true,
        },
      },
      primaryProvider: true,
      fallbackProvider: true,
      fallbackModel: {
        include: {
          provider: { 
            include: { 
              apiKeys: { where: { isActive: true } } 
            } 
          },
        },
      },
    },
  });

  // If task config exists and has a model assigned
  if (taskConfig?.model) {
    const model = taskConfig.model;
    const provider = model.provider;

    // Get the API key for this provider
    const apiKey = await getDecryptedApiKey(provider.id);
    if (apiKey) {
      return {
        modelId: model.modelId,
        providerId: provider.providerId,
        modelDbId: model.id,
        temperature: taskConfig.temperature ?? undefined,
        maxTokens: taskConfig.maxTokens ?? undefined,
        topP: taskConfig.topP ?? undefined,
        apiKey,
        baseUrl: provider.baseUrl || getProviderConfig(provider.providerId)?.baseUrl || '',
        isFallback: false,
      };
    }
    
    logger.warn('No API key found for task model provider, trying fallback', {
      taskType,
      providerId: provider.id,
    });
  }

  // If primary model/provider failed and fallback is configured, try fallback
  if (taskConfig?.fallbackModelId && taskConfig?.fallbackProviderId) {
    const fallbackModel = await prisma.aIModel.findUnique({
      where: { id: taskConfig.fallbackModelId },
      include: { 
        provider: { 
          include: { 
            apiKeys: { where: { isActive: true } } 
          } 
        } 
      },
    });
    
    if (fallbackModel?.provider) {
      const fallbackApiKey = await getDecryptedApiKey(fallbackModel.provider.id);
      if (fallbackApiKey) {
        logger.info('Using fallback model for task', {
          taskType,
          fallbackModelId: fallbackModel.id,
          fallbackProviderId: fallbackModel.provider.id,
        });
        
        return {
          modelId: fallbackModel.modelId,
          providerId: fallbackModel.provider.providerId,
          modelDbId: fallbackModel.id,
          temperature: taskConfig.temperature ?? undefined,
          maxTokens: taskConfig.maxTokens ?? undefined,
          topP: taskConfig.topP ?? undefined,
          apiKey: fallbackApiKey,
          baseUrl: fallbackModel.provider.baseUrl || getProviderConfig(fallbackModel.provider.providerId)?.baseUrl || '',
          isFallback: true,
        };
      }
      
      logger.warn('No API key found for fallback provider', {
        taskType,
        fallbackProviderId: taskConfig.fallbackProviderId,
      });
    }
  }

  // Fall back to default provider's default model
  const defaultProvider = await prisma.aIProvider.findFirst({
    where: { isDefault: true, isEnabled: true },
    include: {
      models: {
        where: { isDefault: true },
        take: 1,
      },
    },
  });

  if (!defaultProvider) {
    logger.error('No default provider found for AI task', { taskType });
    return null;
  }

  const defaultModel = defaultProvider.models[0];
  if (!defaultModel) {
    logger.error('No default model found for default provider', {
      taskType,
      providerId: defaultProvider.id,
    });
    return null;
  }

  // Get the API key for the default provider
  const apiKey = await getDecryptedApiKey(defaultProvider.id);
  if (!apiKey) {
    logger.error('No API key found for default provider', {
      taskType,
      providerId: defaultProvider.id,
    });
    return null;
  }

  return {
    modelId: defaultModel.modelId,
    providerId: defaultProvider.providerId,
    modelDbId: defaultModel.id,
    temperature: taskConfig?.temperature ?? undefined,
    maxTokens: taskConfig?.maxTokens ?? undefined,
    topP: taskConfig?.topP ?? undefined,
    apiKey,
    baseUrl: defaultProvider.baseUrl || getProviderConfig(defaultProvider.providerId)?.baseUrl || '',
    isFallback: false,
  };
}

/**
 * Get all task configs with resolved model info for display
 */
export async function getTaskConfigsWithModelInfo(): Promise<Array<{
  taskType: UploadTaskType;
  modelId: string | null;
  modelName: string | null;
  providerName: string | null;
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
}>> {
  const configs = await prisma.taskModelConfig.findMany({
    include: {
      model: {
        include: {
          provider: true,
        },
      },
    },
    orderBy: { taskType: 'asc' },
  });

  // Get all task types to ensure we return entries for unconfigured tasks
  const allTaskTypes: UploadTaskType[] = [
    'METADATA_EXTRACTION',
    'AUDIO_ANALYSIS',
    'SUMMARIZATION',
    'TRANSCRIPTION',
    'CLASSIFICATION',
  ];

  const configMap = new Map(configs.map(c => [c.taskType, c]));

  return allTaskTypes.map(taskType => {
    const config = configMap.get(taskType);
    return {
      taskType,
      modelId: config?.modelId ?? null,
      modelName: config?.model?.displayName ?? null,
      providerName: config?.model?.provider?.displayName ?? null,
      temperature: config?.temperature ?? null,
      maxTokens: config?.maxTokens ?? null,
      topP: config?.topP ?? null,
    };
  });
}
