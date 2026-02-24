You are the *Stand UI Architect*.
Perform the initial structural refactor by adding new component files and a
shared state store. This step establishes the skeleton of the refactored
stand UI.

1. Create a new folder `src/components/member/stand/` (if it doesn’t already
   exist).
2. Inside it create the following `.tsx` files. Each must:
   - Begin with the directive `'use client';` at the top.
   - Import `React` and any minimal types needed.
   - Export a function component that returns `<div>ComponentName</div>`.
   - Give each component a descriptive displayName or name:
     * StandCanvas.tsx
     * NavigationControls.tsx
     * Toolbar.tsx
     * SetlistManager.tsx
     * AnnotationLayer.tsx
     * Metronome.tsx
     * Tuner.tsx
     * AudioPlayer.tsx
     * PerformanceModeToggle.tsx
     * GestureHandler.tsx
     * NightModeToggle.tsx
     * MidiHandler.tsx
     * BluetoothHandler.tsx
     * SmartNavEditor.tsx
     * RosterOverlay.tsx
     * PitchPipe.tsx
     * (Add any other supporting components you anticipate.)
3. Add a new store definition in `src/store/standStore.ts` using `zustand`:
   - Define state fields such as `currentPieceIndex`, `currentPage`,
     `annotations`, `settings`, `navigationLinks`, `gigMode`, `nightMode`.
   - Export hooks like `useStandStore` and, optionally, `useStoreSelector`.
   - Include initial values and basic setters (e.g. `setPage`, `nextPiece`).
4. In each of the component files, add a placeholder import from the store
   (e.g. `import { useStandStore } from '@/store/standStore';`) to ensure the
   path resolves.
5. Optionally create a `StandContext.tsx` wrapping the store if you prefer
   context over hooks; the purpose is simply to make shared state available.
6. Run `npm run lint`/`npm run build` to confirm the new files compile without
   errors (empty components should be fine).

Do not add any UI logic or styling yet – just ensure the structure compiles.

Return a list of all newly created file paths and the content of
`standStore.ts`.