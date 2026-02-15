/**
 * Accessibility (a11y) utility functions for WCAG 2.1 AA compliance
 *
 * This module provides utilities for:
 * - Focus management (focus trap, focus restoration)
 * - Skip-to-content link helpers
 * - ARIA attribute generation
 * - Keyboard event handling
 * - Screen reader announcements
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface FocusTrapOptions {
  /** Whether the focus trap is active */
  active?: boolean;
  /** Element to receive initial focus when trap activates */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Element to receive focus when trap deactivates */
  returnFocus?: RefObject<HTMLElement | null>;
  /** Whether to allow escape key to deactivate */
  escapeDeactivates?: boolean;
  /** Callback when trap is deactivated */
  onDeactivate?: () => void;
}

export interface AnnounceOptions {
  /** Whether to interrupt current announcements */
  assertive?: boolean;
  /** Time to wait before clearing the announcement (ms) */
  clearAfter?: number;
}

export interface KeyboardHandlerOptions {
  /** Handler for Enter and Space keys */
  onActivate?: () => void;
  /** Handler for Escape key */
  onEscape?: () => void;
  /** Handler for Arrow Up key */
  onArrowUp?: () => void;
  /** Handler for Arrow Down key */
  onArrowDown?: () => void;
  /** Handler for Arrow Left key */
  onArrowLeft?: () => void;
  /** Handler for Arrow Right key */
  onArrowRight?: () => void;
  /** Handler for Home key */
  onHome?: () => void;
  /** Handler for End key */
  onEnd?: () => void;
  /** Handler for Tab key */
  onTab?: (event: React.KeyboardEvent) => void;
}

// ============================================================================
// Focus Management
// ============================================================================

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => {
      // Check if element is visible
      const style = getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.offsetParent !== null
      );
    }
  );
}

/**
 * Get the first focusable element within a container
 */
export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[0] ?? null;
}

/**
 * Get the last focusable element within a container
 */
export function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[elements.length - 1] ?? null;
}

/**
 * Trap focus within a container element
 * Returns cleanup function to remove event listeners
 */
export function trapFocus(
  container: HTMLElement,
  options: Omit<FocusTrapOptions, 'active'> = {}
): () => void {
  const { initialFocus, escapeDeactivates = true, onDeactivate } = options;

  // Focus initial element or first focusable
  const firstFocusable = getFirstFocusable(container);
  const elementToFocus = initialFocus?.current ?? firstFocusable;

  if (elementToFocus) {
    // Use setTimeout to ensure focus happens after any current focus changes
    setTimeout(() => elementToFocus.focus(), 0);
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && escapeDeactivates) {
      event.preventDefault();
      onDeactivate?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab: moving backwards
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: moving forwards
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * React hook for focus trap
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {}
): void {
  const { active = true, returnFocus, escapeDeactivates = true, onDeactivate } = options;
  const cleanupRef = useRef<(() => void) | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) {
      // Clean up and restore focus
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (returnFocus?.current) {
        returnFocus.current.focus();
      } else if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
      return;
    }

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Set up focus trap
    cleanupRef.current = trapFocus(containerRef.current, {
      escapeDeactivates,
      onDeactivate,
    });

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [active, containerRef, escapeDeactivates, onDeactivate, returnFocus]);
}

/**
 * Hook to manage focus restoration
 */
export function useFocusRestoration(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store the trigger element when opening
      previousFocus.current = document.activeElement as HTMLElement;
    } else if (previousFocus.current) {
      // Restore focus when closing
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [isOpen]);
}

// ============================================================================
// Skip-to-Content
// ============================================================================

/**
 * Generate props for a skip-to-content link
 */
export function getSkipToContentProps(targetId: string = 'main-content') {
  return {
    href: `#${targetId}`,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
        target.removeAttribute('tabindex');
      }
    },
  };
}

/**
 * Generate props for the main content area
 */
export function getMainContentProps(id: string = 'main-content') {
  return {
    id,
    role: 'main',
    tabIndex: -1,
  };
}

// ============================================================================
// ARIA Attribute Generators
// ============================================================================

/**
 * Generate ARIA attributes for an expandable panel
 */
export function getExpandableProps(
  id: string,
  isExpanded: boolean,
  controlsId?: string
) {
  return {
    'aria-expanded': isExpanded,
    'aria-controls': controlsId ?? `${id}-content`,
  };
}

/**
 * Generate ARIA attributes for a panel controlled by a trigger
 */
export function getExpandablePanelProps(
  id: string,
  isVisible: boolean
) {
  return {
    id: `${id}-content`,
    role: 'region',
    'aria-hidden': !isVisible,
    hidden: !isVisible,
  };
}

/**
 * Generate ARIA attributes for a required form field
 */
export function getRequiredFieldProps(
  id: string,
  hasError: boolean = false,
  errorId?: string
) {
  return {
    id,
    required: true,
    'aria-required': true,
    'aria-invalid': hasError,
    'aria-describedby': hasError && errorId ? errorId : undefined,
  };
}

/**
 * Generate ARIA attributes for a form error message
 */
export function getErrorMessageProps(id: string) {
  return {
    id,
    role: 'alert',
    'aria-live': 'polite',
  };
}

/**
 * Generate ARIA attributes for a dialog/modal
 */
export function getDialogProps(
  id: string,
  isOpen: boolean,
  labelId?: string,
  descriptionId?: string
) {
  return {
    id,
    role: 'dialog',
    'aria-modal': true,
    'aria-hidden': !isOpen,
    'aria-labelledby': labelId ?? `${id}-title`,
    'aria-describedby': descriptionId,
  };
}

/**
 * Generate ARIA attributes for a tab
 */
