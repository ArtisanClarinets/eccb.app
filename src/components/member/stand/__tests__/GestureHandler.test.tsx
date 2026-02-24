/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { GestureHandler } from '../GestureHandler';

// Mock the stand store
const mockStore = {
  settings: {
    autoTurnPage: false,
    turnPageDelay: 3000,
    defaultZoom: 100,
    showPageNumbers: true,
    showPageTransitions: true,
    hapticFeedback: false,
    swipeGesture: true,
  },
  currentPieceIndex: 0,
  pieces: [
    {
      id: 'piece-1',
      title: 'Test Piece',
      composer: 'Test Composer',
      pdfUrl: '/test.pdf',
      totalPages: 5,
    },
  ],
  goToNextPage: vi.fn(),
  goToPreviousPage: vi.fn(),
  nextPageOrPiece: vi.fn(),
  prevPageOrPiece: vi.fn(),
  scrollHalfPage: vi.fn(),
  nextTwoPages: vi.fn(),
  prevTwoPages: vi.fn(),
};

vi.mock('@/store/standStore', () => ({
  useStandStore: vi.fn(() => mockStore),
}));

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(),
  configurable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  configurable: true,
});

describe('GestureHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window dimensions for landscape
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('renders without crashing when enabled', () => {
    const { container } = render(<GestureHandler />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<GestureHandler enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    expect(div).toHaveAttribute('role', 'application');
    expect(div).toHaveAttribute('aria-label');
    expect(div).toHaveAttribute('tabIndex', '0');
  });

  it('has screen reader instructions', () => {
    const { getByText } = render(<GestureHandler />);
    expect(getByText(/Use arrow keys to navigate pages/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<GestureHandler className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has touch-none class for mobile gestures', () => {
    const { container } = render(<GestureHandler />);
    expect(container.firstChild).toHaveClass('touch-none');
  });

  it('has minimum touch target size for accessibility', () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.minWidth).toBe('44px');
    expect(div.style.minHeight).toBe('44px');
  });
});

describe('GestureHandler - Swipe Gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('triggers nextTwoPages on swipe left in landscape mode', async () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    // Get the bounding rect for the container
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    // Simulate pointer down
    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 384,
      pointerId: 1,
    });

    // Simulate pointer up with swipe left (deltaX < -50)
    fireEvent.pointerUp(div, {
      clientX: 400, // 100px to the left
      clientY: 384,
      pointerId: 1,
    });

    expect(mockStore.nextTwoPages).toHaveBeenCalled();
  });

  it('triggers prevTwoPages on swipe right in landscape mode', async () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(div, {
      clientX: 400,
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 500, // 100px to the right
      clientY: 384,
      pointerId: 1,
    });

    expect(mockStore.prevTwoPages).toHaveBeenCalled();
  });

  it('does not trigger navigation when swipeGesture is disabled', async () => {
    mockStore.settings.swipeGesture = false;
    
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 400,
      clientY: 384,
      pointerId: 1,
    });

    expect(mockStore.nextTwoPages).not.toHaveBeenCalled();
    
    // Reset for other tests
    mockStore.settings.swipeGesture = true;
  });
});

describe('GestureHandler - Tap Zones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('triggers nextTwoPages on right side tap in landscape', async () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    // Tap on right side (> 70% width)
    fireEvent.pointerDown(div, {
      clientX: 900, // Right side
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 900, // Same position = tap
      clientY: 384,
      pointerId: 1,
    });

    expect(mockStore.nextTwoPages).toHaveBeenCalled();
  });

  it('triggers prevTwoPages on left side tap in landscape', async () => {
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    // Tap on left side (< 30% width)
    fireEvent.pointerDown(div, {
      clientX: 100, // Left side
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 100, // Same position = tap
      clientY: 384,
      pointerId: 1,
    });

    expect(mockStore.prevTwoPages).toHaveBeenCalled();
  });
});

describe('GestureHandler - Portrait Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set portrait dimensions
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });
  });

  it('detects portrait orientation', async () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(orientation: portrait)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    
    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaMock,
      configurable: true,
    });

    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 768,
      height: 1024,
      right: 768,
      bottom: 1024,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    // Swipe left in portrait should call nextPageOrPiece
    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 512,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 400, // Swipe left
      clientY: 512,
      pointerId: 1,
    });

    expect(mockStore.nextPageOrPiece).toHaveBeenCalled();
  });
});

describe('GestureHandler - Haptic Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('triggers haptic feedback when enabled', async () => {
    mockStore.settings.hapticFeedback = true;
    const vibrateSpy = vi.spyOn(navigator, 'vibrate');
    
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 400,
      clientY: 384,
      pointerId: 1,
    });

    expect(vibrateSpy).toHaveBeenCalledWith(10);
    
    // Reset
    mockStore.settings.hapticFeedback = false;
  });

  it('does not trigger haptic feedback when disabled', async () => {
    mockStore.settings.hapticFeedback = false;
    const vibrateSpy = vi.spyOn(navigator, 'vibrate');
    
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 400,
      clientY: 384,
      pointerId: 1,
    });

    expect(vibrateSpy).not.toHaveBeenCalled();
  });
});

describe('GestureHandler - Custom Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('dispatches pageTurn custom event on gesture', async () => {
    const pageTurnHandler = vi.fn();
    window.addEventListener('pageTurn', pageTurnHandler);
    
    const { container } = render(<GestureHandler />);
    const div = container.firstChild as HTMLElement;
    
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    fireEvent.pointerDown(div, {
      clientX: 500,
      clientY: 384,
      pointerId: 1,
    });

    fireEvent.pointerUp(div, {
      clientX: 400,
      clientY: 384,
      pointerId: 1,
    });

    expect(pageTurnHandler).toHaveBeenCalled();
    
    window.removeEventListener('pageTurn', pageTurnHandler);
  });
});
