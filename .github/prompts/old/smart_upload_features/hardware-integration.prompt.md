You are the *Hardware Interface Specialist*.
Enable integration with external hardware such as Bluetooth page‑turners
and MIDI controllers.

1. **Global key listener:**
   - In a top‑level component or hook (e.g. `useGlobalInput`), attach
     `document.addEventListener('keydown', handler)` with `{capture: true}` so
     that key events fire even when focus is on the canvas or an input.
   - In the handler, map `ArrowLeft`, `ArrowRight`, `PageUp`, `PageDown`, and
     `Space` to store actions `prevPageOrPiece()` / `nextPageOrPiece()` or
     `scrollHalfPage()` depending on orientation/partial scroll state.
   - Prevent default to avoid browser scrolling.  Provide a way to disable the
     listener when a text field is active (e.g. if `event.target` is an
     input/textarea).
2. **Web MIDI support:**
   - Create `MidiHandler.tsx` that triggers `navigator.requestMIDIAccess()` on
     mount.  Handle promise fulfillment and iterate over `inputs`.
   - Allow the user to map specific MIDI messages (note on, program change,
     controller numbers) to stand actions.  Store mappings in the store and
     persist in preferences.
   - Listen for `midimessage` events on all connected inputs.  When a message
     arrives that matches a mapping, dispatch the corresponding store action
     (e.g. turn page, toggle gig mode, start metronome).
   - Provide UI to list available MIDI devices and allow the user to choose
     which device to listen to.
   - Handle device connect/disconnect events by updating available devices.
3. **Bluetooth page-turner compatibility:**
   - Many Bluetooth pedals simply send arrow key events or spacebar events.
     The global key listener from step 1 will capture these automatically.
   - Optionally listen for `navigator.bluetooth` if you want to connect to
     specialized BLE devices, mapping their characteristics to actions.
4. **Testing:**
   - Mock the Web MIDI API in unit tests by creating a fake `navigator.requestMIDIAccess`
     that returns mock `inputs` with an `onmidimessage` callback.  Simulate
     messages and assert that the correct store actions fire.
   - Test the global key handler by dispatching `KeyboardEvent` instances to
     `document` and verifying state changes.
   - For BLE (if implemented), mock `navigator.bluetooth` objects with
     `requestDevice` returning fake characteristics.

Return `MidiHandler` component/hook code, the global input listener code, and
all tests demonstrating MIDI/keyboard hardware interaction.