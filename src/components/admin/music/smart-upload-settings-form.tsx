'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { LLM_PROVIDERS, getDefaultEndpointForProvider } from '@/lib/llm/providers';
import type { LLMProviderValue } from '@/lib/llm/providers';

// =============================================================================
// Constants
// =============================================================================

// LLM_PROVIDERS is imported from @/lib/llm/providers (single source of truth)

type ProviderValue = LLMProviderValue;

// Secret key configuration with display names
const SECRET_KEYS = [
  { key: 'llm_openai_api_key', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { key: 'llm_anthropic_api_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
  { key: 'llm_openrouter_api_key', label: 'OpenRouter API Key', placeholder: 'sk-or-...' },
  { key: 'llm_gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...' },
  { key: 'llm_custom_api_key', label: 'Custom API Key', placeholder: 'Bearer token or API key' },
] as const;

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  llm_provider: z.enum(['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom']),
  llm_endpoint_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  llm_openai_api_key: z.string().optional(),
  llm_anthropic_api_key: z.string().optional(),
  llm_openrouter_api_key: z.string().optional(),
  llm_gemini_api_key: z.string().optional(),
  llm_custom_api_key: z.string().optional(),
  llm_vision_model: z.string().min(1, 'Vision model is required'),
  llm_verification_model: z.string().min(1, 'Verification model is required'),
  smart_upload_confidence_threshold: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(0).max(100))
    .or(z.number().min(0).max(100)),
  smart_upload_auto_approve_threshold: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(0).max(100))
    .or(z.number().min(0).max(100)),
  smart_upload_rate_limit_rpm: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(1).max(1000))
    .or(z.number().min(1).max(1000)),
  smart_upload_max_concurrent: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(1).max(50))
    .or(z.number().min(1).max(50)),
  smart_upload_max_pages: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(1).max(100))
    .or(z.number().min(1).max(100)),
  smart_upload_max_file_size_mb: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(1).max(500))
    .or(z.number().min(1).max(500)),
  smart_upload_allowed_mime_types: z.string().optional(),
  vision_model_params: z.string().optional(),
  verification_model_params: z.string().optional(),
  llm_two_pass_enabled: z.boolean().default(true),
  llm_vision_system_prompt: z.string().optional(),
  llm_verification_system_prompt: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// =============================================================================
// Props
// =============================================================================

interface SmartUploadSettingsFormProps {
  settings: Record<string, string>;
}

// =============================================================================
// Component
// =============================================================================

// Secret input component with show/hide toggle and clear functionality
function SecretInput({
  value,
  onChange,
  placeholder,
  label: _label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const [show, setShow] = useState(false);
  const isSet = value === '__SET__';
  const _isUnset = value === '__UNSET__' || !value;

  if (isSet) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Key is set</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange('')}
        >
          Update
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange('__CLEAR__')}
          className="text-red-500 hover:text-red-600"
        >
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// JSON editor with validation
function JsonEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  const validateJson = (val: string) => {
    if (!val || val.trim() === '') {
      setError(null);
      return;
    }
    try {
      JSON.parse(val);
      setError(null);
    } catch {
      setError('Invalid JSON');
    }
  };

  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          validateJson(e.target.value);
        }}
        placeholder={placeholder || '{\n  "temperature": 0.1,\n  "max_tokens": 4000\n}'}
        className={cn(
          'font-mono text-xs min-h-[120px]',
          error && 'border-red-500 focus-visible:ring-red-500'
        )}
      />
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}

