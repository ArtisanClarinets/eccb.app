import { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { SYSTEM_CONFIG } from '@/lib/auth/permission-constants';
import { SmartUploadSettingsForm } from '@/components/admin/music/smart-upload-settings-form';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Smart Upload Settings',
};

// Keys managed on this page
const SETTING_KEYS = [
  'llm_provider',
  'llm_ollama_endpoint',
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_openrouter_api_key',
  'llm_custom_base_url',
  'llm_custom_api_key',
  'llm_vision_model',
  'llm_verification_model',
  'llm_confidence_threshold',
  'llm_two_pass_enabled',
  'llm_vision_system_prompt',
  'llm_verification_system_prompt',
  'llm_rate_limit_rpm',
  'llm_auto_approve_threshold',
  'llm_skip_parse_threshold',
  'llm_vision_model_params',
  'llm_verification_model_params',
] as const;

async function getSmartUploadSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value ?? '';
    return acc;
  }, {});
}

export default async function SmartUploadSettingsPage() {
  await requirePermission(SYSTEM_CONFIG);
  const settings = await getSmartUploadSettings();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Smart Upload Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure the AI/LLM models used for automatic metadata extraction from music PDFs.
        </p>
      </div>

      <SmartUploadSettingsForm settings={settings} />
    </div>
  );
}
