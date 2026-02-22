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
  ExternalLink,
  Info,
  Loader2,
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// =============================================================================
// Constants
// =============================================================================

const LLM_PROVIDERS = [
  {
    value: 'ollama',
    label: 'Ollama (Local / Self-hosted)',
    description: 'OpenAI-compatible local inference server',
    requiresApiKey: false,
    defaultEndpoint: 'http://localhost:11434',
    defaultVisionModel: 'llama3.2-vision',
    defaultVerificationModel: 'qwen2.5:7b',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Vision',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultVisionModel: 'gpt-4o',
    defaultVerificationModel: 'gpt-4o-mini',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.anthropic.com',
    defaultVisionModel: 'claude-3-5-sonnet-20241022',
    defaultVerificationModel: 'claude-3-haiku-20240307',
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 1.5 Pro, Gemini Flash',
    requiresApiKey: true,
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultVisionModel: 'gemini-1.5-pro',
    defaultVerificationModel: 'gemini-1.5-flash',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Access 200+ models via OpenAI-compatible API',
    requiresApiKey: true,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultVisionModel: 'anthropic/claude-3.5-sonnet',
    defaultVerificationModel: 'meta-llama/llama-3.1-8b-instruct',
  },
  {
    value: 'custom',
    label: 'Custom (OpenAI-compatible)',
    description: 'vLLM, TGI, LM Studio, KiloCode Gateway, Groq, etc.',
    requiresApiKey: false,
    defaultEndpoint: '',
    defaultVisionModel: '',
    defaultVerificationModel: '',
  },
] as const;

type ProviderValue = typeof LLM_PROVIDERS[number]['value'];

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  llm_provider: z.enum(['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom']),
  llm_ollama_endpoint: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  llm_openai_api_key: z.string().optional(),
  llm_anthropic_api_key: z.string().optional(),
  llm_openrouter_api_key: z.string().optional(),
  llm_custom_base_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  llm_custom_api_key: z.string().optional(),
  llm_vision_model: z.string().min(1, 'Vision model is required'),
  llm_verification_model: z.string().min(1, 'Verification model is required'),
  llm_confidence_threshold: z
    .string()
    .transform(v => Number(v))
    .pipe(z.number().min(1).max(100))
    .or(z.number().min(1).max(100)),
  llm_two_pass_enabled: z.boolean(),
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

