'use client';

import { useEffect, useCallback, useState } from 'react';

interface UseFullscreenOptions {
  onChange?: (isFullscreen: boolean) => void;
}

export function useFullscreen({ onChange }: UseFullscreenOptions = {}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    // Initialize fullscreen state on client
    setIsFullscreen(!!document.fullscreenElement);

    const handleFullscreenChange = () => {
      const currentFullscreen = !!document.fullscreenElement;
      setIsFullscreen(currentFullscreen);
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
