'use client';

import { useState, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ProviderWithStatus {
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  hasValidApiKey: boolean;
  capabilities: {
    vision: boolean;
    structuredOutput: boolean;
  } | null;
  baseUrl: string | null;
}

export interface AIModel {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  maxTokens: number | null;
  contextWindow: number | null;
  isDefault: boolean;
  isPreferred: boolean;
  isAvailable: boolean;
  lastFetched: Date | string | null;
  parameters: ModelParameter[];
  provider?: {
    id: string;
    providerId: string;
    displayName: string;
  } | null;
}

export interface ModelParameter {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  paramType: string;
  defaultValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  stringDefault: string | null;
  allowedValues: unknown | null;
  userValue: number | null;
  userStringValue: string | null;
  isAdvanced: boolean;
  isVisible: boolean;
}

export interface SmartUploadSettings {
  smartUploadEnabled: boolean;
  settings: Record<string, string>;
  providers: ProviderWithStatus[];
}

export interface SettingsStatus {
  smartUploadEnabled: boolean;
  settings: Record<string, string>;
  providers: ProviderWithStatus[];
}

export interface TaskModelConfig {
  id: string;
  taskType: string;
  primaryProviderId: string | null;
  modelId: string | null;
  fallbackProviderId: string | null;
  fallbackModelId: string | null;
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
  createdAt: string;
  updatedAt: string;
  model?: {
    id: string;
    modelId: string;
    displayName: string;
    provider?: { id: string; providerId: string; displayName: string } | null;
  } | null;
  primaryProvider?: { id: string; providerId: string; displayName: string } | null;
  fallbackProvider?: { id: string; providerId: string; displayName: string } | null;
  fallbackModel?: {
    id: string;
    modelId: string;
    displayName: string;
    provider?: { id: string; providerId: string; displayName: string } | null;
  } | null;
}

// =============================================================================
// Hook Return Type
// =============================================================================

export interface UseSmartUploadSettingsReturn {
  settings: SettingsStatus | null;
  taskConfigs: TaskModelConfig[];
  isLoading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  fetchTaskConfigs: () => Promise<void>;
  updateTaskConfig: (
    taskType: string,
    modelId: string | null,
    params: { temperature?: number; maxTokens?: number; topP?: number },
    primaryProviderId?: string | null,
    fallbackProviderId?: string | null,
    fallbackModelId?: string | null,
  ) => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
  toggleFeature: (enabled: boolean) => Promise<void>;
  saveApiKey: (providerId: string, apiKey: string) => Promise<boolean>;
  validateApiKey: (providerId: string, apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  enableProvider: (providerId: string, enabled: boolean) => Promise<void>;
  setDefaultProvider: (providerId: string) => Promise<void>;
  getModels: (providerId: string) => Promise<AIModel[]>;
  refreshModels: (providerId: string) => Promise<{ success: boolean; count?: number; error?: string }>;
  updateModelParameters: (modelId: string, parameters: Record<string, number | string>) => Promise<void>;
  providerModels: Record<string, AIModel[]>;
  providerModelsLoading: Record<string, boolean>;
  fetchModelsForProvider: (providerId: string) => Promise<void>;
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Hook for managing Smart Upload settings
 */
export function useSmartUploadSettings(): UseSmartUploadSettingsReturn {
  const [settings, setSettings] = useState<SettingsStatus | null>(null);
  const [taskConfigs, setTaskConfigs] = useState<TaskModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, AIModel[]>>({});
  const [providerModelsLoading, setProviderModelsLoading] = useState<Record<string, boolean>>({});

  const refreshSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/smart-upload-settings');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTaskConfigs = useCallback(async () => {
    setError(null);

    try {
      const response = await fetch('/api/admin/smart-upload-settings/tasks');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch task configs');
      }

      const data = await response.json();
      setTaskConfigs(data.configs || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    }
  }, []);

  const fetchModelsForProvider = useCallback(async (providerId: string) => {
    if (providerModels[providerId]) return; // already cached
    setProviderModelsLoading((prev) => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetch(`/api/admin/smart-upload-settings/providers/${providerId}/models`);
      if (response.ok) {
        const data = await response.json();
        setProviderModels((prev) => ({ ...prev, [providerId]: data.models || [] }));
      }
    } catch {
      // ignore
    } finally {
      setProviderModelsLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  }, [providerModels]);

  const updateTaskConfig = useCallback(
    async (
      taskType: string,
      modelId: string | null,
      params: { temperature?: number; maxTokens?: number; topP?: number },
      primaryProviderId?: string | null,
      fallbackProviderId?: string | null,
      fallbackModelId?: string | null,
    ): Promise<void> => {
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/smart-upload-settings/tasks/${taskType}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              modelId,
              primaryProviderId,
              fallbackProviderId,
              fallbackModelId,
              ...params,
            }),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update task config');
        }

        const data = await response.json();
        setTaskConfigs((prev) => {
          const existing = prev.findIndex((c) => c.taskType === taskType);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data.config;
            return updated;
          }
          return [...prev, data.config];
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  useEffect(() => {
    refreshSettings();
    fetchTaskConfigs();
  }, [refreshSettings, fetchTaskConfigs]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    setError(null);

    try {
      const response = await fetch('/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: { [key]: value },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update setting');
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const toggleFeature = useCallback(async (enabled: boolean) => {
    setError(null);

    try {
      const response = await fetch('/api/admin/smart-upload-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle feature');
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const validateApiKey = useCallback(
    async (providerId: string, apiKey: string): Promise<{ valid: boolean; error?: string }> => {
      try {
        const response = await fetch(
          `/api/admin/smart-upload-settings/providers/${providerId}/validate-key`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ apiKey }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return { valid: false, error: data.error || data.details || 'Validation failed' };
        }

        return { valid: data.valid };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return { valid: false, error: errorMessage };
      }
    },
    []
  );

  const saveApiKey = useCallback(async (providerId: string, apiKey: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/smart-upload-settings/providers/${providerId}/api-key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to save API key');
        return false;
      }

      // Refresh settings to get updated provider status
      await refreshSettings();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return false;
    }
  }, [refreshSettings]);

  const enableProvider = useCallback(async (providerId: string, enabled: boolean) => {
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/smart-upload-settings/providers/${providerId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update provider');
      }

      const data = await response.json();
      setSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: data.providers,
        };
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const setDefaultProvider = useCallback(async (providerId: string) => {
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/smart-upload-settings/providers/${providerId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isDefault: true }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set default provider');
      }

      const data = await response.json();
      setSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: data.providers,
        };
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const getModels = useCallback(async (providerId: string): Promise<AIModel[]> => {
    try {
      const response = await fetch(
        `/api/admin/smart-upload-settings/providers/${providerId}/models`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch models');
      }

      const data = await response.json();
      return data.models || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return [];
    }
  }, []);

  const refreshModels = useCallback(
    async (providerId: string): Promise<{ success: boolean; count?: number; error?: string }> => {
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/smart-upload-settings/providers/${providerId}/models`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          const data = await response.json();
          return { success: false, error: data.error || data.details || 'Failed to refresh models' };
        }

        const data = await response.json();
        return { success: true, count: data.count };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const updateModelParameters = useCallback(
    async (modelId: string, parameters: Record<string, number | string>) => {
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/smart-upload-settings/models/${modelId}/parameters`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ parameters }),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update parameters');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  return {
    settings,
    taskConfigs,
    isLoading,
    error,
    refreshSettings,
    fetchTaskConfigs,
    updateTaskConfig,
    updateSetting,
    toggleFeature,
    saveApiKey,
    validateApiKey,
    enableProvider,
    setDefaultProvider,
    getModels,
    refreshModels,
    updateModelParameters,
    providerModels,
    providerModelsLoading,
    fetchModelsForProvider,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get provider logo URL
 */
export function getProviderLogo(providerId: string): string {
  const logos: Record<string, string> = {
    openai: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Logotypeto_OpenAI.svg',
    anthropic: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Anthropic_icon.svg',
    google: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
    mistral: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Mistral_Logo.svg',
    cohere: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Cohere_logo.svg',
    openrouter: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/OpenRouter_Logo.svg',
  };
  return logos[providerId] || '';
}

/**
 * Get provider display color
 */
export function getProviderColor(providerId: string): string {
  const colors: Record<string, string> = {
    openai: 'bg-green-500',
    anthropic: 'bg-orange-500',
    google: 'bg-blue-500',
    mistral: 'bg-indigo-500',
    cohere: 'bg-teal-500',
    openrouter: 'bg-purple-500',
  };
  return colors[providerId] || 'bg-gray-500';
}

export default useSmartUploadSettings;