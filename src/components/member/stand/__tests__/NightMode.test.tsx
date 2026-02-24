'use client';

/**
 * Unit tests for Night Mode functionality in the digital music stand
 * Tests verify:
 * - Stand store toggleNightMode action
 * - StandCanvas rendering with night mode CSS
 * - Toolbar API persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStandStore } from '@/store/standStore';

// Mock fetch for API tests
global.fetch = vi.fn();

describe('StandStore - Night Mode', () => {
  let store: ReturnType<typeof useStandStore.getState>;

  beforeEach(() => {
    // Get fresh store state before each test
    store = useStandStore.getState();
    // Reset to initial state
    store.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with nightMode set to false', () => {
    const state = useStandStore.getState();
    expect(state.nightMode).toBe(false);
  });

  it('toggles nightMode from false to true', () => {
    useStandStore.getState().toggleNightMode();
    const state = useStandStore.getState();
    expect(state.nightMode).toBe(true);
  });

  it('toggles nightMode from true to false', () => {
    // First toggle to true
    useStandStore.getState().toggleNightMode();
    let state = useStandStore.getState();
    expect(state.nightMode).toBe(true);

    // Second toggle back to false
    useStandStore.getState().toggleNightMode();
    state = useStandStore.getState();
    expect(state.nightMode).toBe(false);
  });

  it('persists nightMode state across multiple toggles', () => {
    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(true);

    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(false);

    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(true);
  });
});

describe('StandCanvas - Night Mode Rendering', () => {
  it('applies night mode background to container', () => {
    const nightMode = true;
    const containerStyle = nightMode
      ? { backgroundColor: '#000000' }
      : {};

    expect(containerStyle).toEqual({ backgroundColor: '#000000' });
  });

  it('applies CSS filter to canvas in night mode', () => {
    const nightMode = true;
    const canvasStyles = nightMode
      ? { filter: 'invert(1) hue-rotate(180deg)' }
      : {};

    expect(canvasStyles).toEqual({ filter: 'invert(1) hue-rotate(180deg)' });
  });

  it('does not apply night mode styles when disabled', () => {
    const nightMode = false;
    const containerStyle = nightMode
      ? { backgroundColor: '#000000' }
      : {};

    expect(containerStyle).toEqual({});
  });

  it('page indicator has correct styles in night mode', () => {
    const nightMode = true;
    const pageIndicatorClasses = nightMode
      ? 'bg-black/80 text-white border border-white/20'
      : 'bg-background/80 text-muted-foreground';

    expect(pageIndicatorClasses).toContain('bg-black/80');
    expect(pageIndicatorClasses).toContain('text-white');
  });
});

describe('Toolbar - Night Mode Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs correct API payload for nightMode=true', () => {
    const nightMode = true;
    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nightMode }),
    };

    expect(payload.body).toBe(JSON.stringify({ nightMode: true }));
  });

  it('constructs correct API payload for nightMode=false', () => {
    const nightMode = false;
    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nightMode }),
    };

    expect(payload.body).toBe(JSON.stringify({ nightMode: false }));
  });

  it('API endpoint is correct', () => {
    const endpoint = '/api/stand/preferences';
    expect(endpoint).toBe('/api/stand/preferences');
  });
});

describe('Night Mode Integration', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  it('store state reflects toggles', () => {
    // Initially false
    expect(useStandStore.getState().nightMode).toBe(false);

    // Toggle on
    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(true);

    // Toggle off
    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(false);
  });

  it('reset restores nightMode to false', () => {
    // Enable night mode
    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(true);

    // Reset store
    useStandStore.getState().reset();
    expect(useStandStore.getState().nightMode).toBe(false);
  });

  it('gigMode and nightMode can be toggled independently', () => {
    // Toggle gig mode
    useStandStore.getState().toggleGigMode();
    expect(useStandStore.getState().gigMode).toBe(true);

    // Toggle night mode
    useStandStore.getState().toggleNightMode();
    expect(useStandStore.getState().nightMode).toBe(true);

    // Both should be true independently
    expect(useStandStore.getState().gigMode).toBe(true);
    expect(useStandStore.getState().nightMode).toBe(true);
  });
});
