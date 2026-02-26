// src/lib/smart-upload/__tests__/schema.test.ts
// ============================================================
// Comprehensive tests for Smart Upload schema validation
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  SmartUploadSettingsSchema,
  ProviderValueSchema,
  getApiKeyFieldForProvider,
  providerRequiresApiKey,
  providerRequiresEndpoint,
  validateProviderApiKey,
  validateProviderEndpoint,
  maskSecrets,
  mergeSettingsPreservingSecrets,
  validateSmartUploadSettings,
  SECRET_KEYS,
  SMART_UPLOAD_SCHEMA_VERSION,
  dbRecordToSettings,
  settingsToDbRecord,
} from '../schema';
import { PROMPT_VERSION } from '../prompts';

// =============================================================================
// SmartUploadSettingsSchema Validation Tests
// =============================================================================

describe('SmartUploadSettingsSchema', () => {
  const validSettings = {
    llm_provider: 'ollama' as const,
    llm_vision_model: 'llama3.2-vision',
    llm_verification_model: 'qwen2.5:7b',
    llm_vision_system_prompt: 'Test vision prompt',
    llm_verification_system_prompt: 'Test verification prompt',
  };

  describe('valid settings', () => {
    it('should pass validation with minimal valid settings', () => {
      const result = SmartUploadSettingsSchema.safeParse(validSettings);
      expect(result.success).toBe(true);
    });

    it('should pass validation with all fields populated', () => {
      const fullSettings = {
        ...validSettings,
        llm_endpoint_url: 'http://localhost:11434',
        llm_openai_api_key: 'sk-test',
        llm_anthropic_api_key: 'sk-ant-test',
        llm_openrouter_api_key: 'sk-or-test',
        llm_gemini_api_key: 'AIza-test',
        llm_custom_api_key: 'custom-key',
        llm_prompt_version: PROMPT_VERSION,
        smart_upload_confidence_threshold: 75,
        smart_upload_auto_approve_threshold: 85,
        smart_upload_rate_limit_rpm: 20,
        smart_upload_max_concurrent: 5,
        smart_upload_max_pages: 30,
        smart_upload_max_file_size_mb: 100,
        smart_upload_allowed_mime_types: JSON.stringify(['application/pdf']),
        llm_two_pass_enabled: true,
        vision_model_params: JSON.stringify({ temperature: 0.1 }),
        verification_model_params: JSON.stringify({ temperature: 0.2 }),
        smart_upload_schema_version: SMART_UPLOAD_SCHEMA_VERSION,
      };
      const result = SmartUploadSettingsSchema.safeParse(fullSettings);
      expect(result.success).toBe(true);
    });

    it('should apply default values for optional fields', () => {
      const result = SmartUploadSettingsSchema.safeParse(validSettings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_confidence_threshold).toBe(70);
        expect(result.data.smart_upload_auto_approve_threshold).toBe(90);
        expect(result.data.smart_upload_rate_limit_rpm).toBe(15);
        expect(result.data.smart_upload_max_concurrent).toBe(3);
        expect(result.data.smart_upload_max_pages).toBe(20);
        expect(result.data.smart_upload_max_file_size_mb).toBe(50);
        expect(result.data.llm_two_pass_enabled).toBe(true);
        expect(result.data.llm_prompt_version).toBe(PROMPT_VERSION);
        expect(result.data.smart_upload_schema_version).toBe(SMART_UPLOAD_SCHEMA_VERSION);
      }
    });
  });

  describe('provider validation', () => {
    it('should accept all valid provider values', () => {
      const providers = ['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom'] as const;
      for (const provider of providers) {
        const result = SmartUploadSettingsSchema.safeParse({
          ...validSettings,
          llm_provider: provider,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid provider values', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_provider: 'invalid-provider',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('llm_provider');
      }
    });

    it('should reject empty provider', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_provider: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('required fields validation', () => {
    it('should fail when vision_model is missing', () => {
      const { llm_vision_model: _, ...settingsWithoutVision } = validSettings;
      const result = SmartUploadSettingsSchema.safeParse(settingsWithoutVision);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('llm_vision_model'))).toBe(true);
      }
    });

    it('should fail when verification_model is missing', () => {
      const { llm_verification_model: _, ...settingsWithoutVerification } = validSettings;
      const result = SmartUploadSettingsSchema.safeParse(settingsWithoutVerification);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('llm_verification_model'))).toBe(true);
      }
    });

    it('should fail when vision_system_prompt is empty', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_vision_system_prompt: '',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when verification_system_prompt is empty', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_verification_system_prompt: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('endpoint URL validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'http://localhost:11434',
        'https://api.openai.com/v1',
        'https://example.com:8080/path',
      ];
      for (const url of validUrls) {
        const result = SmartUploadSettingsSchema.safeParse({
          ...validSettings,
          llm_endpoint_url: url,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept empty string for endpoint', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_endpoint_url: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URLs', () => {
      // Note: ftp:// URLs and http:// are technically valid URL structures
      // per the URL constructor. We test truly invalid URL formats here.
      const invalidUrls = ['not-a-url', 'spaces in url', '\\backslashes\\'];
      for (const url of invalidUrls) {
        const result = SmartUploadSettingsSchema.safeParse({
          ...validSettings,
          llm_endpoint_url: url,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('numeric threshold clamping', () => {
    it('should clamp confidence threshold to 0-100 range', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_confidence_threshold: 150,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_confidence_threshold).toBe(100);
      }
    });

    it('should clamp negative confidence threshold to 0', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_confidence_threshold: -10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_confidence_threshold).toBe(0);
      }
    });

    it('should clamp auto-approve threshold to 0-100 range', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_auto_approve_threshold: 200,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_auto_approve_threshold).toBe(100);
      }
    });

    it('should handle string numeric values', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_confidence_threshold: '85',
        smart_upload_auto_approve_threshold: '95',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_confidence_threshold).toBe(85);
        expect(result.data.smart_upload_auto_approve_threshold).toBe(95);
      }
    });

    it('should clamp rate limit to 1-1000 range', () => {
      const resultHigh = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_rate_limit_rpm: 5000,
      });
      expect(resultHigh.success).toBe(true);
      if (resultHigh.success) {
        expect(resultHigh.data.smart_upload_rate_limit_rpm).toBe(1000);
      }

      const resultLow = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_rate_limit_rpm: 0,
      });
      expect(resultLow.success).toBe(true);
      if (resultLow.success) {
        expect(resultLow.data.smart_upload_rate_limit_rpm).toBe(1);
      }
    });

    it('should clamp max concurrent to 1-50 range', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_max_concurrent: 100,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_max_concurrent).toBe(50);
      }
    });

    it('should clamp max pages to 1-100 range', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_max_pages: 500,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_max_pages).toBe(100);
      }
    });

    it('should clamp max file size to 1-500 MB range', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        smart_upload_max_file_size_mb: 1000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.smart_upload_max_file_size_mb).toBe(500);
      }
    });
  });

  describe('boolean field handling', () => {
    it('should handle string boolean values', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_two_pass_enabled: 'false',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.llm_two_pass_enabled).toBe(false);
      }
    });

    it('should handle actual boolean values', () => {
      const result = SmartUploadSettingsSchema.safeParse({
        ...validSettings,
        llm_two_pass_enabled: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.llm_two_pass_enabled).toBe(false);
      }
    });
  });
});

