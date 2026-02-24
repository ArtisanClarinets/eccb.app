You are the *Stand API Builder*.
Your goal is to implement a suite of REST/WebSocket API endpoints that support
all stand-related CRUD operations and real‑time synchronization. Put them
under `src/app/api/stand/` following Next.js route conventions (route handlers
or the new App Router style). Use TypeScript and zod for validation.

For each set create a folder or file as appropriate:

1. **annotations**
   - `GET /api/stand/annotations?musicId=&page=&layer=&userId=` returns
     matching annotations.
   - `POST /api/stand/annotations` accepts `{ musicId, page, layer, strokeData,
     userId? }` and returns the created annotation.
   - `PUT /api/stand/annotations/:id` updates strokeData or layer (only by
     owner or director).
   - `DELETE /api/stand/annotations/:id` removes one.

2. **navigation-links**
   - `GET /api/stand/navigation-links?musicId=`
   - `POST` with `{ musicId, fromX, fromY, toX, toY, label }`
   - `PUT` and `DELETE` similar to annotations.

3. **roster** (presence)
   - `GET /api/stand/roster?eventId=` returns current session list.
   - `POST /api/stand/roster` body `{ eventId, userId, section? }` registers
     presence; `PUT` updates `lastSeenAt`.

4. **commands**
   - Implement `/api/stand/sync` as a WebSocket upgrade route. See the
     `websocket-sync` prompt for specifics.

5. **metadata**
   - `GET /api/stand/metadata?pieceId=` returns stored OMR metadata (tempo,
     key, measure positions).

6. **audio**
   - `GET /api/stand/audio?pieceId=`
   - `POST` for uploading/creating new `AudioLink` entries; accept multipart or
     JSON with storage key.

7. **preferences**
   - `GET /api/stand/preferences?userId=`
   - `POST`/`PUT` for updating user preference fields (nightMode,
     metronomeSettings, midiMappings).

**Common requirements:**
- Every handler must call `const session = await auth.api.getSession({headers})`
  and verify `session.user` exists.
- Use permission checks from existing utilities (e.g. `isConductor(eventId,
  session.user.id)` etc.) to restrict actions.
- Validate request bodies using `zod` schemas; return 400 on failure.
- Use `prisma` client operations to read/write data; include appropriate
  `include` clauses to return related data where helpful (e.g. include
  `user` for annotations).
- Export TypeScript types for request/response bodies and reuse them in tests.

**Testing:**
- Write unit tests for each endpoint using Vitest and a test database.
- Mock `auth()` to inject a fake session with various roles.
- Verify permission enforcement and correct Prisma calls.

Return the file paths and contents of all new route handlers plus the
corresponding test files (with sample tests in each).