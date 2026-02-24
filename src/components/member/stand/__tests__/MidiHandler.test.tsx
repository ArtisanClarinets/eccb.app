import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// set up mock for standStore before importing component
vi.mock('@/store/standStore', () => {
  const store: any = {
    midiMappings: {} as Record<string, string>,
    setMidiMappings: vi.fn(),
    updateMidiMapping: vi.fn(),
    nextPageOrPiece: vi.fn(),
    prevPageOrPiece: vi.fn(),
    toggleGigMode: vi.fn(),
    toggleNightMode: vi.fn(),
    toggleMetronome: vi.fn(),
    toggleTuner: vi.fn(),
    toggleAudioPlayer: vi.fn(),
    togglePitchPipe: vi.fn(),
  };
  store.getState = () => store;
  const useStandStore = () => store;
  useStandStore.getState = () => store;
  return {
    useStandStore,
  };
});


import { useStandStore } from '@/store/standStore';
import { MidiHandler } from '../MidiHandler';

describe('MidiHandler', () => {
  let fakeInput: any;
  let access: any;
  let originalNavigator: any;

  beforeEach(() => {
    vi.clearAllMocks();

    fakeInput = {
      id: 'fake-id',
      name: 'Fake Device',
      onmidimessage: null,
    };

    access = {
      inputs: new Map([['fake-id', fakeInput]]),
      onstatechange: null,
    };

    // Store original navigator properties
    originalNavigator = { ...global.navigator };
    
    Object.defineProperty(global.navigator, 'requestMIDIAccess', {
      value: vi.fn().mockResolvedValue(access),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // Restore navigator
    if (originalNavigator.requestMIDIAccess !== undefined) {
      Object.defineProperty(global.navigator, 'requestMIDIAccess', {
        value: originalNavigator.requestMIDIAccess,
        configurable: true,
        writable: true,
      });
    } else {
      delete (global.navigator as any).requestMIDIAccess;
    }
  });

  it('renders without error and populates device select', async () => {
    const { findByText, findByRole } = render(<MidiHandler />);
    
    // Wait for the MIDI device to be detected and displayed
    const deviceOption = await findByText('Fake Device');
    expect(deviceOption).toBeInTheDocument();
    
    const select = await findByRole('combobox', { name: /Select MIDI device/i });
    expect(select).toBeInTheDocument();
  });

  it('dispatches action when mapped message received', async () => {
    const store = useStandStore();
    const key = '144-60';
    store.midiMappings = { [key]: 'nextPageOrPiece' };

    await act(async () => {
      render(<MidiHandler />);
      await Promise.resolve();
    });

    expect(fakeInput.onmidimessage).toBeTruthy();
    await act(async () => {
      fakeInput.onmidimessage({ data: new Uint8Array([144, 60, 127]) });
    });

    expect(store.nextPageOrPiece).toHaveBeenCalled();
  });

  it('ignores unmapped messages', async () => {
    const store = useStandStore();
    store.midiMappings = {};

    await act(async () => {
      render(<MidiHandler />);
      await Promise.resolve();
    });
    expect(fakeInput.onmidimessage).toBeTruthy();
    await act(async () => {
      fakeInput.onmidimessage({ data: new Uint8Array([144, 61, 127]) });
    });
    expect(store.nextPageOrPiece).not.toHaveBeenCalled();
  });

  it('returns null when Web MIDI is not supported', async () => {
    // Remove Web MIDI support before rendering
    delete (global.navigator as any).requestMIDIAccess;

    const { container } = render(<MidiHandler />);
    
    // Component should render nothing when Web MIDI is not supported
    expect(container.firstChild).toBeNull();
  });

  it('displays active MIDI mappings when present', async () => {
    const store = useStandStore();
    store.midiMappings = { '144-60': 'nextPageOrPiece' };

    const { findByText } = render(<MidiHandler />);
    
    // Wait for mappings to be displayed
    const mapping = await findByText(/144-60.*nextPageOrPiece/);
    expect(mapping).toBeInTheDocument();
  });

  it('has proper accessibility attributes', async () => {
    const { findByRole } = render(<MidiHandler />);
    
    const region = await findByRole('region', { name: /MIDI device settings/i });
    expect(region).toBeInTheDocument();
  });

  it('allows selecting different MIDI devices', async () => {
    // Add a second device
    const fakeInput2 = {
      id: 'fake-id-2',
      name: 'Second Device',
      onmidimessage: null,
    };
    access.inputs = new Map([
      ['fake-id', fakeInput],
      ['fake-id-2', fakeInput2],
    ]);

    const { findByText, findByRole } = render(<MidiHandler />);
    
    const select = await findByRole('combobox', { name: /Select MIDI device/i });
    expect(select).toBeInTheDocument();
    
    // Both devices should be options
    expect(await findByText('Fake Device')).toBeInTheDocument();
    expect(await findByText('Second Device')).toBeInTheDocument();
  });
});
