You are the *Annotation Layer Manager*.
Complete the implementation of the multi‑layer annotation system with
persistence and real‑time sync.

1. **Database/model:**
   - Confirm the `Annotation` model and `AnnotationLayer` enum exist (see schema
     prompt).  If migration hasn’t been executed, run the migration now.
   - Add any necessary indexes (e.g. `(musicId, page, layer)`).
2. **Store actions:**
   - Introduce state slices `annotations.personal`, `annotations.section`, and
     `annotations.director` keyed by `musicId` and `page`.
   - Add actions `loadAnnotations(musicId, page)`, `addAnnotation(ann)`,
     `updateAnnotation(ann)`, `deleteAnnotation(id)` that call the API and
     update state.
   - Add a `selectedLayer` state field and actions `setLayer(layer)`.
3. **Canvas layers:**
   - Modify `StandCanvas` or create an `AnnotationLayer.tsx` component that
     renders three stacked `<canvas>` elements (one per layer) with
     `pointer-events` enabled only for the currently selected layer when in
     edit mode.
   - Each canvas should have its own drawing context and be sized to match the
     main PDF canvas.  Use absolute positioning and z-index to layer them.
   - When `currentPage` changes, clear and redraw the appropriate layer from
     store data.  You may serialize strokes as arrays of points and strokes
     attributes (color, width).
4. **Drawing logic:**
   - In edit mode with a layer selected, attach pointer event listeners that
     track `pointerdown`, `pointermove`, and `pointerup`.
   - Record the pointer coordinates relative to the canvas; include
     `pressure` from the event.  Map `pressure` to line width or opacity
     (e.g. `const width = 1 + event.pressure * 4`).
   - Render live strokes on the canvas for feedback.  On pointer up, push the
     completed stroke into a stroke list for the layer.
   - Implement eraser tool by clearing stroke segments or using
     `globalCompositeOperation = 'destination-out'`.
   - For highlighter, set `globalCompositeOperation = 'multiply'` and a
     transparent color.
   - For white‑out, paint opaque white rectangles or strokes over existing
     content and record them as special strokes.
5. **Persistence:**
   - When a stroke is finished (or when the user explicitly saves), send the
     stroke data (vector of points, color, width, tool type, layer, page,
     musicId, userId) to `POST /api/stand/annotations`.  The server returns the
     persisted annotation with an `id`.  Store it in the appropriate slice.
   - Support editing/deleting annotations via `PUT`/`DELETE` endpoints.
     Personal annotations are only editable by their creator; section and
     director annotations may require permission checks on the server.
6. **Real-time sync:**
   - When an annotation is created/updated/deleted on one client, send a
     `{ type: 'annotation', data: {...} }` message over the websocket
     connection managed by the `websocket-sync` hook.  Other clients receive
the message and dispatch corresponding store actions to update their canvases.
   - On receipt, ensure that personal annotations from other users are not
     displayed if they are not in the appropriate layer.
7. **Layer toggles/edit modes:**
   - Create UI controls (e.g. radio buttons or tabs) allowing the user to
     switch between personal, section, and director layers.  Only the
     selected layer should be editable; others should be visible but not
     interactable.
   - Add a button to toggle “edit mode” on/off; when off all layers are
     read‑only and pointer events are disabled.
   - Section and director layers may have visibility toggles to hide/show
     them without changing the selected layer.
8. **Tests:**
   - Unit tests for store actions verifying API calls and state updates.
   - Component tests for `AnnotationLayer` verifying that drawing events
     produce strokes and that strokes respect pressure width/opacity.
   - Tests for layer switching: toggling layers should enable/disable
     pointer events correctly.
   - Integration tests with websocket mock: create an annotation in one client
     and verify that a second client receives and displays it.
   - Backend tests for annotation API permission enforcement and storage.

Return:
- Updated UI components and store code.
- API route updates from earlier prompt (if needed).
- All test files demonstrating drawing, pressure, layer visibility, and
  synchronization.