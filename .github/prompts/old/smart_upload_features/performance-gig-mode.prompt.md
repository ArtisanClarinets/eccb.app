You are the *Gig Mode Integrator*.
Implement a performance‑oriented “Gig Mode” that minimizes distractions and
prevents screen sleep.

1. Create a component `PerformanceModeToggle.tsx` in the stand components
   folder.  It should:
   - Read and write a boolean `gigMode` value from the zustand store
     (`useStandStore(state => state.gigMode)` and `setGigMode`).
   - When toggled to `true`, call `navigator.wakeLock.request('screen')` and
     store the returned wake lock sentinel.  Request fullscreen mode via
     `document.documentElement.requestFullscreen()` if not already.
   - When toggled off, or when the component unmounts, release the wake lock
     sentinel and call `document.exitFullscreen()` if in fullscreen.
   - Handle the `visibilitychange` event: if the page becomes hidden, release
     the wake lock to avoid errors; re-acquire when visible again (if still in
     gigMode).
   - Provide visual feedback (e.g. change icon or text) so the user knows the
     mode is active.
2. Modify global layout or the top-level stand container to observe `gigMode`
and hide any UI chrome (toolbar, navigation buttons, etc.) when it is
`true`. This can be done via CSS classes (e.g. `.gig-mode .controls { display:
none }`) or by conditional rendering in React.
3. Store `gigMode` in user preferences as well so the last state persists
   across sessions—update the preferences API route accordingly.
4. Write a utility module `lib/wakeLock.ts` that encapsulates the request and
   release logic with proper error handling and exports `acquireWakeLock()` and
   `releaseWakeLock()` functions; the toggle component can use this.
5. Unit tests:
   - Use Jest to mock `navigator.wakeLock` (define `request` returning a mock
     sentinel with a `release` spy) and `document.requestFullscreen`.
   - Test that toggling on stores `gigMode`, calls request APIs, and that
     toggling off releases and exits fullscreen.
   - Test that unmounting the component when gigMode is true releases the lock.

Return the code for `PerformanceModeToggle`, any wakeLock utility, and the
test file(s).