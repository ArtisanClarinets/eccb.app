import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Better Auth
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: z.string().url().default('http://localhost:3000'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  
  // Super Admin Credentials
  SUPER_ADMIN_EMAIL: z.string().email().default('admin@eccb.org'),
  // No default password - must be explicitly set, especially in production
  SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters').optional(),

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Storage Configuration
  STORAGE_DRIVER: z.enum(['LOCAL', 'S3']).default('LOCAL'),
  LOCAL_STORAGE_PATH: z.string().default('./storage'),
  MAX_FILE_SIZE: z.coerce.number().default(52428800), // 50MB default

  // S3/MinIO Storage (optional when using LOCAL storage)
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform(val => val === 'true'),
  
  // Email Configuration
  EMAIL_DRIVER: z.enum(['SMTP', 'LOG', 'NONE']).default('LOG'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@eccb.app'),
  SMTP_SECURE: z.string().default('false').transform(val => val === 'true'),
  
  // App Config
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Emerald Coast Community Band'),
  
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Push Notifications (VAPID keys - optional)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  
  // File scanning (ClamAV - optional)
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),
  ENABLE_VIRUS_SCAN: z.string().default('false').transform(val => val === 'true'),

  // =============================================================================
  // Smart Upload Feature
  // =============================================================================

  // Smart Upload Feature Flags
  SMART_UPLOAD_ENABLED: z.string().default('false').transform(val => val === 'true'),
  SMART_UPLOAD_MAX_FILES: z.coerce.number().default(20),
  SMART_UPLOAD_MAX_TOTAL_BYTES: z.coerce.number().default(524288000), // 500MB
  SMART_UPLOAD_OCR_MODE: z.enum(['pdf_text', 'tesseract', 'ocrmypdf', 'vision_api']).default('pdf_text'),

  // =============================================================================
  // AI Provider Configuration
  // =============================================================================

  // AI Provider
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'openrouter', 'openai_compat']).default('openai'),
  AI_MODEL: z.string().optional(),
  AI_TEMPERATURE: z.coerce.number().default(0.1),

  // Provider API Keys (all optional - validation happens at runtime when feature is used)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  // OpenAI-Compatible Provider (for local models like Ollama, LM Studio, etc.)
  OPENAI_COMPAT_BASE_URL: z.string().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),

  // Custom Provider Escape Hatch
  CUSTOM_AI_BASE_URL: z.string().optional(),
  CUSTOM_AI_HEADERS_JSON: z.string().optional(),

  // KiloCode Provider
  KILO_API_KEY: z.string().optional(),

  // =============================================================================
  // Encryption
  // =============================================================================

  // Encryption key for sensitive data (32 bytes / 64 hex characters for AES-256)
  ENCRYPTION_KEY: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  
  const data = parsed.data;
  
  // Validate S3 credentials when using S3 storage
  if (data.STORAGE_DRIVER === 'S3') {
    if (!data.S3_ACCESS_KEY_ID || !data.S3_SECRET_ACCESS_KEY) {
      console.error('❌ S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER is S3');
      throw new Error('S3 credentials required for S3 storage driver');
    }
    if (!data.S3_ENDPOINT || !data.S3_BUCKET_NAME) {
      console.error('❌ S3_ENDPOINT and S3_BUCKET_NAME are required when STORAGE_DRIVER is S3');
      throw new Error('S3 endpoint and bucket required for S3 storage driver');
    }
  }
  
  // Validate SMTP credentials when using SMTP email driver
  if (data.EMAIL_DRIVER === 'SMTP') {
    if (!data.SMTP_HOST) {
      console.error('❌ SMTP_HOST is required when EMAIL_DRIVER is SMTP');
      throw new Error('SMTP host required for SMTP email driver');
    }
    if (!data.SMTP_PORT) {
      console.error('❌ SMTP_PORT is required when EMAIL_DRIVER is SMTP');
      throw new Error('SMTP port required for SMTP email driver');
    }
  }
  
  // Require SUPER_ADMIN_PASSWORD in production
  if (data.NODE_ENV === 'production' && !data.SUPER_ADMIN_PASSWORD) {
    console.error('❌ SUPER_ADMIN_PASSWORD is required in production');
    throw new Error('SUPER_ADMIN_PASSWORD must be set in production environment');
  }

  // Validate AI provider credentials when Smart Upload is enabled
  if (data.SMART_UPLOAD_ENABLED) {
    const hasApiKey = data.OPENAI_API_KEY || data.ANTHROPIC_API_KEY ||
      data.GEMINI_API_KEY || data.OPENROUTER_API_KEY ||
      data.OPENAI_COMPAT_API_KEY || data.CUSTOM_AI_BASE_URL;

    if (!hasApiKey && data.AI_PROVIDER !== 'openai_compat') {
      console.warn('⚠️ Smart Upload is enabled but no AI provider API key is configured');
      console.warn('   Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY');
    }

    // Validate AI_TEMPERATURE is in valid range
    if (data.AI_TEMPERATURE < 0 || data.AI_TEMPERATURE > 2) {
      console.error('❌ AI_TEMPERATURE must be between 0 and 2');
      throw new Error('AI_TEMPERATURE must be between 0 and 2');
    }

    // Validate CUSTOM_AI_HEADERS_JSON is valid JSON if provided
    if (data.CUSTOM_AI_HEADERS_JSON) {
      try {
        JSON.parse(data.CUSTOM_AI_HEADERS_JSON);
      } catch {
        console.error('❌ CUSTOM_AI_HEADERS_JSON must be valid JSON');
        throw new Error('CUSTOM_AI_HEADERS_JSON must be valid JSON');
      }
    }
  }

  return data;
}

export const env = validateEnv();

export type Env = z.infer<typeof envSchema>;
