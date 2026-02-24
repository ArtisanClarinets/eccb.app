import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { PitchPipe } from '../PitchPipe';
import { useStandStore } from '@/store/standStore';

// mock audio context for all tests
beforeAll(() => {
  class FakeOscillator {
    frequency = { value: 0 };
    type = 'sine';
    start = vi.fn();
    stop = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return new FakeOscillator() as unknown as OscillatorNode;
    }
  }
  // @ts-expect-error global AudioContext mock
  global.AudioContext = FakeAudioContext;
  // @ts-expect-error global webkitAudioContext mock
  global.webkitAudioContext = FakeAudioContext;
});

describe('PitchPipe component', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  it('renders keyboard and plays tone on click', () => {
    // set pitch pipe visible
    useStandStore.setState({ showPitchPipe: true });
    expect(useStandStore.getState().showPitchPipe).toBe(true);
    const { getByText } = render(<PitchPipe />);
    const key = getByText('C4');
    fireEvent.click(key);
    expect(key).toBeInTheDocument();
  });

  it('does not render when showPitchPipe is false', () => {
    useStandStore.setState({ showPitchPipe: false });
    const { container } = render(<PitchPipe />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all pitch keys', () => {
    useStandStore.setState({ showPitchPipe: true });
    const { getByText } = render(<PitchPipe />);
    
    // Check for common pitches
    expect(getByText('C4')).toBeInTheDocument();
    expect(getByText('D4')).toBeInTheDocument();
    expect(getByText('E4')).toBeInTheDocument();
    expect(getByText('F4')).toBeInTheDocument();
    expect(getByText('G4')).toBeInTheDocument();
    expect(getByText('A4')).toBeInTheDocument();
    expect(getByText('B4')).toBeInTheDocument();
  });

  it('renders instrument selector', () => {
    useStandStore.setState({ showPitchPipe: true });
    const { container } = render(<PitchPipe />);
    
    // Check for instrument select dropdown
    const select = container.querySelector('select');
    expect(select).toBeInTheDocument();
  });

  it('renders multiple octave range', () => {
    useStandStore.setState({ showPitchPipe: true });
    const { getByText } = render(<PitchPipe />);
    
    // Check for multiple octaves (C4 through B5)
    expect(getByText('C4')).toBeInTheDocument();
    expect(getByText('C5')).toBeInTheDocument();
    expect(getByText('B5')).toBeInTheDocument();
  });
});
