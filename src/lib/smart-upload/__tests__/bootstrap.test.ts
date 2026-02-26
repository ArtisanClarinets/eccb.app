// src/lib/smart-upload/__tests__/bootstrap.test.ts
// ============================================================
// Comprehensive tests for Smart Upload bootstrap functionality
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock Setup - All mocks must be defined before any imports
// =============================================================================

const mockPrismaSystemSettingFindMany = vi.hoisted(() => vi.fn());
const mockPrismaSystemSettingUpsert = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockGetDefaultPromptsRecord = vi.hoisted(() => vi.fn());
const mockPromptsNeedReset = vi.hoisted(() => vi.fn());
const mockMaskSecrets = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    systemSetting: {
      findMany: mockPrismaSystemSettingFindMany,
      upsert: mockPrismaSystemSettingUpsert,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

vi.mock('@/lib/smart-upload/prompts', () => ({
  getDefaultPromptsRecord: mockGetDefaultPromptsRecord,
  promptsNeedReset: mockPromptsNeedReset,
  PROMPT_VERSION: '1.0.0',
  DEFAULT_VISION_SYSTEM_PROMPT: 'Default vision prompt',
  DEFAULT_VERIFICATION_SYSTEM_PROMPT: 'Default verification prompt',
}));

vi.mock('@/lib/smart-upload/schema', async () => {
  const actual = await vi.importActual('@/lib/smart-upload/schema');
  return {
    ...actual,
    maskSecrets: mockMaskSecrets,
  };
});

vi.mock('@/lib/llm/providers', () => ({
  LLM_PROVIDERS: [
    {
      value: 'ollama',
      label: 'Ollama',
      defaultVisionModel: 'llama3.2-vision',
      defaultVerificationModel: 'qwen2.5:7b',
    },
    {
      value: 'openai',
      label: 'OpenAI',
      defaultVisionModel: 'gpt-4o',
      defaultVerificationModel: 'gpt-4o-mini',
    },
    {
      value: 'custom',
      label: 'Custom',
      defaultVisionModel: '',
      defaultVerificationModel: '',
    },
  ],
  getDefaultEndpointForProvider: (provider: string) => {
    const endpoints: Record<string, string> = {
      ollama: 'http://localhost:11434',
      openai: 'https://api.openai.com/v1',
    };
    return endpoints[provider] || '';
  },
}));

// Import after mocks
import {
  bootstrapSmartUploadSettings,
  resetPromptsToDefaults,
  loadSmartUploadSettingsFromDB,
  isSmartUploadConfigured,
} from '../bootstrap';

// =============================================================================
// Test Utilities
// =============================================================================

const DEFAULT_PROMPTS = {
  llm_vision_system_prompt: 'Default vision prompt',
  llm_verification_system_prompt: 'Default verification prompt',
  llm_prompt_version: '1.0.0',
};

// =============================================================================
// Test Suite
// =============================================================================

describe('Smart Upload Bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockPrismaSystemSettingUpsert.mockResolvedValue({});
    mockLoggerInfo.mockReturnValue(undefined);
    mockLoggerError.mockReturnValue(undefined);
    mockGetDefaultPromptsRecord.mockReturnValue(DEFAULT_PROMPTS);
    mockPromptsNeedReset.mockReturnValue(false);
    mockMaskSecrets.mockImplementation((record: Record<string, string>) => {
      const masked = { ...record };
      const secretKeys = [
        'llm_openai_api_key',
        'llm_anthropic_api_key',
        'llm_openrouter_api_key',
        'llm_gemini_api_key',
        'llm_custom_api_key',
      ];
      for (const key of secretKeys) {
        if (key in masked) {
          masked[key] = masked[key] ? '__SET__' : '__UNSET__';
        }
      }
      return masked;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // bootstrapSmartUploadSettings
  // ===========================================================================

  describe('bootstrapSmartUploadSettings', () => {
    it('should initialize missing settings with defaults', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.initialized).toBe(true);
      expect(result.actions.length).toBeGreaterThan(0);
      expect(mockPrismaSystemSettingUpsert).toHaveBeenCalled();
    });

    it('should seed prompts if empty', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);
      mockPromptsNeedReset.mockReturnValue(true);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('llm_vision_system_prompt'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('llm_verification_system_prompt'))).toBe(true);
    });

    it('should set default provider and models', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('llm_provider'))).toBe(true);
      expect(mockPrismaSystemSettingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'llm_provider' },
          create: expect.objectContaining({
            key: 'llm_provider',
            value: 'ollama',
          }),
        })
      );
    });

    it('should not overwrite existing values', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: 'custom-vision-model' },
        { key: 'smart_upload_confidence_threshold', value: '80' },
      ]);

      const result = await bootstrapSmartUploadSettings();

      // Should not initialize provider since it exists
      expect(result.actions.some((a: string) => a.includes('llm_provider'))).toBe(false);
      expect(result.actions.some((a: string) => a.includes('smart_upload_confidence_threshold'))).toBe(false);
    });

    it('should initialize numeric defaults if missing', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
        // Missing numeric defaults
      ]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('smart_upload_confidence_threshold'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('smart_upload_auto_approve_threshold'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('smart_upload_rate_limit_rpm'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('smart_upload_max_concurrent'))).toBe(true);
    });

    it('should initialize JSON defaults if missing', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('vision_model_params'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('verification_model_params'))).toBe(true);
    });

    it('should set default models for selected provider', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        // Missing models
      ]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('llm_vision_model'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('gpt-4o'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('llm_verification_model'))).toBe(true);
      expect(result.actions.some((a: string) => a.includes('gpt-4o-mini'))).toBe(true);
    });

    it('should initialize schema version if missing', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('schema version'))).toBe(true);
    });

    it('should initialize empty endpoint for custom provider', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'custom' },
      ]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('endpoint_url'))).toBe(true);
    });

    it('should not initialize endpoint for non-custom providers', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
      ]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions.some((a: string) => a.includes('endpoint_url'))).toBe(false);
    });

    it('should force reset prompts when option is set', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_vision_system_prompt', value: 'Existing prompt' },
        { key: 'llm_provider', value: 'ollama' },
      ]);

      const result = await bootstrapSmartUploadSettings({ forceResetPrompts: true });

      expect(result.actions.some((a: string) => a.includes('llm_vision_system_prompt'))).toBe(true);
    });

    it('should track updatedBy when provided', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      await bootstrapSmartUploadSettings({ updatedBy: 'admin-123' });

      expect(mockPrismaSystemSettingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            updatedBy: 'admin-123',
          }),
        })
      );
    });

    it('should handle empty database gracefully', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.initialized).toBe(true);
      expect(result.actions.length).toBeGreaterThan(0);
    });

    it('should return empty actions when all settings exist', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
        { key: 'llm_vision_model', value: 'llama3.2-vision' },
        { key: 'llm_verification_model', value: 'qwen2.5:7b' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
        { key: 'llm_prompt_version', value: '1.0.0' },
        { key: 'smart_upload_confidence_threshold', value: '70' },
        { key: 'smart_upload_auto_approve_threshold', value: '90' },
        { key: 'smart_upload_rate_limit_rpm', value: '15' },
        { key: 'smart_upload_max_concurrent', value: '3' },
        { key: 'smart_upload_max_pages', value: '20' },
        { key: 'smart_upload_max_file_size_mb', value: '50' },
        { key: 'smart_upload_allowed_mime_types', value: JSON.stringify(['application/pdf']) },
        { key: 'llm_two_pass_enabled', value: 'true' },
        { key: 'vision_model_params', value: '{}' },
        { key: 'verification_model_params', value: '{}' },
        { key: 'smart_upload_schema_version', value: '1.0.0' },
      ]);

      const result = await bootstrapSmartUploadSettings();

      expect(result.actions).toHaveLength(0);
    });

    it('should throw error on database failure', async () => {
      mockPrismaSystemSettingFindMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(bootstrapSmartUploadSettings()).rejects.toThrow('Database connection failed');
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to bootstrap Smart Upload settings',
        expect.any(Object)
      );
    });

    it('should log actions when settings are initialized', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      await bootstrapSmartUploadSettings();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Smart Upload settings bootstrapped',
        expect.objectContaining({
          actions: expect.any(Array),
          provider: expect.any(String),
        })
      );
    });
  });

  // ===========================================================================
  // resetPromptsToDefaults
  // ===========================================================================

  describe('resetPromptsToDefaults', () => {
    it('should reset both prompts to canonical defaults', async () => {
      const result = await resetPromptsToDefaults();

      expect(result.success).toBe(true);
      expect(result.resetKeys).toContain('llm_vision_system_prompt');
      expect(result.resetKeys).toContain('llm_verification_system_prompt');
    });

    it('should update prompt version', async () => {
      const result = await resetPromptsToDefaults();

      expect(result.resetKeys).toContain('llm_prompt_version');
      expect(mockPrismaSystemSettingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'llm_prompt_version' },
        })
      );
    });

    it('should track updatedBy when provided', async () => {
      await resetPromptsToDefaults('admin-456');

      expect(mockPrismaSystemSettingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            updatedBy: 'admin-456',
          }),
        })
      );
    });

    it('should log the reset action', async () => {
      await resetPromptsToDefaults();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Smart Upload prompts reset to defaults',
        expect.objectContaining({
          resetKeys: expect.any(Array),
          version: '1.0.0',
        })
      );
    });

    it('should throw error on database failure', async () => {
      mockPrismaSystemSettingUpsert.mockRejectedValue(new Error('Database error'));

      await expect(resetPromptsToDefaults()).rejects.toThrow('Database error');
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // loadSmartUploadSettingsFromDB
  // ===========================================================================

  describe('loadSmartUploadSettingsFromDB', () => {
    it('should return settings from database', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: 'gpt-4o' },
      ]);

      const result = await loadSmartUploadSettingsFromDB();

      expect(result.settings.llm_provider).toBe('openai');
      expect(result.settings.llm_vision_model).toBe('gpt-4o');
    });

    it('should return masked settings', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_openai_api_key', value: 'sk-secret' },
        { key: 'llm_provider', value: 'openai' },
      ]);

      const result = await loadSmartUploadSettingsFromDB();

      expect(result.masked.llm_openai_api_key).toBe('__SET__');
      expect(result.settings.llm_openai_api_key).toBe('sk-secret');
    });

    it('should handle empty database', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([]);

      const result = await loadSmartUploadSettingsFromDB();

      expect(result.settings).toEqual({});
      expect(result.masked).toEqual({});
    });

    it('should handle null values gracefully', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: null },
        { key: 'llm_verification_model', value: undefined },
      ]);

      const result = await loadSmartUploadSettingsFromDB();

      expect(result.settings.llm_provider).toBe('openai');
      expect(result.settings.llm_vision_model).toBeUndefined();
      expect(result.settings.llm_verification_model).toBeUndefined();
    });
  });

  // ===========================================================================
  // isSmartUploadConfigured
  // ===========================================================================

  describe('isSmartUploadConfigured', () => {
    it('should return configured: true when all required fields present', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
        { key: 'llm_vision_model', value: 'llama3.2-vision' },
        { key: 'llm_verification_model', value: 'qwen2.5:7b' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.provider).toBe('ollama');
    });

    it('should return configured: false with missing fields list when incomplete', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
        // Missing other required fields
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toContain('llm_vision_model');
      expect(result.missing).toContain('llm_verification_model');
    });

    it('should require API key for cloud providers', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: 'gpt-4o' },
        { key: 'llm_verification_model', value: 'gpt-4o-mini' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
        // Missing API key
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(false);
      expect(result.missing).toContain('llm_openai_api_key');
    });

    it('should not require API key for ollama', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'ollama' },
        { key: 'llm_vision_model', value: 'llama3.2-vision' },
        { key: 'llm_verification_model', value: 'qwen2.5:7b' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(true);
      expect(result.missing).not.toContain('llm_openai_api_key');
    });

    it('should return provider in result', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'anthropic' },
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.provider).toBe('anthropic');
    });

    it('should handle empty provider', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_vision_model', value: 'gpt-4o' },
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(false);
      expect(result.missing).toContain('llm_provider');
      expect(result.provider).toBeUndefined();
    });

    it('should handle empty API key strings', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: 'gpt-4o' },
        { key: 'llm_verification_model', value: 'gpt-4o-mini' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
        { key: 'llm_openai_api_key', value: '' }, // Empty string
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(false);
      expect(result.missing).toContain('llm_openai_api_key');
    });

    it('should handle whitespace-only API keys', async () => {
      mockPrismaSystemSettingFindMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
        { key: 'llm_vision_model', value: 'gpt-4o' },
        { key: 'llm_verification_model', value: 'gpt-4o-mini' },
        { key: 'llm_vision_system_prompt', value: 'Prompt' },
        { key: 'llm_verification_system_prompt', value: 'Prompt' },
        { key: 'llm_openai_api_key', value: '   ' }, // Whitespace
      ]);

      const result = await isSmartUploadConfigured();

      expect(result.configured).toBe(false);
      expect(result.missing).toContain('llm_openai_api_key');
    });

    it('should check correct API key field for each provider', async () => {
      const testCases = [
        {
          provider: 'anthropic',
          keyField: 'llm_anthropic_api_key',
          keyValue: 'sk-ant-key',
        },
        {
          provider: 'gemini',
          keyField: 'llm_gemini_api_key',
          keyValue: 'AIza-key',
        },
        {
          provider: 'openrouter',
          keyField: 'llm_openrouter_api_key',
          keyValue: 'sk-or-key',
        },
        {
          provider: 'custom',
          keyField: 'llm_custom_api_key',
          keyValue: 'custom-key',
        },
      ];

      for (const { provider, keyField, keyValue } of testCases) {
        vi.clearAllMocks();
        mockPrismaSystemSettingFindMany.mockResolvedValue([
          { key: 'llm_provider', value: provider },
          { key: 'llm_vision_model', value: 'model' },
          { key: 'llm_verification_model', value: 'model' },
          { key: 'llm_vision_system_prompt', value: 'Prompt' },
          { key: 'llm_verification_system_prompt', value: 'Prompt' },
          { key: keyField, value: keyValue },
        ]);

        const result = await isSmartUploadConfigured();
        expect(result.configured).toBe(true);
        expect(result.missing).not.toContain(keyField);
      }
    });
  });
});
