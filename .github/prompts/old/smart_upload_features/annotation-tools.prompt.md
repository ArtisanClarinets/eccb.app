You are the *Annotation Tools Engineer*.
Implement a full suite of interactive drawing and annotation tools within the
`AnnotationLayer` infrastructure.

1. **Tool framework:**
   - Define a `Tool` enum (`PENCIL`, `HIGHLIGHTER`, `ERASER`, `WHITEOUT`,
     `TEXT`, `STAMP`, etc.).
   - Add a `currentTool` state to the store with setter actions.  Provide
     UI (buttons, dropdown) in a `Toolbar` or inside `AnnotationLayer` for
     selecting the tool.  Also expose color and stroke width settings.
2. **Freehand drawing:**
   - Already partly covered in annotations prompt; capture pointer events and
     draw strokes.  Make strokes color/width configurable via the toolbar.
3. **Pressure sensitivity:**
   - During `pointermove` events, read `event.pressure` and compute width
     (`width = baseWidth + pressure * pressureScale`).  Store this value in
     the stroke data and render accordingly.
4. **Highlighter tool:**
   - When `currentTool === Tool.HIGHLIGHTER`, set `ctx.globalCompositeOperation =
     'multiply'` and draw with a translucent yellow/selected color.  This
     should allow underlying PDF content to show through.
   - Optionally implement the highlighter as a separate canvas layer to avoid
     affecting other annotations.
5. **White‑out/mask tool:**
   - Set `ctx.globalCompositeOperation = 'destination-out'` or draw with
     opaque white to cover existing content.  Record these actions as special
     strokes so they can be undone or persisted.
6. **Text boxes:**
   - When the user selects the text tool, allow clicking on the canvas to
     place a movable, resizable HTML `<textarea>` overlay.  After the user
     finishes typing (on blur or Enter), render the text onto the canvas and
     remove the textarea.
   - Persist text as a stroke with a `type: 'text'` and `text` content, along
     with font size and position.
7. **Stamp library:**
   - Create an array of SVG icons for musical symbols (dynamics, accents,
     etc.) stored in `src/assets/stamps/` or similar.
   - Provide a UI palette of stamps that the user can drag onto the canvas.
   - On drop, render the SVG at the drop location, allowing the user to
     resize/rotate using control handles.  Record stamp attributes in stroke
     data (`type: 'stamp', svg: '<svg...>', width, height, rotation`).
8. **Persistence:**
   - All tools should record vector data (points, types, colors, widths) in a
     JSON-friendly format and send to the annotations API when the stroke is
     completed.  This follows from earlier prompts on annotation persistence.
9. **Tool-specific undo/redo:**
   - Optionally add undo/redo functionality by keeping a history stack in the
     store, allowing users to revert actions per layer.
10. **Tests:**
    - For each tool, write unit tests that simulate pointer events and verify
      the resulting stroke data structure and canvas drawing operations (using
      jest-canvas-mock to verify `fillStyle`, `globalCompositeOperation`,
      `fillText`, `drawImage`, etc.).
    - Test that pressure events alter stroke width.
    - For text boxes, test that typing and blurring results in a canvas drawing
      call with correct text.
    - For stamps, test dragging from the palette onto the canvas creates a
      stroke with the correct SVG content and dimensions.

Return the enhanced `AnnotationLayer` component code (or related helper
components) and all associated test files.