export function getTabProps(
  id: string,
  panelId: string,
  isSelected: boolean
) {
  return {
    id,
    role: 'tab',
    'aria-selected': isSelected,
    'aria-controls': panelId,
    tabIndex: isSelected ? 0 : -1,
  };
}

/**
 * Generate ARIA attributes for a tab panel
 */
export function getTabPanelProps(
  id: string,
  tabId: string,
  isVisible: boolean
) {
  return {
    id,
    role: 'tabpanel',
    'aria-labelledby': tabId,
    'aria-hidden': !isVisible,
    tabIndex: 0,
  };
}

/**
 * Generate ARIA attributes for a menu item
 */
export function getMenuItemProps(
  id: string,
  hasPopup: boolean = false,
  isExpanded: boolean = false
) {
  return {
    id,
    role: 'menuitem',
    'aria-haspopup': hasPopup ? 'menu' : undefined,
    'aria-expanded': hasPopup ? isExpanded : undefined,
  };
}

/**
 * Generate ARIA attributes for a button with a popup
 */
export function getPopupButtonProps(
  id: string,
  popupType: 'menu' | 'dialog' | 'listbox' | 'tree' | 'grid',
  isExpanded: boolean,
  controlsId: string
) {
  return {
    id,
    'aria-haspopup': popupType,
    'aria-expanded': isExpanded,
    'aria-controls': controlsId,
  };
}

// ============================================================================
// Keyboard Event Handlers
// ============================================================================

/**
 * Create a keyboard event handler with common accessibility patterns
 */
export function createKeyboardHandler(
  handlers: KeyboardHandlerOptions
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handlers.onActivate?.();
        break;
      case 'Escape':
        handlers.onEscape?.();
        break;
      case 'ArrowUp':
        event.preventDefault();
        handlers.onArrowUp?.();
        break;
      case 'ArrowDown':
        event.preventDefault();
        handlers.onArrowDown?.();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        handlers.onArrowLeft?.();
        break;
      case 'ArrowRight':
        event.preventDefault();
        handlers.onArrowRight?.();
        break;
      case 'Home':
        event.preventDefault();
        handlers.onHome?.();
        break;
      case 'End':
        event.preventDefault();
        handlers.onEnd?.();
        break;
      case 'Tab':
        handlers.onTab?.(event);
        break;
    }
  };
}

/**
 * Hook for roving tabindex pattern
 */
export function useRovingTabIndex(
  items: Array<{ id: string; ref: RefObject<HTMLElement | null> }>,
  activeId: string | null
): {
  getTabIndex: (id: string) => number;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  focusItem: (id: string) => void;
} {
  const focusItem = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    item?.ref.current?.focus();
  }, [items]);

  const getTabIndex = useCallback((id: string): number => {
    return activeId === id || activeId === null ? 0 : -1;
  }, [activeId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const currentIndex = items.findIndex((i) => i.id === activeId);
    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== currentIndex && items[nextIndex]) {
      focusItem(items[nextIndex].id);
    }
  }, [items, activeId, focusItem]);

  return { getTabIndex, handleKeyDown, focusItem };
}

// ============================================================================
// Screen Reader Announcements
// ============================================================================

let liveRegionContainer: HTMLDivElement | null = null;

/**
 * Get or create the live region container for announcements
 */
function getLiveRegion(): HTMLDivElement {
  if (!liveRegionContainer) {
    liveRegionContainer = document.createElement('div');
    liveRegionContainer.setAttribute('role', 'status');
    liveRegionContainer.setAttribute('aria-live', 'polite');
    liveRegionContainer.setAttribute('aria-atomic', 'true');
    liveRegionContainer.className = 'sr-only';
    document.body.appendChild(liveRegionContainer);
  }
  return liveRegionContainer;
}

/**
 * Announce a message to screen readers
 */
export function announce(
  message: string,
  options: AnnounceOptions = {}
): void {
  const { assertive = false, clearAfter = 5000 } = options;
  const liveRegion = getLiveRegion();

  // Set the aria-live value
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');

  // Clear any existing content
  liveRegion.textContent = '';

  // Set the new message (after a small delay to ensure announcement)
  setTimeout(() => {
    liveRegion.textContent = message;

    // Clear after specified time
    if (clearAfter > 0) {
      setTimeout(() => {
        liveRegion.textContent = '';
      }, clearAfter);
    }
  }, 100);
}

/**
 * Clear any pending announcements
 */
export function clearAnnouncements(): void {
  if (liveRegionContainer) {
    liveRegionContainer.textContent = '';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Hook to listen for reduced motion preference changes
 */
export function usePrefersReducedMotion(): boolean {
  const mediaQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

  const [prefersReduced, setPrefersReduced] = useState(
    mediaQuery?.matches ?? false
  );

  useEffect(() => {
    if (!mediaQuery) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mediaQuery]);

  return prefersReduced;
}

/**
 * Generate a unique ID for ARIA attributes
 */
let idCounter = 0;
export function generateA11yId(prefix: string = 'a11y'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Combine multiple ARIA describedby IDs
 */
export function combineAriaDescribedBy(...ids: Array<string | undefined>): string | undefined {
  const validIds = ids.filter(Boolean);
  return validIds.length > 0 ? validIds.join(' ') : undefined;
}

/**
 * Check if an element is visible (not hidden via CSS)
 */
export function isElementVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.offsetParent !== null
  );
}

/**
 * Get the accessible name for an element
 */
export function getAccessibleName(element: HTMLElement): string {
  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Check aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return labelElement.textContent ?? '';
  }

  // Check associated label
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent ?? '';
  }

  // Check for label parent
  const parentLabel = element.closest('label');
  if (parentLabel) {
    return parentLabel.textContent ?? '';
  }

  // Fall back to text content
  return element.textContent ?? '';
}