export function SmartUploadSettingsForm({ settings }: SmartUploadSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      llm_provider: (settings['llm_provider'] as ProviderValue) || 'ollama',
      llm_endpoint_url: settings['llm_endpoint_url'] || settings['llm_ollama_endpoint'] || getDefaultEndpointForProvider((settings['llm_provider'] as LLMProviderValue) || 'ollama'),
      llm_openai_api_key: settings['llm_openai_api_key'] || '',
      llm_anthropic_api_key: settings['llm_anthropic_api_key'] || '',
      llm_openrouter_api_key: settings['llm_openrouter_api_key'] || '',
      llm_gemini_api_key: settings['llm_gemini_api_key'] || '',
      llm_custom_api_key: settings['llm_custom_api_key'] || '',
      llm_vision_model: settings['llm_vision_model'] || 'llama3.2-vision',
      llm_verification_model: settings['llm_verification_model'] || 'qwen2.5:7b',
      smart_upload_confidence_threshold: Number(settings['smart_upload_confidence_threshold'] ?? settings['llm_confidence_threshold'] ?? 70),
      smart_upload_auto_approve_threshold: Number(settings['smart_upload_auto_approve_threshold'] ?? settings['llm_auto_approve_threshold'] ?? 90),
      smart_upload_rate_limit_rpm: Number(settings['smart_upload_rate_limit_rpm'] ?? settings['llm_rate_limit_rpm'] ?? 10),
      smart_upload_max_concurrent: Number(settings['smart_upload_max_concurrent'] ?? 3),
      smart_upload_max_pages: Number(settings['smart_upload_max_pages'] ?? 20),
      smart_upload_max_file_size_mb: Number(settings['smart_upload_max_file_size_mb'] ?? 50),
      smart_upload_allowed_mime_types: settings['smart_upload_allowed_mime_types'] || JSON.stringify(['application/pdf']),
      vision_model_params: settings['vision_model_params'] || settings['llm_vision_model_params'] || JSON.stringify({ temperature: 0.1, max_tokens: 4000 }),
      verification_model_params: settings['verification_model_params'] || settings['llm_verification_model_params'] || JSON.stringify({ temperature: 0.1, max_tokens: 4000 }),
      llm_two_pass_enabled: (settings['llm_two_pass_enabled'] ?? 'true') === 'true',
      llm_vision_system_prompt: settings['llm_vision_system_prompt'] || '',
      llm_verification_system_prompt: settings['llm_verification_system_prompt'] || '',
    },
  });

  const provider = form.watch('llm_provider') as ProviderValue;
  const providerConfig = LLM_PROVIDERS.find(p => p.value === provider);

  // Fill default models when provider changes
  const handleProviderChange = (value: ProviderValue) => {
    form.setValue('llm_provider', value);
    const config = LLM_PROVIDERS.find(p => p.value === value);
    if (!config) return;
    // Auto-populate endpoint for every provider, clear for custom
    if (value === 'custom') {
      form.setValue('llm_endpoint_url', '');
    } else {
      form.setValue('llm_endpoint_url', config.defaultEndpoint);
    }
    if (config.defaultVisionModel) {
      form.setValue('llm_vision_model', config.defaultVisionModel);
    }
    if (config.defaultVerificationModel) {
      form.setValue('llm_verification_model', config.defaultVerificationModel);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      // Build settings array for API
      const settingsToUpdate = [
        { key: 'llm_provider', value: values.llm_provider },
        { key: 'llm_endpoint_url', value: values.llm_endpoint_url ?? '' },
        { key: 'llm_openai_api_key', value: values.llm_openai_api_key ?? '' },
        { key: 'llm_anthropic_api_key', value: values.llm_anthropic_api_key ?? '' },
        { key: 'llm_openrouter_api_key', value: values.llm_openrouter_api_key ?? '' },
        { key: 'llm_gemini_api_key', value: values.llm_gemini_api_key ?? '' },
        { key: 'llm_custom_api_key', value: values.llm_custom_api_key ?? '' },
        { key: 'llm_vision_model', value: values.llm_vision_model },
        { key: 'llm_verification_model', value: values.llm_verification_model },
        { key: 'smart_upload_confidence_threshold', value: String(values.smart_upload_confidence_threshold) },
        { key: 'smart_upload_auto_approve_threshold', value: String(values.smart_upload_auto_approve_threshold) },
        { key: 'smart_upload_rate_limit_rpm', value: String(values.smart_upload_rate_limit_rpm) },
        { key: 'smart_upload_max_concurrent', value: String(values.smart_upload_max_concurrent) },
        { key: 'smart_upload_max_pages', value: String(values.smart_upload_max_pages) },
        { key: 'smart_upload_max_file_size_mb', value: String(values.smart_upload_max_file_size_mb) },
        { key: 'smart_upload_allowed_mime_types', value: values.smart_upload_allowed_mime_types || JSON.stringify(['application/pdf']) },
        { key: 'vision_model_params', value: values.vision_model_params || JSON.stringify({ temperature: 0.1, max_tokens: 4000 }) },
        { key: 'verification_model_params', value: values.verification_model_params || JSON.stringify({ temperature: 0.1, max_tokens: 4000 }) },
        { key: 'llm_two_pass_enabled', value: values.llm_two_pass_enabled ? 'true' : 'false' },
        { key: 'llm_vision_system_prompt', value: values.llm_vision_system_prompt ?? '' },
        { key: 'llm_verification_system_prompt', value: values.llm_verification_system_prompt ?? '' },
      ];

      const res = await fetch('/api/admin/uploads/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToUpdate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Server error ${res.status}`);
      }

      toast.success('Smart Upload settings saved successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const restoreDefaults = () => {
    const ollamaDefaults = LLM_PROVIDERS.find(p => p.value === 'ollama')!;
    form.setValue('llm_provider', 'ollama');
    form.setValue('llm_endpoint_url', ollamaDefaults.defaultEndpoint);
    form.setValue('llm_vision_model', ollamaDefaults.defaultVisionModel);
    form.setValue('llm_verification_model', ollamaDefaults.defaultVerificationModel);
    form.setValue('smart_upload_confidence_threshold', 70);
    form.setValue('smart_upload_auto_approve_threshold', 90);
    form.setValue('smart_upload_rate_limit_rpm', 10);
    form.setValue('smart_upload_max_concurrent', 3);
    form.setValue('smart_upload_max_pages', 20);
    form.setValue('smart_upload_max_file_size_mb', 50);
    form.setValue('smart_upload_allowed_mime_types', JSON.stringify(['application/pdf']));
    form.setValue('vision_model_params', JSON.stringify({ temperature: 0.1, max_tokens: 4000 }));
    form.setValue('verification_model_params', JSON.stringify({ temperature: 0.1, max_tokens: 4000 }));

    toast.info('Defaults restored. Click Save to apply.');
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const values = form.getValues();
      const res = await fetch('/api/admin/uploads/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: values.llm_provider,
          endpoint: values.llm_endpoint_url || '',
          apiKey:
            values.llm_openai_api_key ||
            values.llm_anthropic_api_key ||
            values.llm_openrouter_api_key ||
            values.llm_gemini_api_key ||
            values.llm_custom_api_key ||
            '',
          model: values.llm_vision_model,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setTestStatus('ok');
        setTestMessage(data.message ?? 'Connection successful.');
      } else {
        setTestStatus('error');
        setTestMessage(data.error ?? `Connection failed (${res.status}).`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Network error.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Provider Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              LLM Provider
            </CardTitle>
            <CardDescription>
              Choose the AI provider for metadata extraction. Using a local Ollama instance is
              recommended for privacy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="llm_provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={v => handleProviderChange(v as ProviderValue)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LLM_PROVIDERS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex flex-col">
                            <span>{p.label}</span>
                            <span className="text-xs text-muted-foreground">{p.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Endpoint URL */}
            <FormField
              control={form.control}
              name="llm_endpoint_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    {provider === 'ollama' 
                      ? 'Base URL of your Ollama server (no trailing slash).'
                      : 'Base URL for the API endpoint (OpenAI-compatible).'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* API Keys Section */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">API Keys</h4>
              
              {SECRET_KEYS.map(({ key, label, placeholder }) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key as keyof FormValues}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <SecretInput
                          value={String(field.value || '')}
                          onChange={field.onChange}
                          placeholder={placeholder}
                          label={label}
                        />
                      </FormControl>
                      <FormDescription>
                        {key === 'llm_openai_api_key' && (
                          <>
                            Your OpenAI secret key.{' '}
                            <a
                              href="https://platform.openai.com/api-keys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                            >
                              Get one here <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        )}
                        {key === 'llm_openrouter_api_key' && (
                          <>
                            Your OpenRouter API key.{' '}
                            <a
                              href="https://openrouter.ai/keys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                            >
                              Get one here <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Model Configuration</CardTitle>
            <CardDescription>
              Select which models to use for the two-pass extraction pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="llm_vision_model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vision Model (1st pass)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={providerConfig?.defaultVisionModel || 'model-name'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Must support image inputs for reading the PDF cover page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="llm_verification_model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Model (2nd pass)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={providerConfig?.defaultVerificationModel || 'model-name'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Used to verify/correct low-confidence extractions. Can be faster/cheaper.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Thresholds & Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Thresholds & Limits</CardTitle>
            <CardDescription>
              Configure confidence thresholds and processing limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="smart_upload_confidence_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence Threshold (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Minimum confidence to accept without verification (0-100).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smart_upload_auto_approve_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auto-Approve Threshold (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Confidence required for automatic approval (0-100).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="smart_upload_rate_limit_rpm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Limit (RPM)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum LLM requests per minute.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smart_upload_max_concurrent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Concurrent Jobs</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum simultaneous upload processing jobs.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="smart_upload_max_pages"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Pages for Analysis</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum PDF pages to analyze with LLM.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smart_upload_max_file_size_mb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max File Size (MB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        {...field}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum file size for uploaded PDFs.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="llm_two_pass_enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Enable Two-Pass Verification</FormLabel>
                    <FormDescription>
                      Run a second LLM pass when confidence is below threshold.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Advanced: JSON Parameters & System Prompts */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Advanced Settings</CardTitle>
                    <CardDescription>
                      Model parameters and custom system prompts.
                    </CardDescription>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 text-muted-foreground transition-transform',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 flex gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>
                    These settings are for advanced users. Incorrect values may cause processing failures.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="vision_model_params"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vision Model Parameters (JSON)</FormLabel>
                        <FormControl>
                          <JsonEditor
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder='{\n  "temperature": 0.1,\n  "max_tokens": 4000\n}'
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Provider-specific parameters for the vision model.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="verification_model_params"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Verification Model Parameters (JSON)</FormLabel>
                        <FormControl>
                          <JsonEditor
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder='{\n  "temperature": 0.1,\n  "max_tokens": 4000\n}'
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Provider-specific parameters for the verification model.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="smart_upload_allowed_mime_types"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed MIME Types (JSON Array)</FormLabel>
                      <FormControl>
                        <JsonEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder='[\n  "application/pdf"\n]'
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        JSON array of allowed MIME types for upload.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="llm_vision_system_prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vision System Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={8}
                          placeholder="Leave blank to use the built-in prompt..."
                          className="font-mono text-xs"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Custom system prompt for the vision model. Must instruct the LLM to return valid JSON.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="llm_verification_system_prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification System Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={6}
                          placeholder="Leave blank to use the built-in prompt..."
                          className="font-mono text-xs"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Custom system prompt for the verification model.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Test Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test Connection</CardTitle>
            <CardDescription>
              Verify that the configured endpoint and API key are reachable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>

            {testStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {testMessage}
              </span>
            )}
            {testStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {testMessage}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={restoreDefaults}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore Defaults
          </Button>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
