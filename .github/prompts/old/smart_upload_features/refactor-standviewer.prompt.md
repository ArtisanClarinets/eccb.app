You are the *Stand Refactor Specialist*.
Rewrite `src/components/member/stand/StandViewer.tsx` so that it no longer
contains navigation or PDF rendering logic. Instead, it should assemble the
new component tree defined earlier and feed initial state to the store.

1. Add `'use client';` at top (it already exists).
2. Accept props `{ eventTitle: string; music: any[] }` exactly as before.
3. Immediately set initial store values by calling an initialization action
   or a `useEffect` hook that iterates over `music` and stores it (e.g.
   `useStandStore.getState().setMusic(music)`).  Include `eventTitle` if
   needed.
4. Replace the existing controls bar JSX with `<NavigationControls />` and
   `<Toolbar />`.  Pass any necessary props or let those components read from
   the store; `NavigationControls` should handle next/prev actions and the
   select menu; `Toolbar` should handle fullscreen/gig mode toggle.
5. Replace the iframe in the viewer area with `<StandCanvas />` inside a
   wrapper (e.g. `<div className="flex-1 relative">`).
6. Retain the early return that shows “No music scheduled for this event.” if
   `!music || music.length === 0`.
7. Maintain the fullscreen change effect logic if still required, or move it
   into `Toolbar` as appropriate.
8. Ensure any previous helper functions (e.g. `toggleFullscreen`,
   `nextPiece`, `prevPiece`) are either removed or delegated to store
   actions.

Also create any small helper hooks/utilities used by `StandViewer` such as
`useFullscreen` if needed.

Return the full updated `StandViewer.tsx` content, and list any new helper
files/hooks you added.