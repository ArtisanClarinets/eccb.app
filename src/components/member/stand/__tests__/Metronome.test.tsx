import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { Metronome, scheduleClick } from '../Metronome';
import { useStandStore } from '@/store/standStore';

// globally mock AudioContext for rendering tests
beforeAll(() => {
  class FakeOscillator {
    frequency = { value: 0 };
    connect = vi.fn();
    start = vi.fn();
    stop = vi.fn();
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = {} as any;
    state = 'running' as AudioContextState;
    resume = vi.fn().mockResolvedValue(undefined);
    createOscillator() {
      return new FakeOscillator() as unknown as OscillatorNode;
    }
    createGain() {
      return {
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
      };
    }
  }
  // @ts-expect-error global AudioContext mock
  global.AudioContext = FakeAudioContext;
  // @ts-expect-error global webkitAudioContext mock
  global.webkitAudioContext = FakeAudioContext;
});

describe('scheduleClick', () => {
  class FakeOscillator {
    frequency = { value: 0 };
    connect = vi.fn();
    start = vi.fn();
    stop = vi.fn();
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = {} as any;
    createOscillator() {
      return new FakeOscillator() as unknown as OscillatorNode;
    }
    createGain() {
      return { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 } };
    }
  }

  it('creates and schedules oscillator at correct time', () => {
    const ctx = new FakeAudioContext() as unknown as AudioContext;
    const osc = scheduleClick(ctx, 1.23, false) as any;
    expect(osc.start).toHaveBeenCalledWith(1.23);
    expect(osc.stop).toHaveBeenCalledWith(1.23 + 0.07);
  });
});

describe('Metronome component', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  it('does not render when showMetronome is false', () => {
    const { container } = render(<Metronome />);
    expect(container.firstChild).toBeNull();
  });

  it('renders controls when visible and allows start/stop', () => {
    useStandStore.setState({ showMetronome: true });
    const { getByText } = render(<Metronome />);
    const btn = getByText('Start');
    fireEvent.click(btn);
    expect(getByText('Stop')).toBeInTheDocument();
  });
});
