You are the *Stand Documentation Writer*.
Produce comprehensive documentation covering both end‑user and developer
aspects of the expanded digital music stand.  Place new guides in the
`docs/` directory as Markdown files.  In source code, add inline comments for
any logic that may be unfamiliar to future developers.

Your documentation should include at least:

1. **End‑user guides:**
   - “How to use the collaborative stand” – opening pieces, turning pages,
     using gig mode, night mode, and navigation links.
   - “Annotation tools” – description of each tool (pencil, highlighter,
     eraser, text, stamps), layer types (personal/section/director), and how
     annotations sync or remain private.
   - “Rehearsal utilities” – instructions for using the metronome, tuner,
     audio player, pitch pipe, and keyboard shortcuts.
   - “Hardware setup” – pairing Bluetooth page‑turners, connecting MIDI
     controllers, and configuring mappings.
   - “Conductor features” – how to broadcast commands and control the roster.
2. **Developer guides:**
   - “API reference” – list of `/api/stand/*` endpoints, their methods,
     expected request bodies, and sample responses.
   - “Database schema” – explanation of the new models (`Annotation`,
     `NavigationLink`, `StandSession`, `AudioLink`, `UserPreferences`) with
     field descriptions and relationships.
   - “PDF canvas rendering” – overview of the architecture, cropping logic,
     and how to debug render issues.
   - “WebSocket protocol” – message formats for sync commands, presence, and
     annotations; how the server manages rooms and permissions.
   - “Audio scheduling and OMR” – how the metronome is implemented using the
     Web Audio API, how the audio tracker works, and the backend OMR job flow.
   - “Testing strategy” – how tests are organized, how to run unit/integration/
     e2e tests, and guidelines for adding new tests.
   - “Performance & accessibility” – notes on the wake lock API, keyboard
     navigation, usage of requestAnimationFrame, and fallbacks.

Wherever instructions refer to component or file names, include relative
paths (e.g. `src/components/member/stand/StandCanvas.tsx`).

Return a list of the newly created markdown files and a short summary of the
inline comments you added to the source code.