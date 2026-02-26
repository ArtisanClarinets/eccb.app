/**
 * Update LLM Configuration in the Database
 *
 * This script updates the database with correct LLM provider settings.
 * It ensures all API endpoints and secrets are correctly configured.
 */

import { prisma } from '../src/lib/db';

async function updateLLMConfig() {
  console.log('🔄 Updating LLM configuration in database...\n');

  // Read configuration from environment variables
  const provider = process.env.LLM_PROVIDER || 'ollama';
  const endpointUrl = process.env.LLM_ENDPOINT_URL || getDefaultEndpoint(provider);
  const visionModel = process.env.LLM_VISION_MODEL || getDefaultVisionModel(provider);
  const verificationModel =
    process.env.LLM_VERIFICATION_MODEL || getDefaultVerificationModel(provider);

  const updates = [
    { key: 'llm_provider', value: provider, description: 'Active LLM provider' },
    {
      key: 'llm_endpoint_url',
      value: endpointUrl,
      description: 'LLM provider endpoint URL',
    },
    {
      key: 'llm_vision_model',
      value: visionModel,
      description: 'Model for first-pass vision analysis',
    },
    {
      key: 'llm_verification_model',
      value: verificationModel,
      description: 'Model for second-pass verification',
    },

    // API Keys
    {
      key: 'llm_openai_api_key',
      value: process.env.LLM_OPENAI_API_KEY || '',
      description: 'OpenAI API key',
    },
    {
      key: 'llm_anthropic_api_key',
      value: process.env.LLM_ANTHROPIC_API_KEY || '',
      description: 'Anthropic API key',
    },
    {
      key: 'llm_openrouter_api_key',
      value: process.env.LLM_OPENROUTER_API_KEY || '',
      description: 'OpenRouter API key',
    },
    {
      key: 'llm_gemini_api_key',
      value: process.env.LLM_GEMINI_API_KEY || '',
      description: 'Google Gemini API key',
    },
    {
      key: 'llm_custom_api_key',
      value: process.env.LLM_CUSTOM_API_KEY || '',
      description: 'Custom API key for OpenAI-compatible endpoints',
    },

    // Behavior settings
    {
      key: 'llm_skip_parse_threshold',
      value: process.env.LLM_SKIP_PARSE_THRESHOLD || '60',
      description: 'Confidence threshold for second-pass (0-100)',
    },
    {
      key: 'llm_auto_approve_threshold',
      value: process.env.LLM_AUTO_APPROVE_THRESHOLD || '90',
      description: 'Auto-approve threshold (0-100)',
    },
    {
      key: 'llm_rate_limit_rpm',
      value: process.env.LLM_RATE_LIMIT_RPM || '15',
      description: 'Rate limit in requests per minute',
    },
    {
      key: 'llm_two_pass_enabled',
      value: process.env.LLM_TWO_PASS_ENABLED || 'true',
      description: 'Enable two-pass verification',
    },

    // Canonical Smart Upload keys (preferred over legacy llm_* equivalents)
    {
      key: 'smart_upload_confidence_threshold',
      value: process.env.SMART_UPLOAD_CONFIDENCE_THRESHOLD || '70',
      description: 'Minimum confidence score (0-100) to accept a first-pass parse result',
    },
    {
      key: 'smart_upload_auto_approve_threshold',
      value: process.env.SMART_UPLOAD_AUTO_APPROVE_THRESHOLD || '90',
      description: 'Confidence score (0-100) at which a session is auto-approved without human review',
    },
    {
      key: 'smart_upload_rate_limit_rpm',
      value: process.env.SMART_UPLOAD_RATE_LIMIT_RPM || '15',
      description: 'LLM rate limit in requests per minute for the smart-upload pipeline',
    },
    {
      key: 'smart_upload_skip_parse_threshold',
      value: process.env.SMART_UPLOAD_SKIP_PARSE_THRESHOLD || '60',
      description: 'Confidence below which a second-pass re-extraction is always triggered',
    },
    {
      key: 'smart_upload_max_pages',
      value: process.env.SMART_UPLOAD_MAX_PAGES || '20',
      description: 'Maximum number of PDF pages to send to the LLM in a single call',
    },
    {
      key: 'smart_upload_max_concurrent',
      value: process.env.SMART_UPLOAD_MAX_CONCURRENT || '3',
      description: 'Maximum number of concurrent smart-upload BullMQ jobs',
    },
    {
      key: 'smart_upload_allowed_mime_types',
      value: process.env.SMART_UPLOAD_ALLOWED_MIME_TYPES || '["application/pdf"]',
      description: 'JSON array of MIME types accepted by the upload endpoint',
    },
    {
      key: 'vision_model_params',
      value: process.env.VISION_MODEL_PARAMS || '{"temperature":0.1,"max_tokens":4096}',
      description: 'Additional JSON parameters merged into the first-pass vision LLM request',
    },
    {
      key: 'verification_model_params',
      value: process.env.VERIFICATION_MODEL_PARAMS || '{"temperature":0.1,"max_tokens":4096}',
      description: 'Additional JSON parameters merged into the second-pass verification LLM request',
    },
    {
      key: 'llm_prompt_version',
      value: '2.0.0',
      description: 'Current prompt version used by the smart-upload pipeline',
    },
  ];

  for (const setting of updates) {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: setting.key },
      });

      if (existing) {
        await prisma.systemSetting.update({
          where: { key: setting.key },
          data: { value: setting.value, description: setting.description },
        });
        console.log(`✅ Updated: ${setting.key}`);
      } else {
        await prisma.systemSetting.create({
          data: {
            key: setting.key,
            value: setting.value,
            description: setting.description,
          },
        });
        console.log(`✨ Created: ${setting.key}`);
      }
    } catch (err) {
      console.error(`❌ Error updating ${setting.key}:`, err);
    }
  }

  console.log('\n📋 Configuration Summary:');
  console.log(`   Provider: ${provider}`);
  console.log(`   Endpoint: ${endpointUrl}`);
  console.log(`   Vision Model: ${visionModel}`);
  console.log(`   Verification Model: ${verificationModel}`);
  console.log(
    `   API Keys: ${[
      ...['openai', 'anthropic', 'openrouter', 'gemini', 'custom']
        .map((p) => {
          const key = `llm_${p}_api_key`;
          const val = updates.find((u) => u.key === key)?.value;
          return val ? `${p}✓` : `${p}✗`;
        })
        .filter((x) => x),
    ]}`
  );
  console.log('\n✅ Database configuration updated successfully!');
  console.log('   Restart the dev server for changes to take effect.');
}

function getDefaultEndpoint(provider: string): string {
  const endpoints: Record<string, string> = {
    ollama: 'http://localhost:11434',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    openrouter: 'https://openrouter.ai/api/v1',
  };
  return endpoints[provider] || '';
}

function getDefaultVisionModel(provider: string): string {
  const models: Record<string, string> = {
    ollama: 'llama3.2-vision',
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-2.0-flash-exp',
    openrouter: 'google/gemini-2.0-flash-exp:free',
  };
  return models[provider] || '';
}

function getDefaultVerificationModel(provider: string): string {
  const models: Record<string, string> = {
    ollama: 'qwen2.5:7b',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
    gemini: 'gemini-2.0-flash-exp',
    openrouter: 'google/gemma-3-27b-it:free',
  };
  return models[provider] || '';
}

updateLLMConfig()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
