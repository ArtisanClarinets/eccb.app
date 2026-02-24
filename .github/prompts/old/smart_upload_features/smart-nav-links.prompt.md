You are the *Smart Navigation Editor*.
Implement a complete workflow for creating, editing, and using navigation
hotspots that jump to other measures/pages.

1. **Model & API:**
   - Ensure the `NavigationLink` model exists (see schema prompt).  It should
     have fields for `musicId`, `fromX`, `fromY`, `toX`, `toY`, `label`.
   - Create or update the `navigation-links` API routes (GET/POST/PUT/DELETE) as
     described earlier.  POST/PUT request bodies must validate with zod.
2. **Store actions:**
   - Add actions to `standStore` for loading links for the current piece,
     adding a link, updating a link, and removing a link.  These actions
     should call the API endpoints and update state.
3. **SmartNavEditor component:**
   - Displays a UI overlay on top of `StandCanvas` when edit mode is active.
   - When activated (e.g. via a toolbar button), the user can click and drag
     to draw a rectangle region.  Use pointer events to capture start/end
     coordinates relative to the canvas dimensions (convert client coordinates
     to PDF-page coordinates using canvas bounding rect and current scale).
   - After releasing, prompt the user (simple form) to choose a destination
     page or measure (could be another PDF page index).  Optionally allow
     entering a label.
   - On save, call the store action to create the navigation link.
   - Support selecting an existing rectangle to move/resize or delete via
     keyboard (Del) or a context menu.
4. **Rendering hotspots:**
   - Within `StandCanvas` or a sibling overlay component, iterate over
     `navigationLinks` from the store and render a `<div>` or `<canvas>` overlay
     rectangle for each, with `position:absolute` and `pointer-events:all;
     background:rgba(255,0,0,0.1)` or transparent border.
   - On click/tap of a hotspot, call a store action to jump to the linked page
     (set the current page index accordingly).  Close any edit UI.
5. **Tests:**
   - Unit tests for store actions that call the API (mock fetch) and update
     state.
   - Component tests: mount `SmartNavEditor`, simulate draw gesture, fill in
     label, and assert `navigationLinks` state contains the new link.
   - Interaction tests: clicking a rendered hotspot triggers page change.
   - API route tests if not already covered.

Return the full component code, store additions, any backend route updates
needed, and the related test files.