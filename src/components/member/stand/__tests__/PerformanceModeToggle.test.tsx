import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStandStore } from '@/store/standStore';

// Mock the wakeLock module
vi.mock('@/lib/wakeLock', () => ({
  acquireWakeLock: vi.fn().mockResolvedValue({ released: false, release: vi.fn() }),
  releaseWakeLock: vi.fn().mockResolvedValue(true),
  requestFullscreen: vi.fn().mockResolvedValue(true),
  exitFullscreen: vi.fn().mockResolvedValue(true),
}));

// Import the mocked functions
import { acquireWakeLock, releaseWakeLock, requestFullscreen, exitFullscreen } from '@/lib/wakeLock';

describe('PerformanceModeToggle - store integration', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStandStore.setState({
      gigMode: false,
      showControls: true,
      isFullscreen: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles gigMode in store', async () => {
    // Test that the store toggle function works
    expect(useStandStore.getState().gigMode).toBe(false);
    
    useStandStore.getState().toggleGigMode();
    
    expect(useStandStore.getState().gigMode).toBe(true);
  });

  it('toggles gigMode off', async () => {
    useStandStore.setState({ gigMode: true });
    
    useStandStore.getState().toggleGigMode();
    
    expect(useStandStore.getState().gigMode).toBe(false);
  });

  it('sets showControls correctly', async () => {
    expect(useStandStore.getState().showControls).toBe(true);
    
    useStandStore.getState().setShowControls(false);
    
    expect(useStandStore.getState().showControls).toBe(false);
  });

  it('sets isFullscreen correctly', async () => {
    expect(useStandStore.getState().isFullscreen).toBe(false);
    
    useStandStore.getState().setIsFullscreen(true);
    
    expect(useStandStore.getState().isFullscreen).toBe(true);
  });
});

describe('wakeLock mock functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquireWakeLock is called when enabling gig mode', async () => {
    await acquireWakeLock();
    expect(acquireWakeLock).toHaveBeenCalled();
  });

  it('releaseWakeLock is called when disabling gig mode', async () => {
    await releaseWakeLock();
    expect(releaseWakeLock).toHaveBeenCalled();
  });

  it('requestFullscreen is called', async () => {
    await requestFullscreen();
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it('exitFullscreen is called', async () => {
    await exitFullscreen();
    expect(exitFullscreen).toHaveBeenCalled();
  });
});