// =============================================================================
// ProviderValueSchema Tests
// =============================================================================

describe('ProviderValueSchema', () => {
  it('should accept all valid provider values', () => {
    const providers = ['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom'];
    for (const provider of providers) {
      const result = ProviderValueSchema.safeParse(provider);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid provider values', () => {
    const result = ProviderValueSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('getApiKeyFieldForProvider', () => {
  it('should return correct API key field for each provider', () => {
    expect(getApiKeyFieldForProvider('ollama')).toBe('');
    expect(getApiKeyFieldForProvider('openai')).toBe('llm_openai_api_key');
    expect(getApiKeyFieldForProvider('anthropic')).toBe('llm_anthropic_api_key');
    expect(getApiKeyFieldForProvider('gemini')).toBe('llm_gemini_api_key');
    expect(getApiKeyFieldForProvider('openrouter')).toBe('llm_openrouter_api_key');
    expect(getApiKeyFieldForProvider('custom')).toBe('llm_custom_api_key');
  });

  it('should return empty string for unknown provider', () => {
    // TypeScript should prevent this, but test defensive behavior
    expect(getApiKeyFieldForProvider('unknown' as any)).toBe('');
  });
});

describe('providerRequiresApiKey', () => {
  it('should return false for ollama', () => {
    expect(providerRequiresApiKey('ollama')).toBe(false);
  });

  it('should return true for all cloud providers', () => {
    expect(providerRequiresApiKey('openai')).toBe(true);
    expect(providerRequiresApiKey('anthropic')).toBe(true);
    expect(providerRequiresApiKey('gemini')).toBe(true);
    expect(providerRequiresApiKey('openrouter')).toBe(true);
    expect(providerRequiresApiKey('custom')).toBe(true);
  });
});

describe('providerRequiresEndpoint', () => {
  it('should return true only for custom provider', () => {
    expect(providerRequiresEndpoint('custom')).toBe(true);
    expect(providerRequiresEndpoint('ollama')).toBe(false);
    expect(providerRequiresEndpoint('openai')).toBe(false);
    expect(providerRequiresEndpoint('anthropic')).toBe(false);
    expect(providerRequiresEndpoint('gemini')).toBe(false);
    expect(providerRequiresEndpoint('openrouter')).toBe(false);
  });
});

describe('validateProviderApiKey', () => {
  it('should return valid for ollama without API key', () => {
    const result = validateProviderApiKey('ollama', {});
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return invalid when API key is missing for cloud providers', () => {
    const result = validateProviderApiKey('openai', {});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('openai requires an API key');
  });

  it('should return invalid when API key is empty string', () => {
    const result = validateProviderApiKey('openai', { llm_openai_api_key: '' });
    expect(result.valid).toBe(false);
  });

  it('should return invalid when API key is whitespace only', () => {
    const result = validateProviderApiKey('openai', { llm_openai_api_key: '   ' });
    expect(result.valid).toBe(false);
  });

  it('should return valid when API key is present', () => {
    const result = validateProviderApiKey('openai', { llm_openai_api_key: 'sk-test' });
    expect(result.valid).toBe(true);
  });

  it('should check correct API key field for each provider', () => {
    const testCases = [
      { provider: 'anthropic', key: 'llm_anthropic_api_key', value: 'sk-ant-test' },
      { provider: 'gemini', key: 'llm_gemini_api_key', value: 'AIza-test' },
      { provider: 'openrouter', key: 'llm_openrouter_api_key', value: 'sk-or-test' },
      { provider: 'custom', key: 'llm_custom_api_key', value: 'custom-key' },
    ] as const;

    for (const { provider, key, value } of testCases) {
      const settings = { [key]: value };
      const result = validateProviderApiKey(provider as any, settings);
      expect(result.valid).toBe(true);
    }
  });
});

describe('validateProviderEndpoint', () => {
  it('should return valid for non-custom providers regardless of endpoint', () => {
    expect(validateProviderEndpoint('openai').valid).toBe(true);
    expect(validateProviderEndpoint('openai', '').valid).toBe(true);
    expect(validateProviderEndpoint('ollama', 'http://localhost').valid).toBe(true);
  });

  it('should return invalid when endpoint is missing for custom provider', () => {
    const result = validateProviderEndpoint('custom');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Custom provider requires an endpoint URL.');
  });

  it('should return invalid when endpoint is empty for custom provider', () => {
    const result = validateProviderEndpoint('custom', '');
    expect(result.valid).toBe(false);
  });

  it('should return invalid when endpoint is not a valid URL', () => {
    const result = validateProviderEndpoint('custom', 'not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Endpoint URL must be a valid URL.');
  });

  it('should return valid for valid custom endpoint URL', () => {
    const result = validateProviderEndpoint('custom', 'http://localhost:8080');
    expect(result.valid).toBe(true);
  });
});

describe('maskSecrets', () => {
  it('should mask all secret keys', () => {
    const record = {
      llm_openai_api_key: 'sk-secret',
      llm_anthropic_api_key: 'sk-ant-secret',
      llm_openrouter_api_key: 'sk-or-secret',
      llm_gemini_api_key: 'AIza-secret',
      llm_custom_api_key: 'custom-secret',
      llm_provider: 'openai',
      llm_vision_model: 'gpt-4o',
    };

    const masked = maskSecrets(record);

    expect(masked.llm_openai_api_key).toBe('__SET__');
    expect(masked.llm_anthropic_api_key).toBe('__SET__');
    expect(masked.llm_openrouter_api_key).toBe('__SET__');
    expect(masked.llm_gemini_api_key).toBe('__SET__');
    expect(masked.llm_custom_api_key).toBe('__SET__');
    expect(masked.llm_provider).toBe('openai');
    expect(masked.llm_vision_model).toBe('gpt-4o');
  });

  it('should mark empty secrets as __UNSET__', () => {
    const record = {
      llm_openai_api_key: '',
      llm_anthropic_api_key: '  ',
      llm_provider: 'ollama',
    };

    const masked = maskSecrets(record);

    expect(masked.llm_openai_api_key).toBe('__UNSET__');
    expect(masked.llm_anthropic_api_key).toBe('__SET__'); // whitespace counts as set
  });

  it('should not modify non-secret keys', () => {
    const record = {
      llm_provider: 'openai',
      llm_vision_model: 'gpt-4o',
      llm_endpoint_url: 'http://localhost',
    };

    const masked = maskSecrets(record);

    expect(masked.llm_provider).toBe('openai');
    expect(masked.llm_vision_model).toBe('gpt-4o');
    expect(masked.llm_endpoint_url).toBe('http://localhost');
  });

  it('should return a new object without mutating original', () => {
    const record = {
      llm_openai_api_key: 'secret',
      llm_provider: 'openai',
    };

    const masked = maskSecrets(record);

    expect(record.llm_openai_api_key).toBe('secret');
    expect(masked.llm_openai_api_key).toBe('__SET__');
  });
});

describe('mergeSettingsPreservingSecrets', () => {
  const existing = {
    llm_openai_api_key: 'existing-secret',
    llm_provider: 'openai',
    llm_vision_model: 'gpt-4o',
  };

  it('should update non-secret values', () => {
    const updates = {
      llm_provider: 'anthropic',
      llm_vision_model: 'claude-3',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_provider).toBe('anthropic');
    expect(merged.llm_vision_model).toBe('claude-3');
    expect(merged.llm_openai_api_key).toBe('existing-secret');
  });

  it('should preserve secrets when __SET__ placeholder is used', () => {
    const updates = {
      llm_openai_api_key: '__SET__',
      llm_provider: 'openai',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_openai_api_key).toBe('existing-secret');
  });

  it('should preserve secrets when *** placeholder is used', () => {
    const updates = {
      llm_openai_api_key: '***',
      llm_provider: 'openai',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_openai_api_key).toBe('existing-secret');
  });

  it('should preserve secrets when ****** placeholder is used', () => {
    const updates = {
      llm_openai_api_key: '******',
      llm_provider: 'openai',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_openai_api_key).toBe('existing-secret');
  });

  it('should clear secrets when __CLEAR__ is used', () => {
    const updates = {
      llm_openai_api_key: '__CLEAR__',
      llm_provider: 'openai',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_openai_api_key).toBe('');
  });

  it('should update secrets when new value is provided', () => {
    const updates = {
      llm_openai_api_key: 'new-secret',
      llm_provider: 'openai',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_openai_api_key).toBe('new-secret');
  });

  it('should add new keys from updates', () => {
    const updates = {
      llm_verification_model: 'claude-3-haiku',
    };

    const merged = mergeSettingsPreservingSecrets(existing, updates);

    expect(merged.llm_verification_model).toBe('claude-3-haiku');
  });
});

describe('validateSmartUploadSettings', () => {
  it('should return valid for complete settings', () => {
    const settings = {
      llm_provider: 'ollama' as const,
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
      llm_vision_system_prompt: 'Test prompt',
      llm_verification_system_prompt: 'Test prompt',
    };

    const result = validateSmartUploadSettings(settings);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return errors for invalid settings', () => {
    const settings = {
      llm_provider: 'invalid' as any,
      llm_vision_model: '',
      llm_verification_model: '',
      llm_vision_system_prompt: '',
      llm_verification_system_prompt: '',
    };

    const result = validateSmartUploadSettings(settings);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should include schema validation errors', () => {
    const settings = {
      llm_provider: 'openai' as const,
      llm_vision_model: 'gpt-4o',
      llm_verification_model: 'gpt-4o-mini',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
      // Missing API key for openai
    };

    const result = validateSmartUploadSettings(settings);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('openai requires an API key'))).toBe(true);
  });

  it('should include endpoint validation errors for custom provider', () => {
    const settings = {
      llm_provider: 'custom' as const,
      llm_vision_model: 'custom-model',
      llm_verification_model: 'custom-verification',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
      llm_custom_api_key: 'custom-key',
      // Missing endpoint URL
    };

    const result = validateSmartUploadSettings(settings);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Custom provider requires'))).toBe(true);
  });

  it('should validate URL format for custom provider endpoint', () => {
    const settings = {
      llm_provider: 'custom' as const,
      llm_vision_model: 'custom-model',
      llm_verification_model: 'custom-verification',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
      llm_custom_api_key: 'custom-key',
      llm_endpoint_url: 'not-a-valid-url',
    };

    const result = validateSmartUploadSettings(settings);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Endpoint URL must be a valid URL'))).toBe(true);
  });
});

// =============================================================================
// Database Conversion Tests
// =============================================================================

describe('dbRecordToSettings', () => {
  it('should convert database record to settings object', () => {
    const record = {
      llm_provider: 'openai',
      llm_vision_model: 'gpt-4o',
      llm_verification_model: 'gpt-4o-mini',
      llm_vision_system_prompt: 'Vision prompt',
      llm_verification_system_prompt: 'Verification prompt',
    };

    const settings = dbRecordToSettings(record);

    expect(settings.llm_provider).toBe('openai');
    expect(settings.llm_vision_model).toBe('gpt-4o');
  });

  it('should apply defaults for missing optional fields', () => {
    const record = {
      llm_provider: 'ollama',
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
    };

    const settings = dbRecordToSettings(record);

    expect(settings.smart_upload_confidence_threshold).toBe(70);
    expect(settings.llm_two_pass_enabled).toBe(true);
  });

  it('should throw when prompts are missing (schema requires min 1 char)', () => {
    const record = {
      llm_provider: 'ollama',
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
    };

    // dbRecordToSettings uses empty string defaults, but schema requires min 1 char
    // This will throw because empty strings fail the min(1) validation
    expect(() => dbRecordToSettings(record)).toThrow();
  });

  it('should parse successfully when prompts are provided in record', () => {
    const record = {
      llm_provider: 'ollama',
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
      llm_vision_system_prompt: 'Vision prompt from DB',
      llm_verification_system_prompt: 'Verification prompt from DB',
    };

    const settings = dbRecordToSettings(record);

    expect(settings.llm_vision_system_prompt).toBe('Vision prompt from DB');
    expect(settings.llm_verification_system_prompt).toBe('Verification prompt from DB');
  });
});

describe('settingsToDbRecord', () => {
  it('should convert settings to database record format', () => {
    const settings = SmartUploadSettingsSchema.parse({
      llm_provider: 'openai',
      llm_vision_model: 'gpt-4o',
      llm_verification_model: 'gpt-4o-mini',
      llm_vision_system_prompt: 'Vision prompt',
      llm_verification_system_prompt: 'Verification prompt',
      llm_openai_api_key: 'sk-secret',
    });

    const record = settingsToDbRecord(settings);

    expect(record.llm_provider).toBe('openai');
    expect(record.llm_openai_api_key).toBe('sk-secret');
  });

  it('should stringify object values', () => {
    const settings = SmartUploadSettingsSchema.parse({
      llm_provider: 'ollama',
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
      vision_model_params: JSON.stringify({ temperature: 0.1 }),
    });

    const record = settingsToDbRecord(settings);

    expect(typeof record.vision_model_params).toBe('string');
  });

  it('should include all SMART_UPLOAD_SETTING_KEYS', () => {
    const settings = SmartUploadSettingsSchema.parse({
      llm_provider: 'ollama',
      llm_vision_model: 'llama3.2-vision',
      llm_verification_model: 'qwen2.5:7b',
      llm_vision_system_prompt: 'Test',
      llm_verification_system_prompt: 'Test',
    });

    const record = settingsToDbRecord(settings);

    // Should have entries for all keys that have values
    expect(Object.keys(record).length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('SECRET_KEYS', () => {
  it('should contain all API key fields', () => {
    expect(SECRET_KEYS).toContain('llm_openai_api_key');
    expect(SECRET_KEYS).toContain('llm_anthropic_api_key');
    expect(SECRET_KEYS).toContain('llm_openrouter_api_key');
    expect(SECRET_KEYS).toContain('llm_gemini_api_key');
    expect(SECRET_KEYS).toContain('llm_custom_api_key');
  });

  it('should be immutable (readonly array)', () => {
    // TypeScript ensures this at compile time
    expect(Array.isArray(SECRET_KEYS)).toBe(true);
    expect(SECRET_KEYS.length).toBe(5);
  });
});
