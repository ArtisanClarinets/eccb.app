You are the *Rehearsal Utilities Developer*.
Implement a suite of practice tools accessible from the stand UI.

1. **Metronome**
   - Create `Metronome.tsx` component with controls for BPM (e.g. range 30–240),
     time signature (numerator, denominator), subdivision (e.g. 8th notes).  Use
     Web Audio API to schedule click sounds (`AudioContext` + `OscillatorNode`)
     with precise timing (look ahead scheduling using `currentTime` + a
     scheduler function).  Provide an optional visual flash on each beat by
     toggling a CSS class on the main canvas container.
   - Store metronome settings in the zustand store and in `UserPreferences`.
   - Allow start/stop via a button and keyboard shortcut (e.g. M key).
2. **Chromatic tuner**
   - Create `Tuner.tsx` that requests microphone permission (`navigator.mediaDevices.getUserMedia({ audio: true })`).
   - Feed the stream into an `AnalyserNode` and implement pitch detection
     either via a small JS algorithm (autocorrelation) or use a WASM library
     like `pitchy`.  Compute the nearest note name and cents offset.
   - Display a tuning dial UI (circular gauge with a needle) showing the
     deviation from the target frequency.
   - Provide a checkbox to mute the audio on output (so only analysis runs).
3. **Audio linking & player**
   - Extend the loader to include any `AudioLink` entries (see schema).
   - Build `AudioPlayer.tsx` component that lists attached audio files with
     play/pause controls, progress bar, and A‑B loop selectors.  Use the
     `<audio>` element and manage A/B points programmatically.
   - Implement upload UI (via the audio API route) for librarians/conductors
     to attach new audio to a piece.
   - Store loop start/end points in the store and persist them in preferences
     if desired.
4. **Pitch pipe / virtual keyboard**
   - Create `PitchPipe.tsx` component that renders a small keyboard of
     clickable keys (e.g. 2–3 octaves).  Each key plays a tone using Web Audio
     (OscillatorNode set to the appropriate frequency) when clicked or touched.
   - Allow selecting instrument sound (sine, square, etc.) from settings.
5. **Integration & persistence**
   - Add settings for metronome, tuner, and pitch pipe to `UserPreferences`.
   - Load these preferences in the loader and seed the store.
   - Provide controls in a sidebar or floating toolbar to show/hide each utility.
6. **Testing**
   - Mock the Web Audio API using `jest-web-audio-mock` or manual mocks.
   - For the metronome, test that `scheduleClick` calls the oscillator and
     schedules events at correct intervals using mocked `AudioContext.currentTime`.
   - For tuner, simulate an analyser node providing a sine wave and check that
     pitch detection returns the correct note.
   - For audio player, test playback state changes and loop point setting.
   - For the keyboard, simulate clicks and verify that the audio API is invoked
     with the right frequency.

Return the new component files (`Metronome.tsx`, `Tuner.tsx`, `AudioPlayer.tsx`,
`PitchPipe.tsx`), any helper modules for audio scheduling, and all associated
test files.