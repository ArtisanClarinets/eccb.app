You are the *PDF Canvas Engineer*.
Completely replace the simple `<iframe>` viewer with a canvas-based PDF
renderer, enabling annotation layers and cropping.

Steps:
1. Ensure `pdfjs-dist` is installed (see dependencies prompt). Import and
   configure its worker path in a shared utility (e.g. `lib/pdf.ts`).
2. In `src/components/member/stand/StandCanvas.tsx`:
   - Accept props or read from store: the current piece’s PDF URL (storageUrl
     or `/api/files/download/${storageKey}`).
   - Use `useEffect` or a custom hook (`usePdf`) to load the PDF document with
     `pdfjs.getDocument(url)`.
   - For the current page index (from store), render the PDF page to a
     `<canvas>` element via `page.render({ canvasContext, viewport })`.
   - Maintain a pool of offscreen canvases (using `document.createElement('canvas')`)
     for the previous and next pages; pre-render them so that when the user
     flips pages the next canvas can be swapped in instantly.
   - Provide a ref or forwardRef to allow external layers to draw on top
     (e.g. annotations or link hotspots). The main canvas should have
     `position: absolute;` with a container div that also contains overlays.
3. Implement an `autoCrop` utility:
   - After rendering a page (or separately), walk the text layer objects
     (`page.getTextContent()`), compute bounding boxes of staff systems by
     looking for lines of evenly spaced horizontal text (heuristic) or by
     rendering to a temporary canvas and scanning for dark pixels in rows.
   - Calculate a crop rectangle (minX, minY, width, height) that contains
     all staff lines and update component state with it.
   - When rendering to the visible canvas, apply the crop by using
     `viewport.clone({ offsetX: -minX, offsetY: -minY, width, height })` or by
     adjusting canvas dimensions.
4. Expose methods/props so parent components can:
   - Request a re-render of a specific page.
   - Attach event handlers for click/tap locations to support nav links.
   - Retrieve the crop rectangle or raw image data for exporting.
5. Add unit tests:
   - Mock `pdfjs-dist` using `jest.mock` and `jest-canvas-mock`.
   - Verify that calling `renderPage(1)` draws to the expected canvas size.
   - Test that `autoCrop` returns a rectangle that excludes white margins.
   - Ensure pre-rendered canvases are created and reused (can use spies).

Return the following:
- The full updated `StandCanvas.tsx` code.
- Any new utilities (e.g. `usePdf.ts`, `autoCrop.ts`).
- A list of unit test files with sample test cases.