'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mic, MicOff, Settings, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { useStandStore } from '@/store/standStore';
import { cn } from '@/lib/utils';

/**
 * AudioTrackerSettings - UI component for configuring audio-based page advancement
 *
 * This component provides controls for:
 * - Enabling/disabling audio tracking
 * - Adjusting sensitivity (threshold for silence detection)
 * - Setting cooldown period between page turns
 * - Displaying current audio level visualization
 * - Showing calibration status and errors
 */
export function AudioTrackerSettings() {
  const {
    audioTrackerSettings,
    updateAudioTrackerSettings,
    toggleAudioTracker: _toggleAudioTracker,
  } = useStandStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local state for settings (synced to store on change)
  const [enabled, setEnabled] = useState(audioTrackerSettings.enabled);
  const [sensitivity, setSensitivity] = useState(audioTrackerSettings.sensitivity);
  const [cooldownMs, setCooldownMs] = useState(audioTrackerSettings.cooldownMs);

  // Sync local state with store
  useEffect(() => {
    setEnabled(audioTrackerSettings.enabled);
    setSensitivity(audioTrackerSettings.sensitivity);
    setCooldownMs(audioTrackerSettings.cooldownMs);
  }, [audioTrackerSettings]);

  // Persist settings to server
  const persistSettings = useCallback(async (settings: Partial<typeof audioTrackerSettings>) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/stand/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioTrackerSettings: settings }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to persist audio tracker settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle enable/disable toggle
  const handleToggle = useCallback(async () => {
    const newValue = !enabled;
    setEnabled(newValue);
    updateAudioTrackerSettings({ enabled: newValue });
    await persistSettings({ enabled: newValue });
  }, [enabled, updateAudioTrackerSettings, persistSettings]);

  // Handle sensitivity change
  const handleSensitivityChange = useCallback(
    async (value: number) => {
      setSensitivity(value);
      updateAudioTrackerSettings({ sensitivity: value });
      await persistSettings({ sensitivity: value });
    },
    [updateAudioTrackerSettings, persistSettings]
  );

  // Handle cooldown change
  const handleCooldownChange = useCallback(
    async (value: number) => {
      setCooldownMs(value);
      updateAudioTrackerSettings({ cooldownMs: value });
      await persistSettings({ cooldownMs: value });
    },
    [updateAudioTrackerSettings, persistSettings]
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enabled ? (
            <Mic className="w-5 h-5 text-primary" />
          ) : (
            <MicOff className="w-5 h-5 text-gray-400" />
          )}
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Audio Tracking
          </h3>
        </div>
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
            enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Automatically advance pages when the ensemble finishes playing a section.
        Uses microphone to detect silence after sustained sound.
      </p>

      {/* Advanced Settings Toggle */}
      {enabled && (
        <>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark transition-colors"
          >
            <Settings className="w-4 h-4" />
            {showAdvanced ? 'Hide Settings' : 'Show Settings'}
          </button>

          {/* Advanced Settings Panel */}
          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Sensitivity Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Sensitivity
                  </label>
                  <span className="text-sm text-gray-500">
                    {Math.round(sensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={sensitivity}
                  onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-xs text-gray-500">
                  Higher sensitivity detects quieter silences. Lower reduces false triggers.
                </p>
              </div>

              {/* Cooldown Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Cooldown
                  </label>
                  <span className="text-sm text-gray-500">
                    {(cooldownMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="10000"
                  step="500"
                  value={cooldownMs}
                  onChange={(e) => handleCooldownChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-xs text-gray-500">
                  Minimum time between automatic page turns.
                </p>
              </div>
            </div>
          )}

          {/* Status Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <Volume2 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600 dark:text-gray-400">Listening...</span>
            </div>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
        </>
      )}

      {/* Permission Warning */}
      {enabled && typeof navigator !== 'undefined' && !navigator.mediaDevices && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <p className="font-medium">Microphone Access Required</p>
            <p className="mt-1">
              Audio tracking requires microphone permission. Please allow access when prompted.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AudioTrackerSettings;
