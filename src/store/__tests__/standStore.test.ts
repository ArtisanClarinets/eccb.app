// create new test file for stand store roster actions
import { act } from '@testing-library/react';
import { useStandStore, StandRosterMember } from '../standStore';

describe('standStore roster actions', () => {
  beforeEach(() => {
    // reset store to initial state using provided reset action
    useStandStore.getState().reset();
  });

  it('setRoster replaces entire roster', () => {
    const entries: StandRosterMember[] = [
      { userId: '1', name: 'Alice', section: 'Woodwinds', joinedAt: 't' },
    ];
    act(() => {
      useStandStore.getState().setRoster(entries);
    });

    expect(useStandStore.getState().roster).toEqual(entries);
  });

  it('addRosterEntry appends if unique', () => {
    const entry: StandRosterMember = { userId: '2', name: 'Bob', section: 'Brass', joinedAt: 't' };
    act(() => {
      useStandStore.getState().addRosterEntry(entry);
    });
    expect(useStandStore.getState().roster).toEqual([entry]);

    // adding same user again should not duplicate
    act(() => {
      useStandStore.getState().addRosterEntry(entry);
    });
    expect(useStandStore.getState().roster).toEqual([entry]);
  });

  it('removeRosterEntry filters by userId', () => {
    const a: StandRosterMember = { userId: 'a', name: 'A', joinedAt: 't' };
    const b: StandRosterMember = { userId: 'b', name: 'B', joinedAt: 't' };
    act(() => {
      useStandStore.getState().setRoster([a, b]);
    });
    act(() => {
      useStandStore.getState().removeRosterEntry('a');
    });
    expect(useStandStore.getState().roster).toEqual([b]);
  });

  it('setAudioLinks replaces links', () => {
    const links = [{ id: 'a', pieceId: 'p', fileKey: 'k', url: null, description: null, createdAt: new Date() }];
    act(() => {
      useStandStore.getState().setAudioLinks(links as any);
    });
    expect(useStandStore.getState().audioLinks).toEqual(links);
  });

  it('toggle utilities visibility and update settings', () => {
    act(() => {
      useStandStore.getState().toggleMetronome();
      useStandStore.getState().toggleTuner();
      useStandStore.getState().toggleAudioPlayer();
      useStandStore.getState().togglePitchPipe();
    });
    const state = useStandStore.getState();
    expect(state.showMetronome).toBe(true);
    expect(state.showTuner).toBe(true);
    expect(state.showAudioPlayer).toBe(true);
    expect(state.showPitchPipe).toBe(true);

    act(() => {
      useStandStore.getState().updateMetronomeSettings({ bpm: 90 });
      useStandStore.getState().updateTunerSettings({ mute: false });
      useStandStore.getState().updatePitchPipeSettings({ instrument: 'square' });
    });
    expect(useStandStore.getState().metronomeSettings.bpm).toBe(90);
    expect(useStandStore.getState().tunerSettings.mute).toBe(false);
    expect(useStandStore.getState().pitchPipeSettings.instrument).toBe('square');
  });

  it('updates midi mappings and saves preferences', async () => {
    const mappings = { '144-60': 'nextPageOrPiece' };
    act(() => {
      useStandStore.getState().setMidiMappings(mappings);
    });
    expect(useStandStore.getState().midiMappings).toEqual(mappings);

    // mock fetch for savePreferences
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    await act(async () => {
      await useStandStore.getState().savePreferences();
    });
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
