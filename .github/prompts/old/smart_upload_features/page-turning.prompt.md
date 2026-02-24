You are the *Gesture & Keyboard Specialist*.
Implement advanced page‑turning interactions that integrate with the stand’s
store actions.

1. Create `GestureHandler.tsx` in `src/components/member/stand/`.
   - This client component renders an invisible overlay over the canvas area
     (`position:absolute; inset:0`) with three zones: left, centre (optionally),
     and right.  Use pointer events to detect `onPointerDown`/`onPointerUp` and
     simple distance threshold for swipes.
   - When the user taps or swipes left or right, call store actions
     `goToPreviousPage()`, `goToNextPage()`, or `scrollHalfPage()` depending on
     orientation and position.  Determine orientation via
     `window.matchMedia('(orientation: portrait)')` or screen width/height.
   - In portrait mode: if a tap occurs in the right half of the current page
     but not the extreme edge, advance half a page (i.e. scroll the canvas by
     50% of its height).  Provide a `scrollOffset` state for the canvas to
     implement half‑page movement.
   - In landscape mode: treat a swipe as turning two pages simultaneously.  Use
     store actions `nextTwoPages()` and `prevTwoPages()`.
   - Emit custom events (`pageTurn`) or call store directly, whichever is
     consistent with the existing architecture.
2. Create `KeyboardHandler.tsx` or a hook `useKeyboardNavigation`.
   - Attach a `keydown` listener at the document level in a `useEffect`.
   - On `ArrowLeft`/`PageUp` call `goToPreviousPage()`; on `ArrowRight`/`PageDown`/`Space`
     call `goToNextPage()`.
   - Ensure the handler prevents default to avoid scrolling when the canvas is
     focused.  If a modal or text input has focus, handlers should ignore
     events.
   - Expose a prop such as `enabled` so that the parent can temporarily
     disable keyboard handling when a form is active.
3. Update the global store (`standStore.ts`) with corresponding actions that
   modify `currentPage`, `currentPieceIndex`, and `scrollOffset` as
   appropriate.  Add logic for the two‑up and half‑page behaviors.
4. Write unit tests:
   - Simulate taps and swipes on the `GestureHandler` overlay using
     `fireEvent.pointerDown/up` with coordinates, and verify store action calls
     using jest spies or by observing state changes.
   - Simulate orientation changes (mock `matchMedia`) and verify correct
     behavior.
   - For keyboard handling, use `fireEvent.keyDown` on `document` and assert
     that state updates or actions are fired.
5. Write an integration test with `@testing-library/react` that mounts the
   entire stand viewer with the handlers enabled and exercises page turns via
   both gestures and keys, verifying that the canvas content changes (could be
   tracked by a mock callback).

Return the handler component/hook code and the test files with sample test
cases.