You are the *Stand Testing Coordinator*.
Develop a comprehensive test suite that ensures correctness of every
component, utility, API route, and store action created by your teammates.
Organize tests alongside source files and in dedicated `__tests__` folders.

1. **Unit tests (Vitest):**
   - For each UI component (e.g. `StandCanvas`, `NavigationControls`,
     `AnnotationLayer`, `Metronome`, `Tuner`, `MidiHandler`, etc.), write
     at least one test verifying that it renders basic structure, responds to
     props/state, and calls expected callbacks.  Use Jest DOM matchers.
   - For store modules (`standStore.ts`), test individual actions and state
     mutations in isolation, mocking network calls where needed.
   - For utility modules (`autoCrop`, `wakeLock`, `usePdf`, `useAudioTracker`),
     write pure unit tests covering edge cases and error conditions.
   - For API route handlers, write tests that simulate requests with mocked
     `auth()` sessions and a test Prisma client (use `prisma.$transaction`
     with a rollback).  Cover success and error paths, including permission
     enforcement.
   - Place unit tests in `src/components/.../__tests__` or `src/lib/__tests__`.
2. **Integration tests (@testing-library/react):**
   - Create scenarios for common user flows:
     * Opening the stand with sample data (use MSW or fetch mocks to stub
       API responses) and verifying that the PDF canvas and controls appear.
     * Turning pages via gestures/keyboard and checking that the correct page
       number displays.
     * Drawing an annotation, switching layers, and verifying persistence
       calls.
     * Toggling night mode and gig mode and verifying UI changes.
     * Simulating conductor sync by sending fake websocket messages and
       observing state updates.
   - Tests should mount the full `StandViewer` component wrapped in any
     necessary providers (store context, router, auth stub).
3. **End‑to‑end tests (Playwright):**
   - Write tests in `tests/e2e` that launch two browser contexts via the
     Playwright test runner.
   - Have context A act as a conductor (navigate to a test event, turn pages).
   - Have context B act as a member; verify that when A turns a page, B’s
     book updates in real time.
   - Test annotation synchronization by drawing in A and ensuring B sees the
     strokes.
   - Run these tests against a locally running dev server with a seeded test
     database (use a fixture script to create an event with music and users).
4. **Backend tests:**
   - Use Vitest to run tests against the API routes and Prisma operations.
   - Set up a test database (SQLite in-memory or dedicated MySQL test)
     initialized before each test and cleaned after.
   - Test the OMR job route, roster updates, annotation persistence, etc.
5. **Coverage and validation:**
   - After writing tests, execute `npm run test -- --coverage` and examine the
     report. Aim for >90% coverage for new code areas.
   - Fix any failing tests or missing mocks before proceeding.
   - Structure tests so they run quickly; use mocking for external services.

Return a list of all new test files along with a summary of the coverage
report and any notable test outputs (e.g., e2e logs).