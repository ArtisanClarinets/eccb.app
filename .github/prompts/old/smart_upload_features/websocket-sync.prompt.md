You are the *Sync Server/Client*.
Build a real‑time synchronization channel for the stand using WebSockets.

**Server side (`/api/stand/sync`):**
1. Implement this as a Next.js route handler that performs an upgrade to a
   WebSocket.  Use the `ws` library or native `WebSocket` if available.
2. During the HTTP handshake, validate the session by calling
   `await auth.api.getSession({headers})`.  Deny the upgrade if no valid
   session.
3. Expect a query parameter `?eventId=xxx` and verify that the user has
   permission to view that event (`isMemberOfEvent(eventId, userId)` or
   `hasRole('CONDUCTOR', eventId)`). Reject otherwise.
4. Once the socket is open, maintain a map of connected clients keyed by
   `eventId` (and optionally section/role).  When a new client connects, add
   it to the appropriate room and broadcast a "presence" message with
   `{ type: 'presence', userId, name, section }` to others.
5. Define a JSON message format for commands, e.g.:
   ```json
   { "type": "command", "action": "setPage", "page": 3 }
   { "type": "command", "action": "setPiece", "pieceIndex": 1 }
   { "type": "mode", "name": "nightMode", "value": true }
   { "type": "annotation", "data": {...} }
   { "type": "presence", "userId": "", "status": "joined" }
   ```
   Validate incoming messages with zod schemas.
6. When a message arrives from a client:
   - If it is a control command (page, piece, mode), broadcast to all other
     clients in the same `eventId` room.  Optionally store the current state in
     a transient in-memory map so new connections can be synchronized.
   - If it is an annotation, optionally persist it via the annotations API
     before broadcasting (or broadcast optimistically depending on network
     performance requirements).
   - For presence updates (`joined`, `left`), broadcast to the room and update
     any `StandSession` entries.
7. Handle socket `close` events by broadcasting a presence `left` message and
   cleaning up the client list.
8. Ensure you gracefully handle errors and limit message sizes to avoid abuse.

**Client side:**
1. Create a hook `useStandSync(eventId: string)` that:
   - Opens a WebSocket connection to `/api/stand/sync?eventId=${eventId}` when
     the component mounts.
   - Sends a presence `joined` message once open.
   - Listens for messages: parse JSON, dispatch corresponding store actions
     (`setPage`, `setPiece`, `applyAnnotation`, `updateRoster`).
   - Provide a function `sendCommand(message)` that other components can call
     to broadcast commands (e.g. conductor UI calling this to change page).
   - Handle reconnection logic on network failure.
   - Ensure the socket is closed when the hook is unmounted and broadcast a
     `left` message first.
2. Optionally add helpers for permission-aware broadcasting (only certain
   users can send certain command types).

**Testing:**
- Write integration tests using a `ws` server mock (e.g. `jest-websocket-mock`)
  to simulate clients connecting, sending messages, and verifying broadcasts
  are received by the right peers.
- Test authentication failure by mocking `auth.api.getSession` to return null.
- Verify that presence messages add/remove users correctly.

Return the server route file, the client hook file, and the associated test
files with example messages and assertions.