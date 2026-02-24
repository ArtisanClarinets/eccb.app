/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for the KeyboardHandler component and useKeyboardNavigation hook
 * Tests keyboard navigation including arrow keys, Page Up/Down, Space, Home/End
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { KeyboardHandler, useKeyboardNavigation } from '../KeyboardHandler';
import { act } from 'react';

// Mock the stand store
const mockStore = {
  currentPage: 1,
  pieces: [
    {
      id: 'piece-1',
      title: 'Test Piece',
      composer: 'Test Composer',
      pdfUrl: '/test.pdf',
      totalPages: 5,
    },
  ],
  currentPieceIndex: 0,
  goToNextPage: vi.fn(),
  goToPreviousPage: vi.fn(),
  nextPageOrPiece: vi.fn(),
  prevPageOrPiece: vi.fn(),
  nextTwoPages: vi.fn(),
  prevTwoPages: vi.fn(),
  setCurrentPage: vi.fn(),
  toggleMetronome: vi.fn(),
  toggleTuner: vi.fn(),
  toggleAudioPlayer: vi.fn(),
  togglePitchPipe: vi.fn(),
};

vi.mock('@/store/standStore', () => ({
  useStandStore: vi.fn(() => mockStore),
}));

// Test component that uses the hook
function TestComponent({ enabled = true }: { enabled?: boolean }) {
  useKeyboardNavigation({ enabled });
  return <div>Test Component</div>;
}

describe('KeyboardHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<KeyboardHandler />);
    // KeyboardHandler renders nothing, just sets up listeners
    expect(container.firstChild).toBeNull();
    // ensure event listener is registered with capture true
    const spy = vi.spyOn(document, 'addEventListener');
    render(<KeyboardHandler />);
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
  });

  it('does not throw when disabled', () => {
    expect(() => {
      render(<KeyboardHandler enabled={false} />);
    }).not.toThrow();
  });
});

describe('useKeyboardNavigation hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls nextPageOrPiece on ArrowRight key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(mockStore.nextPageOrPiece).toHaveBeenCalled();
  });

  it('calls nextPageOrPiece on Space key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: ' ' });

    expect(mockStore.nextPageOrPiece).toHaveBeenCalled();
  });

  it('calls nextPageOrPiece on ArrowDown key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(mockStore.nextPageOrPiece).toHaveBeenCalled();
  });

  it('calls nextPageOrPiece on PageDown key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'PageDown' });

    expect(mockStore.nextPageOrPiece).toHaveBeenCalled();
  });

  it('calls prevPageOrPiece on ArrowLeft key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(mockStore.prevPageOrPiece).toHaveBeenCalled();
  });

  it('calls prevPageOrPiece on ArrowUp key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowUp' });

    expect(mockStore.prevPageOrPiece).toHaveBeenCalled();
  });

  it('calls prevPageOrPiece on PageUp key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'PageUp' });

    expect(mockStore.prevPageOrPiece).toHaveBeenCalled();
  });

  it('calls setCurrentPage(1) on Home key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'Home' });

    expect(mockStore.setCurrentPage).toHaveBeenCalledWith(1);
  });

  it('calls setCurrentPage with totalPages on End key', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'End' });

    expect(mockStore.setCurrentPage).toHaveBeenCalledWith(5);
  });

  it('calls nextTwoPages on Ctrl+ArrowRight', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowRight', ctrlKey: true });

    expect(mockStore.nextTwoPages).toHaveBeenCalled();
    expect(mockStore.goToNextPage).not.toHaveBeenCalled();
  });

  it('calls prevTwoPages on Ctrl+ArrowLeft', () => {
    render(<TestComponent />);

    fireEvent.keyDown(document, { key: 'ArrowLeft', ctrlKey: true });

    expect(mockStore.prevTwoPages).toHaveBeenCalled();
    expect(mockStore.goToPreviousPage).not.toHaveBeenCalled();
  });

  it('does not respond to keyboard when disabled', () => {
    render(<TestComponent enabled={false} />);

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(mockStore.goToNextPage).not.toHaveBeenCalled();
  });

  it('ignores events when input is focused', () => {
    render(<TestComponent />);

    // Create and focus an input element
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(document, { key: 'ArrowRight' });
    });

    // Should not call navigation when input is focused
    expect(mockStore.goToNextPage).not.toHaveBeenCalled();

    // Cleanup
    input.remove();
  });

  it('ignores events when textarea is focused', () => {
    render(<TestComponent />);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      fireEvent.keyDown(document, { key: 'ArrowRight' });
    });

    expect(mockStore.goToNextPage).not.toHaveBeenCalled();

    textarea.remove();
  });

  it('ignores events when search input is focused', () => {
    render(<TestComponent />);

    const input = document.createElement('input');
    input.type = 'search';
    document.body.appendChild(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(document, { key: 'ArrowRight' });
    });

    expect(mockStore.goToNextPage).not.toHaveBeenCalled();

    input.remove();
  });

  it('toggles metronome on M key', () => {
    render(<TestComponent />);
    fireEvent.keyDown(document, { key: 'M' });
    expect(mockStore.toggleMetronome).toHaveBeenCalled();
  });

  it('toggles tuner on T key', () => {
    render(<TestComponent />);
    fireEvent.keyDown(document, { key: 'T' });
    expect(mockStore.toggleTuner).toHaveBeenCalled();
  });

  it('toggles audio player on A key', () => {
    render(<TestComponent />);
    fireEvent.keyDown(document, { key: 'A' });
    expect(mockStore.toggleAudioPlayer).toHaveBeenCalled();
  });

  it('toggles pitch pipe on P key', () => {
    render(<TestComponent />);
    fireEvent.keyDown(document, { key: 'P' });
    expect(mockStore.togglePitchPipe).toHaveBeenCalled();
  });
});
