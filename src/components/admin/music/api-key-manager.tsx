'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LLM_PROVIDERS, type LLMProviderValue } from '@/lib/llm/providers';

// =============================================================================
// Types
// =============================================================================

interface ApiKeyRecord {
  id: string;
  providerId: string;
  providerSlug: LLMProviderValue;
  label: string;
  isPrimary: boolean;
  isActive: boolean;
  isValid: boolean;
  validationError: string | null;
  lastValidated: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function getCsrfToken(): string {
  // Read from cookie or meta tag
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content') || '';
    // Try cookie approach
    const match = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

async function apiCall(action: string, data: Record<string, unknown> = {}) {
  const res = await fetch('/api/admin/uploads/api-keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': getCsrfToken(),
    },
    body: JSON.stringify({ action, ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

// =============================================================================
// Sub-Components
// =============================================================================

function KeyRow({
  apiKey,
  onSetPrimary,
  onDelete,
  isDeleting,
}: {
  apiKey: ApiKeyRecord;
  onSetPrimary: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
        apiKey.isPrimary && 'border-primary/30 bg-primary/5',
        !apiKey.isActive && 'opacity-50'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{apiKey.label}</span>
          {apiKey.isPrimary && (
            <Badge variant="default" className="bg-primary text-xs shrink-0">
              <Star className="h-3 w-3 mr-1" />
              Primary
            </Badge>
          )}
          {apiKey.isValid && (
            <Badge variant="outline" className="text-green-600 border-green-200 text-xs shrink-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Valid
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>Added {new Date(apiKey.createdAt).toLocaleDateString()}</span>
          {apiKey.validationError && (
            <span className="text-red-500 truncate">{apiKey.validationError}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!apiKey.isPrimary && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSetPrimary}
            title="Set as primary"
          >
            <Star className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-red-500 hover:text-red-600"
          title="Delete key"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function AddKeyForm({
  providerSlug,
  onCreated,
}: {
  providerSlug: LLMProviderValue;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const providerConfig = LLM_PROVIDERS.find((p) => p.value === providerSlug);

  const handleCreate = async () => {
    if (!keyValue.trim()) {
      toast.error('Please enter an API key');
      return;
    }
    setIsCreating(true);
    try {
      await apiCall('create', {
        providerSlug,
        label: label.trim() || 'Default',
        plaintextKey: keyValue.trim(),
      });
      toast.success('API key added');
      setLabel('');
      setKeyValue('');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add key');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Label (e.g. Production, Backup)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-sm"
        />
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            placeholder={providerConfig?.apiKeyPlaceholder || 'Enter API key'}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            className="pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {providerConfig?.docsUrl && (
          <a
            href={providerConfig.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline mr-auto"
          >
            Get key <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={isCreating || !keyValue.trim()}
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Plus className="h-4 w-4 mr-1" />
          )}
          Add Key
        </Button>
      </div>
    </div>
  );
}

function ProviderKeySection({
  providerSlug,
  keys,
  onRefresh,
}: {
  providerSlug: LLMProviderValue;
  keys: ApiKeyRecord[];
  onRefresh: () => void;
}) {
  const [isOpen, setIsOpen] = useState(keys.length > 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const provider = LLM_PROVIDERS.find((p) => p.value === providerSlug);
  if (!provider || !provider.requiresApiKey) return null;

  const handleSetPrimary = async (id: string) => {
    try {
      await apiCall('update', { id, isPrimary: true });
      toast.success('Primary key updated');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiCall('delete', { id });
      toast.success('Key deleted');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
            keys.length > 0 && 'border-primary/20'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{provider.label}</span>
            {keys.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {keys.length} key{keys.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {keys.length > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 pl-2">
        {keys.map((k) => (
          <KeyRow
            key={k.id}
            apiKey={k}
            onSetPrimary={() => handleSetPrimary(k.id)}
            onDelete={() => handleDelete(k.id)}
            isDeleting={deletingId === k.id}
          />
        ))}

        {showAddForm ? (
          <AddKeyForm
            providerSlug={providerSlug}
            onCreated={() => {
              setShowAddForm(false);
              onRefresh();
            }}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add {provider.label} Key
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/uploads/api-keys?grouped=false');
      if (!res.ok) throw new Error('Failed to fetch keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      await apiCall('migrate');
      toast.success('Existing keys migrated to encrypted storage');
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  const providerSlugs = LLM_PROVIDERS
    .filter((p) => p.requiresApiKey)
    .map((p) => p.value);

  const keysByProvider = providerSlugs.reduce<Record<string, ApiKeyRecord[]>>((acc, slug) => {
    acc[slug] = keys.filter((k) => k.providerSlug === slug);
    return acc;
  }, {});

  // Check if there are potentially legacy keys that haven't been migrated
  const hasLegacyKeys = keys.length === 0 && !isLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              API Key Management
            </CardTitle>
            <CardDescription>
              Manage encrypted API keys for each provider. Set a primary key and optional fallbacks
              per provider. All keys are encrypted at rest with AES-256-GCM.
            </CardDescription>
          </div>
          {hasLegacyKeys && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMigrate}
              disabled={isMigrating}
            >
              {isMigrating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Migrate Existing Keys
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {providerSlugs.map((slug) => (
              <ProviderKeySection
                key={slug}
                providerSlug={slug}
                keys={keysByProvider[slug] || []}
                onRefresh={fetchKeys}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
