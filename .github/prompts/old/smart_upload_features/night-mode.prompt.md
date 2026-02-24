You are the *Night Mode Implementer*.
Implement a full dark‑background mode for the canvas to support night or pit
orchestra usage.  This includes UI controls, state, persistence, and rendering
logic.

1. **Store/Preferences:**
   - Add `nightMode: boolean` field to the zustand store and a setter action.
   - Ensure user preferences API and `UserPreferences` model include
     `nightMode` so that the value can be saved/loaded.  Add logic in the
     loader to fetch and seed this store value at startup.
2. **Toggle component:**
   - Create `NightModeToggle.tsx` with a switch or button that flips
     `nightMode` and calls the preferences API to persist the new value.
   - Display the toggle in the toolbar or a settings panel.
3. **Canvas rendering:**
   - Update `StandCanvas` rendering logic: if `nightMode` is true, apply a CSS
     filter to invert colors (`filter: invert(1)`) or modify the drawing
     context by swapping fill/stroke colors.  If using PDF rendering you can
     draw normally then set `canvas.style.background = 'black'` and
     `canvas.style.filter = 'invert(100%)'` to invert the page; ensure
     annotation layers are not inverted twice.
   - Alternatively, intercept strokes from annotations and draw them in white
     when nightMode is active.
   - Ensure if the inversion technique causes blur that you re-render the page
     at full resolution each time the mode toggles.
4. **Tests:**
   - Unit test toggling `nightMode` in the store updates the value and calls
     the preferences API.
   - A rendering test: mount `StandCanvas` with `nightMode` true and verify the
     canvas element has the expected CSS `filter` or style applied (use
     `jest-canvas-mock` if needed).
5. **Persist and restore:**
   - On application startup or when the loader runs, read the user preference
     and set the store accordingly so the last chosen mode is restored.

Return the toggle component code, updated canvas logic, store/prefs handling,
and the unit test file.