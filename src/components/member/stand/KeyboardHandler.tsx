'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStandStore } from '@/store/standStore';

interface KeyboardHandlerOptions {
  enabled?: boolean;
}

/**
 * useKeyboardNavigation - Hook for keyboard-based page navigation
 * 
 * Handles:
 * - Arrow keys (Left/Right/Up/Down)
 * - Page Up/Page Down
 * - Space bar
 * - Home/End keys
 * 
 * Automatically ignores events when form inputs are focused
 */
export function useKeyboardNavigation({ enabled = true }: KeyboardHandlerOptions = {}) {
  const {
    pieces,
    currentPieceIndex,
    nextPageOrPiece,
    prevPageOrPiece,
    nextTwoPages,
    prevTwoPages,
    setCurrentPage,
    toggleMetronome,
    toggleTuner,
    toggleAudioPlayer,
    togglePitchPipe,
  } = useStandStore();

  const [isInputFocused, setIsInputFocused] = useState(false);

  const currentPiece = pieces[currentPieceIndex];
  const totalPages = currentPiece?.totalPages ?? 1;

  // Check if an input element is currently focused
  const checkFocus = useCallback(() => {
    const activeElement = document.activeElement;
    const tagName = activeElement?.tagName.toLowerCase() ?? '';
    
    // Check for input elements
    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      activeElement?.getAttribute('contenteditable') === 'true'
    ) {
      return true;
    }

    // Check for specific input types
    if (tagName === 'input') {
      const inputType = (activeElement as HTMLInputElement)?.type;
      // Allow only certain input types to block navigation
      if (
        inputType === 'text' ||
        inputType === 'email' ||
        inputType === 'password' ||
        inputType === 'search' ||
        inputType === 'tel' ||
        inputType === 'url' ||
        inputType === 'number'
      ) {
        return true;
      }
    }

    return false;
  }, []);

  // Update focus state when document focus changes
  useEffect(() => {
    const handleFocusIn = () => {
      setIsInputFocused(checkFocus());
    };

    const handleFocusOut = () => {
      // Small delay to allow new element to be focused
      setTimeout(() => {
        setIsInputFocused(checkFocus());
      }, 0);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [checkFocus]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if disabled or input is focused
      if (!enabled || isInputFocused) return;

      const key = event.key;
      const ctrlKey = event.ctrlKey || event.metaKey;

      // Prevent default for navigation keys to avoid page scrolling
      const shouldPreventDefault =
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'PageUp' ||
        key === 'PageDown' ||
        key === ' ' ||
        key === 'Home' ||
        key === 'End';

      // Handle navigation keys
      if (shouldPreventDefault) {
        event.preventDefault();
      }

      switch (key) {
        case 'ArrowLeft':
        case 'PageUp':
        case 'ArrowUp':
          // Go to previous page/piece (setlist-aware navigation)
          if (ctrlKey) {
            // Ctrl+Arrow: two pages at a time
            prevTwoPages();
          } else {
            prevPageOrPiece();
          }
          break;

        case 'ArrowRight':
        case 'PageDown':
        case 'ArrowDown':
        case ' ':
          // Go to next page/piece (setlist-aware navigation - Space bar for forward)
          if (ctrlKey) {
            // Ctrl+Arrow: two pages at a time
            nextTwoPages();
          } else {
            nextPageOrPiece();
          }
          break;

        case 'Home':
          // Go to first page
          setCurrentPage(1);
          break;

        case 'End':
          // Go to last page
          setCurrentPage(totalPages);
          break;
        case 'm':
        case 'M':
          toggleMetronome();
          break;
        case 't':
        case 'T':
          toggleTuner();
          break;
        case 'a':
        case 'A':
          toggleAudioPlayer();
          break;
        case 'p':
        case 'P':
          togglePitchPipe();
          break;
      }
    },
    [
      enabled,
      isInputFocused,
      totalPages,
      nextPageOrPiece,
      prevPageOrPiece,
      nextTwoPages,
      prevTwoPages,
      setCurrentPage,
      toggleMetronome,
      toggleTuner,
      toggleAudioPlayer,
      togglePitchPipe,
    ]
  );

  // Attach keyboard event listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, handleKeyDown]);

  return {
    isInputFocused,
  };
}

interface KeyboardHandlerProps {
  enabled?: boolean;
}

/**
 * KeyboardHandler - Component wrapper for the keyboard navigation hook
 * 
 * Provides keyboard-based page navigation with automatic focus detection
 */
export function KeyboardHandler({ enabled = true }: KeyboardHandlerProps) {
  useKeyboardNavigation({ enabled });

  // This component doesn't render anything
  return null;
}

KeyboardHandler.displayName = 'KeyboardHandler';

export default KeyboardHandler;
