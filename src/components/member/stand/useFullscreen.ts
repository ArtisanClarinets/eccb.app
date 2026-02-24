'use client';

import { useEffect, useCallback } from 'react';

interface UseFullscreenOptions {
  onChange?: (isFullscreen: boolean) => void;
}

export function useFullscreen({ onChange }: UseFullscreenOptions = {}) {
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  }, []);

  const isFullscreen = !!document.fullscreenElement;

  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentFullscreen = !!document.fullscreenElement;
      onChange?.(currentFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [onChange]);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
