'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useSmartUploadSettings, getProviderLogo, getProviderColor, AIModel, ModelParameter } from '@/hooks/use-smart-upload-settings';
import {
  Settings,
  Sparkles,
  Key,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronRight,
  Loader2,
  Star,
  Zap,
  Check,
  X,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

interface ProviderCardProps {
  provider: {
    id: string;
    providerId: string;
    displayName: string;
    description: string;
    isEnabled: boolean;
    isDefault: boolean;
    hasValidApiKey: boolean;
    capabilities: {
      vision: boolean;
      structuredOutput: boolean;
    } | null;
  };
  onToggle: (enabled: boolean) => void;
  onSetDefault: () => void;
  onConfigure: () => void;
  isDefaultProvider: boolean;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * API Key Configuration Dialog
 */
function ApiKeyDialog({
  provider,
  open,
  onOpenChange,
  onSave,
}: {
  provider: { id: string; displayName: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (providerId: string, apiKey: string) => Promise<boolean>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const handleValidate = useCallback(async () => {
    if (!provider) return;
    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch(
        `/api/admin/smart-upload-settings/providers/${provider.id}/validate-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        }
      );
      const data = await response.json();
      setValidationResult({ valid: data.valid, error: data.error });
    } catch {
      setValidationResult({ valid: false, error: 'Validation failed' });
    } finally {
      setIsValidating(false);
    }
  }, [provider, apiKey]);

  const handleSave = useCallback(async () => {
    if (!provider) return;
    setIsSaving(true);

    const success = await onSave(provider.id, apiKey);
    if (success) {
      toast.success('API key saved successfully');
      setApiKey('');
      setValidationResult(null);
      onOpenChange(false);
    } else {
      toast.error('Failed to save API key');
    }
    setIsSaving(false);
  }, [provider, apiKey, onSave, onOpenChange]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setApiKey('');
        setValidationResult(null);
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure API Key</DialogTitle>
          <DialogDescription>
            Enter your {provider?.displayName} API key to enable this provider.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {validationResult && (
            <div
              className={cn(
                'flex items-center gap-2 text-sm',
                validationResult.valid ? 'text-green-600' : 'text-destructive'
              )}
            >
              {validationResult.valid ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {validationResult.valid ? 'API key is valid' : validationResult.error}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={!apiKey || isValidating}
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Validate'
            )}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!apiKey || !validationResult?.valid || isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Model Selection Component
 */
function ModelSelector({
  providerId,
  onModelSelect,
  selectedModelId,
}: {
  providerId: string;
  onModelSelect: (modelId: string) => void;
  selectedModelId: string | null;
}) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/smart-upload-settings/providers/${providerId}/models`);
      const data = await response.json();
      setModels(data.models || []);
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/admin/smart-upload-settings/providers/${providerId}/models`, {
        method: 'POST',
      });
      await loadModels();
      toast.success('Models refreshed');
    } catch {
      toast.error('Failed to refresh models');
    } finally {
      setIsRefreshing(false);
    }
  }, [providerId, loadModels]);

  useEffect(() => {
    if (providerId) {
      loadModels();
    }
  }, [providerId, loadModels]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Model</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-1', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : models.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border rounded-lg">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          No models available. Please configure an API key first.
        </div>
      ) : (
        <Select value={selectedModelId || ''} onValueChange={onModelSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span>{model.displayName}</span>
                  {model.isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * Model Parameters Component
 */
function ParameterEditor({
  parameters,
  onChange,
}: {
  parameters: ModelParameter[];
  onChange: (name: string, value: number | string) => void;
}) {
  const renderParameter = (param: ModelParameter) => {
    const currentValue = param.userValue ?? param.defaultValue ?? param.minValue ?? 0;
    const currentStringValue = param.userStringValue ?? param.stringDefault ?? '';

    switch (param.paramType) {
      case 'float':
      case 'int':
        return (
          <div key={param.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={param.name}>{param.displayName}</Label>
              <span className="text-sm text-muted-foreground">{currentValue}</span>
            </div>
            <Slider
              id={param.name}
              min={param.minValue ?? 0}
              max={param.maxValue ?? 100}
              step={param.paramType === 'int' ? 1 : 0.1}
              value={[typeof currentValue === 'number' ? currentValue : 0]}
              onValueChange={([value]) => onChange(param.name, value)}
            />
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
        );

      case 'boolean':
        return (
          <div key={param.id} className="flex items-center justify-between">
            <div>
              <Label htmlFor={param.name}>{param.displayName}</Label>
              <p className="text-xs text-muted-foreground">{param.description}</p>
            </div>
            <Switch
              id={param.name}
              checked={Boolean(currentValue)}
              onCheckedChange={(checked) => onChange(param.name, checked ? 1 : 0)}
            />
          </div>
        );

      case 'string':
        return (
          <div key={param.id} className="space-y-2">
            <Label htmlFor={param.name}>{param.displayName}</Label>
            <Input
              id={param.name}
              value={currentStringValue}
              onChange={(e) => onChange(param.name, e.target.value)}
              placeholder={param.stringDefault || ''}
            />
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
        );

      case 'enum':
        const values = Array.isArray(param.allowedValues) ? param.allowedValues : [];
        return (
          <div key={param.id} className="space-y-2">
            <Label htmlFor={param.name}>{param.displayName}</Label>
            <Select
              value={String(currentValue)}
              onValueChange={(value) => onChange(param.name, value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {values.map((v) => (
                  <SelectItem key={String(v)} value={String(v)}>
                    {String(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
        );

      default:
        return null;
    }
  };

  const visibleParams = parameters.filter((p) => p.isVisible);

  if (visibleParams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No configurable parameters for this model.</p>
    );
  }

  return (
    <div className="space-y-4">
      {visibleParams.map(renderParameter)}
    </div>
  );
}

/**
 * Provider Card Component
 */
function ProviderCard({
  provider,
  onToggle,
  onSetDefault,
  onConfigure,
  isDefaultProvider,
}: ProviderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ModelParameter[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const loadModels = useCallback(async () => {
    if (!provider.isEnabled || !provider.hasValidApiKey) return;
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/admin/smart-upload-settings/providers/${provider.id}/models`);
      const data = await response.json();
      setModels(data.models || []);
      const defaultModel = data.models?.find((m: AIModel) => m.isDefault);
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
        setParameters(defaultModel.parameters || []);
      }
    } finally {
      setIsLoadingModels(false);
    }
  }, [provider.id, provider.isEnabled, provider.hasValidApiKey]);

  useEffect(() => {
    if (isExpanded) {
      loadModels();
    }
  }, [isExpanded, loadModels]);

  const handleModelSelect = useCallback((modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    setSelectedModelId(modelId);
    setParameters(model?.parameters || []);
  }, [models]);

  const handleParameterChange = useCallback((name: string, value: number | string) => {
    setParameters((prev) =>
      prev.map((p) => (p.name === name ? { ...p, userValue: value as number } : p))
    );
  }, []);

  const handleSaveParameters = useCallback(async () => {
    if (!selectedModelId) return;
    const paramValues: Record<string, number | string> = {};
    parameters.forEach((p) => {
      if (p.userValue !== null && p.userValue !== undefined) {
        paramValues[p.name] = p.userValue;
      } else if (p.userStringValue !== null && p.userStringValue !== undefined) {
        paramValues[p.name] = p.userStringValue;
      }
    });

    try {
      await fetch(`/api/admin/smart-upload-settings/models/${selectedModelId}/parameters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: paramValues }),
      });
      toast.success('Parameters saved');
    } catch {
      toast.error('Failed to save parameters');
    }
  }, [selectedModelId, parameters]);

  const handleResetParameters = useCallback(() => {
    setParameters((prev) =>
      prev.map((p) => ({ ...p, userValue: p.defaultValue, userStringValue: p.stringDefault }))
    );
  }, []);

  return (
    <Card className={cn(!provider.isEnabled && 'opacity-60')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                getProviderColor(provider.providerId)
              )}
            >
              {provider.displayName.charAt(0)}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {provider.displayName}
                {isDefaultProvider && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" /> Default
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">{provider.description}</CardDescription>
            </div>
          </div>
          <Switch
            checked={provider.isEnabled}
            onCheckedChange={onToggle}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            {provider.hasValidApiKey ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={provider.hasValidApiKey ? 'text-green-600' : 'text-muted-foreground'}>
              {provider.hasValidApiKey ? 'API Key Configured' : 'No API Key'}
            </span>
          </div>
          {provider.capabilities && (
            <div className="flex items-center gap-2">
              {provider.capabilities.vision && (
                <Badge variant="outline" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" /> Vision
                </Badge>
              )}
              {provider.capabilities.structuredOutput && (
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" /> Structured
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            <Key className="h-4 w-4 mr-1" />
            {provider.hasValidApiKey ? 'Update Key' : 'Set API Key'}
          </Button>
          {provider.isEnabled && provider.hasValidApiKey && !isDefaultProvider && (
            <Button variant="outline" size="sm" onClick={onSetDefault}>
              <Star className="h-4 w-4 mr-1" />
              Set as Default
            </Button>
          )}
          {provider.isEnabled && provider.hasValidApiKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Expanded Model/Parameter Section */}
        {isExpanded && provider.isEnabled && provider.hasValidApiKey && (
          <div className="pt-3 border-t space-y-4">
            {isLoadingModels ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <ModelSelector
                  providerId={provider.id}
                  selectedModelId={selectedModelId}
                  onModelSelect={handleModelSelect}
                />

                {selectedModelId && parameters.length > 0 && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-base">Model Parameters</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleResetParameters}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Reset
                        </Button>
                        <Button size="sm" onClick={handleSaveParameters}>
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                    <ParameterEditor
                      parameters={parameters}
                      onChange={handleParameterChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SmartUploadSettingsClient() {
  const {
    settings,
    isLoading,
    error,
    refreshSettings,
    toggleFeature,
    saveApiKey,
    enableProvider,
    setDefaultProvider,
  } = useSmartUploadSettings();

  const [selectedProvider, setSelectedProvider] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

  const handleToggleFeature = useCallback(
    async (enabled: boolean) => {
      try {
        await toggleFeature(enabled);
        toast.success(enabled ? 'Smart Upload enabled' : 'Smart Upload disabled');
      } catch {
        toast.error('Failed to update feature toggle');
      }
    },
    [toggleFeature]
  );

  const handleProviderToggle = useCallback(
    async (providerId: string, enabled: boolean) => {
      try {
        await enableProvider(providerId, enabled);
        toast.success(`Provider ${enabled ? 'enabled' : 'disabled'}`);
      } catch {
        toast.error('Failed to update provider');
      }
    },
    [enableProvider]
  );

  const handleSetDefault = useCallback(
    async (providerId: string) => {
      try {
        await setDefaultProvider(providerId);
        toast.success('Default provider updated');
      } catch {
        toast.error('Failed to set default provider');
      }
    },
    [setDefaultProvider]
  );

  const handleConfigure = useCallback((provider: { id: string; displayName: string }) => {
    setSelectedProvider(provider);
    setIsApiKeyDialogOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={refreshSettings}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const defaultProvider = settings?.providers?.find((p) => p.isDefault);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Smart Upload Settings</h1>
          <p className="text-muted-foreground">
            Configure AI providers and settings for Smart Upload
          </p>
        </div>
        <Button variant="outline" onClick={refreshSettings}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Feature Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Feature Toggle
          </CardTitle>
          <CardDescription>
            Enable or disable the Smart Upload feature for all users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Smart Upload Feature</p>
              <p className="text-sm text-muted-foreground">
                {settings?.smartUploadEnabled
                  ? 'Users can upload and process music files using AI'
                  : 'Feature is currently disabled'}
              </p>
            </div>
            <Switch
              checked={settings?.smartUploadEnabled ?? false}
              onCheckedChange={handleToggleFeature}
            />
          </div>
          {!settings?.smartUploadEnabled && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Feature Disabled</p>
                  <p>
                    When disabled, users will not be able to access Smart Upload. Existing batches
                    will remain accessible for review and approval.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            AI Providers
          </CardTitle>
          <CardDescription>
            Configure AI providers for metadata extraction. At least one provider must be
            enabled with a valid API key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {settings?.providers?.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isDefaultProvider={defaultProvider?.id === provider.id}
                onToggle={(enabled) => handleProviderToggle(provider.id, enabled)}
                onSetDefault={() => handleSetDefault(provider.id)}
                onConfigure={() =>
                  handleConfigure({ id: provider.id, displayName: provider.displayName })
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Key Dialog */}
      <ApiKeyDialog
        provider={selectedProvider}
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        onSave={saveApiKey}
      />
    </div>
  );
}

export default SmartUploadSettingsClient;