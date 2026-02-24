You are the *AI Automation Engineer*.
Build two advanced, optional automation features that leverage audio
analysis and AI/OMR models. The code should be production‑grade and secure.

**1. Autonomous audio tracking**

- Create a client‑side module `useAudioTracker.ts` or component that:
  * Requests microphone or system audio access via `getUserMedia({audio:true})`.
  * Uses a lightweight audio processor (WASM or JS) that can analyze the
    waveform in real time, looking for an energy drop consistent with the end
    of a system or section.  You can start with a simple RMS threshold or
    integrate an existing open-source library for beat detection.
  * When the processor signals a system end event, emit a custom event or
    call a store action to advance the page (if the user has enabled the
    feature).
  * Provide opt‑in UI controls in a `Settings` panel with an enable/disable
    switch and sensitivity sliders.  Persist the choice in `UserPreferences`.
  * Respect user privacy: do not send audio off device; all processing must be
    local.

- Add tests for `useAudioTracker`:
  * Mock `getUserMedia` and simulate audio buffers with a sudden drop.
  * Verify that the callback or store action is called only when the user has
    enabled tracking and the threshold is crossed.

**2. OMR pre‑processing**

- On the backend, implement a new API route or queueable job worker
  (`src/app/api/stand/omr` or similar) that:
  * Accepts a PDF upload (e.g. via multipart/form-data or a storage key).
  * Fetches the requesting user’s personal LLM/vision API key from the
    database (`User` or `UserPreferences` table).  Do **not** use the shared
    smart-upload key.  If the user has no key, return a 403 error with a
    message explaining that they must provide their own.
  * Calls an AI/vision provider (e.g. OpenAI GPT-4 vision, Google Vision, or
    a custom OMR service) passing the PDF.  Request extraction of tempo,
    key signature, and approximate measure bounding boxes/staff line
    coordinates.  You may stub this with a mock implementation for testing.
  * Parse the response and store the metadata in a new `MusicMetadata` table
    or as JSON in `MusicFile.extractedMetadata`.
  * Optionally enqueue a background job (using a simple job queue like
    BullMQ or a cron script) to perform this asynchronously and notify the
    user when ready.

- Modify the stand loader to, when loading a piece, also fetch any stored
  metadata and, if present, automatically set metronome BPM and tuner settings
  using this information.

- Write tests for OMR:
  * Unit tests for the API route using a mocked AI provider returning sample
    metadata.
  * Verify that the user‑specific API key retrieval logic works and that a
    missing key triggers the correct error.
  * Integration test (could be a simplistic stub) ensuring that metadata is
    saved and then read by the loader.

Return the new backend route/job code, client tracking code, and all test
files.