export function SmartUploadSettingsForm({ settings }: SmartUploadSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      llm_provider: (settings['llm_provider'] as ProviderValue) || 'ollama',
      llm_ollama_endpoint: settings['llm_ollama_endpoint'] || 'http://localhost:11434',
      llm_openai_api_key: settings['llm_openai_api_key'] || '',
      llm_anthropic_api_key: settings['llm_anthropic_api_key'] || '',
      llm_openrouter_api_key: settings['llm_openrouter_api_key'] || '',
      llm_custom_base_url: settings['llm_custom_base_url'] || '',
      llm_custom_api_key: settings['llm_custom_api_key'] || '',
      llm_vision_model: settings['llm_vision_model'] || 'llama3.2-vision',
      llm_verification_model: settings['llm_verification_model'] || 'qwen2.5:7b',
      llm_confidence_threshold: Number(settings['llm_confidence_threshold'] ?? 90),
      llm_two_pass_enabled: (settings['llm_two_pass_enabled'] ?? 'true') === 'true',
      llm_vision_system_prompt: settings['llm_vision_system_prompt'] || '',
      llm_verification_system_prompt: settings['llm_verification_system_prompt'] || '',
    },
  });

  const provider = form.watch('llm_provider') as ProviderValue;
  const providerConfig = LLM_PROVIDERS.find(p => p.value === provider);
  const twoPassEnabled = form.watch('llm_two_pass_enabled');

  // Fill default models when provider changes
  const handleProviderChange = (value: ProviderValue) => {
    form.setValue('llm_provider', value);
    const config = LLM_PROVIDERS.find(p => p.value === value);
    if (!config) return;
    if (config.defaultVisionModel) {
      form.setValue('llm_vision_model', config.defaultVisionModel);
    }
    if (config.defaultVerificationModel) {
      form.setValue('llm_verification_model', config.defaultVerificationModel);
    }
    if (value === 'ollama' && config.defaultEndpoint) {
      form.setValue('llm_ollama_endpoint', config.defaultEndpoint);
    }
    if (value === 'custom') {
      form.setValue('llm_custom_base_url', '');
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const serialised: Record<string, string> = {
        llm_provider: values.llm_provider,
        llm_ollama_endpoint: values.llm_ollama_endpoint ?? '',
        llm_openai_api_key: values.llm_openai_api_key ?? '',
        llm_anthropic_api_key: values.llm_anthropic_api_key ?? '',
        llm_openrouter_api_key: values.llm_openrouter_api_key ?? '',
        llm_custom_base_url: values.llm_custom_base_url ?? '',
        llm_custom_api_key: values.llm_custom_api_key ?? '',
        llm_vision_model: values.llm_vision_model,
        llm_verification_model: values.llm_verification_model,
        llm_confidence_threshold: String(values.llm_confidence_threshold),
        llm_two_pass_enabled: values.llm_two_pass_enabled ? 'true' : 'false',
        llm_vision_system_prompt: values.llm_vision_system_prompt ?? '',
        llm_verification_system_prompt: values.llm_verification_system_prompt ?? '',
      };

      const res = await fetch('/api/admin/uploads/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialised),
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
          endpoint: values.llm_ollama_endpoint || values.llm_custom_base_url || '',
          apiKey:
            values.llm_openai_api_key ||
            values.llm_anthropic_api_key ||
            values.llm_openrouter_api_key ||
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

            {/* Ollama endpoint */}
            {provider === 'ollama' && (
              <FormField
                control={form.control}
                name="llm_ollama_endpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ollama Endpoint</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="http://localhost:11434"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Base URL of your Ollama server (no trailing slash).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* OpenAI API key */}
            {provider === 'openai' && (
              <FormField
                control={form.control}
                name="llm_openai_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenAI API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="sk-…"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Your OpenAI secret key.{' '}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                      >
                        Get one here <ExternalLink className="h-3 w-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Anthropic API key */}
            {provider === 'anthropic' && (
              <FormField
                control={form.control}
                name="llm_anthropic_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anthropic API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="sk-ant-…"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Your Anthropic secret key.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* OpenRouter API key */}
            {provider === 'openrouter' && (
              <FormField
                control={form.control}
                name="llm_openrouter_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenRouter API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="sk-or-…"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Your OpenRouter API key.{' '}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                      >
                        Get one here <ExternalLink className="h-3 w-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Custom base URL + key */}
            {provider === 'custom' && (
              <>
                <FormField
                  control={form.control}
                  name="llm_custom_base_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://your-gateway.example.com/v1"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        OpenAI-compatible base URL (e.g. vLLM, TGI, Groq, Fireworks, LM Studio).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="llm_custom_api_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Bearer token or API key"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="llm_confidence_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence Threshold (%)</FormLabel>
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
                      Trigger 2nd-pass verification when confidence is below this value (1–100).
                      Default: 90.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="llm_two_pass_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
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
            </div>
          </CardContent>
        </Card>

        {/* Advanced: System Prompts */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Advanced: Custom System Prompts</CardTitle>
                    <CardDescription>
                      Override the default prompts sent to the LLM. Leave blank to use defaults.
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
                    Custom prompts must instruct the LLM to return valid JSON. Avoid including any
                    content from uploaded PDFs in static prompt text (prompt injection risk).
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="llm_vision_system_prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vision System Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={8}
                          placeholder="Leave blank to use the built-in prompt…"
                          className="font-mono text-xs"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
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
                          placeholder="Leave blank to use the built-in prompt…"
                          className="font-mono text-xs"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
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
              {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
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

        {/* Environment variable hint */}
        <div className="rounded-md border p-4 text-sm text-muted-foreground space-y-1">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Info className="h-4 w-4" />
            Environment Variable Overrides
          </p>
          <p>
            Settings saved here are stored in the database. The following environment variables
            take precedence when set:
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs list-disc list-inside">
            <li>LLM_OLLAMA_ENDPOINT</li>
            <li>LLM_VISION_MODEL</li>
            <li>LLM_VERIFICATION_MODEL</li>
          </ul>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
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
