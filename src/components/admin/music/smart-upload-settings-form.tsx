'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Wifi,
  FileText,
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
import { LLM_PROVIDERS } from '@/lib/llm/providers';
import {
  SmartUploadSettingsSchema,
  type SmartUploadSettings,
  type ProviderValue,
  getApiKeyFieldForProvider,
  providerRequiresApiKey,
  providerRequiresEndpoint,
} from '@/lib/smart-upload/schema';

// =============================================================================
// Types
// =============================================================================

interface ModelInfo {
  id: string;
  name: string;
  isVision: boolean;
  priceDisplay: string;
  recommended: boolean;
  recommendationReason?: string;
}

interface ModelsResponse {
  models: ModelInfo[];
  recommendedModel: string | null;
  warning?: string;
}

// =============================================================================
// Component
// =============================================================================

// Secret input component with show/hide toggle
function SecretInput({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isSet = value === '__SET__';

  if (isSet) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Key is set</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange('')} disabled={disabled}>
          Update
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange('__CLEAR__')}
          disabled={disabled}
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
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// Model selector with recommended badge
function ModelSelector({
  models,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {models.length === 0 ? (
          <SelectItem value="" disabled>
            No models available
          </SelectItem>
        ) : (
          models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2 w-full">
                <span className="flex-1 truncate">{model.name}</span>
                {model.recommended && (
                  <Badge variant="default" className="bg-primary text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Recommended
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{model.priceDisplay}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

interface SmartUploadSettingsFormProps {
  settings: Record<string, string>;
}

export function SmartUploadSettingsForm({ settings }: SmartUploadSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingPrompts, setIsResettingPrompts] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Model fetching state
  const [visionModels, setVisionModels] = useState<ModelInfo[]>([]);
  const [verificationModels, setVerificationModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const form = useForm<SmartUploadSettings>({
    resolver: zodResolver(SmartUploadSettingsSchema),
    defaultValues: {
      llm_provider: (settings['llm_provider'] as ProviderValue) || 'ollama',
      llm_endpoint_url: settings['llm_endpoint_url'] || '',
      llm_openai_api_key: settings['llm_openai_api_key'] || '',
      llm_anthropic_api_key: settings['llm_anthropic_api_key'] || '',
      llm_openrouter_api_key: settings['llm_openrouter_api_key'] || '',
      llm_gemini_api_key: settings['llm_gemini_api_key'] || '',
      llm_custom_api_key: settings['llm_custom_api_key'] || '',
      llm_vision_model: settings['llm_vision_model'] || '',
      llm_verification_model: settings['llm_verification_model'] || '',
      llm_vision_system_prompt: settings['llm_vision_system_prompt'] || '',
      llm_verification_system_prompt: settings['llm_verification_system_prompt'] || '',
      llm_prompt_version: settings['llm_prompt_version'] || '1.0.0',
      smart_upload_confidence_threshold: Number(settings['smart_upload_confidence_threshold'] ?? 70),
      smart_upload_auto_approve_threshold: Number(settings['smart_upload_auto_approve_threshold'] ?? 90),
      smart_upload_rate_limit_rpm: Number(settings['smart_upload_rate_limit_rpm'] ?? 15),
      smart_upload_max_concurrent: Number(settings['smart_upload_max_concurrent'] ?? 3),
      smart_upload_max_pages: Number(settings['smart_upload_max_pages'] ?? 20),
      smart_upload_max_file_size_mb: Number(settings['smart_upload_max_file_size_mb'] ?? 50),
      smart_upload_allowed_mime_types: settings['smart_upload_allowed_mime_types'] || '',
      vision_model_params: settings['vision_model_params'] || '',
      verification_model_params: settings['verification_model_params'] || '',
      llm_two_pass_enabled: (settings['llm_two_pass_enabled'] ?? 'true') === 'true',
      smart_upload_schema_version: settings['smart_upload_schema_version'] || '1.0.0',
    },
  });

  const provider = form.watch('llm_provider');
  const providerConfig = LLM_PROVIDERS.find((p) => p.value === provider);
  const apiKeyField = getApiKeyFieldForProvider(provider);
  const apiKeyValue = form.watch(apiKeyField as keyof SmartUploadSettings) as string;

  // Fetch models when provider or API key changes
  const fetchModels = useCallback(async () => {
    if (provider === 'custom') {
      // Custom provider - models must be entered manually
      setVisionModels([]);
      setVerificationModels([]);
      return;
    }

    if (providerRequiresApiKey(provider) && (!apiKeyValue || apiKeyValue === '__UNSET__')) {
      setModelError('Please enter an API key to fetch available models');
      setVisionModels([]);
      setVerificationModels([]);
      return;
    }

    setIsLoadingModels(true);
    setModelError(null);

    try {
      const params = new URLSearchParams({ provider });
      // Only forward the key if the user has typed a real value (not a masked placeholder).
      // When the key is '__SET__', the server resolves it from the DB automatically.
      if (apiKeyValue && !apiKeyValue.startsWith('__')) {
        params.set('apiKey', apiKeyValue);
      }
      // Forward endpoint for providers that need it; server falls back to DB / default.
      const endpointValue = form.getValues('llm_endpoint_url');
      if (endpointValue) {
        params.set('endpoint', endpointValue);
      }

      const response = await fetch(`/api/admin/uploads/models?${params}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch models');
      }

      const data: ModelsResponse = await response.json();
      
      setVisionModels(data.models);
      setVerificationModels(data.models);

      // Auto-select recommended model if current selection is empty or invalid
      const currentVision = form.getValues('llm_vision_model');
      const currentVerification = form.getValues('llm_verification_model');
      
      const validModelIds = data.models.map((m) => m.id);
      
      if ((!currentVision || !validModelIds.includes(currentVision)) && data.recommendedModel) {
        form.setValue('llm_vision_model', data.recommendedModel);
      }
      
      if ((!currentVerification || !validModelIds.includes(currentVerification)) && data.recommendedModel) {
        // For verification, prefer cheaper/smaller models if available
        const verificationModel = data.models.find(
          (m) => !m.recommended && m.priceDisplay.includes('Free')
        )?.id || data.recommendedModel;
        form.setValue('llm_verification_model', verificationModel);
      }

      if (data.warning) {
        toast.warning(data.warning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      setModelError(message);
      toast.error(message);
    } finally {
      setIsLoadingModels(false);
    }
  }, [provider, apiKeyValue, form]);

  // Fetch models on initial load and when dependencies change
  useEffect(() => {
    if (provider !== 'custom') {
      fetchModels();
    }
  }, [provider, fetchModels]);

  const handleProviderChange = (value: ProviderValue) => {
    form.setValue('llm_provider', value);
    
    const config = LLM_PROVIDERS.find((p) => p.value === value);
    if (config) {
      // Clear other provider API keys for security
      const allKeyFields = [
        'llm_openai_api_key',
        'llm_anthropic_api_key',
        'llm_openrouter_api_key',
        'llm_gemini_api_key',
        'llm_custom_api_key',
      ];
      allKeyFields.forEach((field) => {
        if (field !== getApiKeyFieldForProvider(value)) {
          form.setValue(field as keyof SmartUploadSettings, '');
        }
      });

      // Set endpoint for custom provider
      if (value === 'custom') {
        form.setValue('llm_endpoint_url', '');
      } else {
        form.setValue('llm_endpoint_url', config.defaultEndpoint);
      }

      // Clear models until we fetch new ones
      form.setValue('llm_vision_model', '');
      form.setValue('llm_verification_model', '');
    }
  };

  const onSubmit = async (values: SmartUploadSettings) => {
    setIsSaving(true);
    try {
      const settingsToUpdate = Object.entries(values).map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
      }));

      const res = await fetch('/api/admin/uploads/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToUpdate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Server error ${res.status}`);
      }

      toast.success('Smart Upload settings saved successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPrompts = async () => {
    setIsResettingPrompts(true);
    try {
      const res = await fetch('/api/admin/uploads/settings/reset-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      
      // Update form values
      if (data.prompts) {
        form.setValue('llm_vision_system_prompt', data.prompts.llm_vision_system_prompt);
        form.setValue('llm_verification_system_prompt', data.prompts.llm_verification_system_prompt);
        form.setValue('llm_prompt_version', data.prompts.llm_prompt_version);
      }

      toast.success('Prompts reset to defaults');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset prompts';
      toast.error(msg);
    } finally {
      setIsResettingPrompts(false);
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const values = form.getValues();
      
      // Get the API key for the selected provider
      const keyField = getApiKeyFieldForProvider(provider);
      const apiKey = values[keyField as keyof SmartUploadSettings] as string;

      const res = await fetch('/api/admin/uploads/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: values.llm_provider,
          endpoint: values.llm_endpoint_url || '',
          apiKey: apiKey || '',
          model: values.llm_vision_model,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setTestStatus('ok');
        setTestMessage(data.message ?? 'Connection successful');
      } else {
        setTestStatus('error');
        setTestMessage(data.error ?? `Connection failed (${res.status})`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Network error');
    }
  };

  const requiresApiKey = providerRequiresApiKey(provider);
  const requiresEndpoint = providerRequiresEndpoint(provider);

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
                  <Select value={field.value} onValueChange={(v) => handleProviderChange(v as ProviderValue)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LLM_PROVIDERS.map((p) => (
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

            {/* Endpoint URL (only for custom provider) */}
            {requiresEndpoint && (
              <FormField
                control={form.control}
                name="llm_endpoint_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://api.example.com/v1"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>Base URL for the custom API endpoint</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* API Key (only for providers that require it) */}
            {requiresApiKey && (
              <FormField
                control={form.control}
                name={apiKeyField as keyof SmartUploadSettings}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      {providerConfig?.apiKeyLabel || 'API Key'}
                      {providerConfig?.docsUrl && (
                        <a
                          href={providerConfig.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-0.5 text-xs underline-offset-2 hover:underline"
                        >
                          Get key <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </FormLabel>
                    <FormControl>
                      <SecretInput
                        value={String(field.value || '')}
                        onChange={field.onChange}
                        placeholder={providerConfig?.apiKeyPlaceholder || 'Enter API key'}
                      />
                    </FormControl>
                    <FormDescription>
                      Your {provider} API key. This is stored securely and never shared.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Model Fetch Error */}
            {modelError && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{modelError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Model Configuration
            </CardTitle>
            <CardDescription>
              Select which models to use for the two-pass extraction pipeline.
              Models are automatically fetched from the provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchModels}
                disabled={isLoadingModels || provider === 'custom'}
              >
                {isLoadingModels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">{isLoadingModels ? 'Loading...' : 'Refresh Models'}</span>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="llm_vision_model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vision Model (1st pass)</FormLabel>
                    <FormControl>
                      {provider === 'custom' ? (
                        <Input
                          placeholder="Enter model name"
                          {...field}
                          value={field.value || ''}
                        />
                      ) : (
                        <ModelSelector
                          models={visionModels}
                          value={field.value || ''}
                          onChange={field.onChange}
                          disabled={isLoadingModels || !!modelError}
                          placeholder="Select vision model"
                        />
                      )}
                    </FormControl>
                    <FormDescription>Must support image inputs for reading PDF pages</FormDescription>
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
                      {provider === 'custom' ? (
                        <Input
                          placeholder="Enter model name"
                          {...field}
                          value={field.value || ''}
                        />
                      ) : (
                        <ModelSelector
                          models={verificationModels}
                          value={field.value || ''}
                          onChange={field.onChange}
                          disabled={isLoadingModels || !!modelError}
                          placeholder="Select verification model"
                        />
                      )}
                    </FormControl>
                    <FormDescription>Can be faster/cheaper than vision model</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* System Prompts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  System Prompts
                </CardTitle>
                <CardDescription>
                  Customize the AI prompts used for metadata extraction.
                  Reset to defaults if you encounter issues.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetPrompts}
                disabled={isResettingPrompts}
              >
                {isResettingPrompts ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                <span className="ml-2">Reset to Defaults</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                These prompts control how the AI extracts metadata from your PDFs.
                Only modify if you understand the JSON output requirements.
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
                      className="font-mono text-xs"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Instructions for the first-pass vision model. Must request JSON output.
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
                      className="font-mono text-xs"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Instructions for the second-pass verification model.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Advanced Settings</CardTitle>
                    <CardDescription>
                      Confidence thresholds and processing limits.
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
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Minimum confidence to accept without verification
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
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Confidence required for automatic approval
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
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Maximum LLM requests per minute</FormDescription>
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
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Maximum simultaneous upload processing jobs</FormDescription>
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
                        <FormDescription className="text-xs">
                          Run a second LLM pass when confidence is below threshold
                        </FormDescription>
                      </div>
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
            <CardDescription>Verify that the configured endpoint and API key are reachable</CardDescription>
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
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSaving} size="lg">
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
