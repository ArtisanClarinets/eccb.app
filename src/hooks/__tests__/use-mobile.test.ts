/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../use-mobile'

describe('useIsMobile', () => {
  const MOBILE_BREAKPOINT = 768
  let matchMediaListeners: Array<(e: MediaQueryListEvent) => void> = []

  // Store original window properties
  const originalMatchMedia = window.matchMedia
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

  beforeEach(() => {
    matchMediaListeners = []

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: window.innerWidth < MOBILE_BREAKPOINT,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn((type, listener) => {
          if (type === 'change') {
            matchMediaListeners.push(listener)
          }
        }),
        removeEventListener: vi.fn((type, listener) => {
          if (type === 'change') {
            matchMediaListeners = matchMediaListeners.filter((l) => l !== listener)
          }
        }),
        dispatchEvent: vi.fn(),
      })),
    })

    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // Default to desktop
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Restore original properties
    if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia
    }
    if (originalInnerWidth) {
        Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    }
  })

  it('should return false when window width is greater than or equal to breakpoint', () => {
    // Need to set innerWidth before renderHook
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('should return true when window width is less than breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('should update value when window resize changes the breakpoint status', async () => {
    // Start with desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // Resize to mobile
    await act(async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      })
      // Trigger the change event manually since we mocked addEventListener
      matchMediaListeners.forEach((listener) =>
        listener({ matches: true } as MediaQueryListEvent)
      )
    })
    expect(result.current).toBe(true)

    // Resize back to desktop
    await act(async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })
      // Trigger the change event manually
      matchMediaListeners.forEach((listener) =>
        listener({ matches: false } as MediaQueryListEvent)
      )
    })
    expect(result.current).toBe(false)
  })

  it('should cleanup event listener on unmount', () => {
    const removeEventListenerSpy = vi.fn()
    const addEventListenerSpy = vi.fn()

    // Override the beforeEach mock with a spy
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: window.innerWidth < MOBILE_BREAKPOINT,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
        dispatchEvent: vi.fn(),
      })),
    })

    const { unmount } = renderHook(() => useIsMobile())

    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
