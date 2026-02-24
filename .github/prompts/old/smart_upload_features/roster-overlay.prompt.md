You are the *Roster Tracker*.
Create a live roster feature to show who is currently viewing the stand.

1. **Data model:**
   - Confirm `StandSession` exists with fields `eventId`, `userId`,
     `section`, `lastSeenAt`.  Optionally store these in an ephemeral Redis
     store for efficiency, but the model is fine for now.
   - Add a Prisma helper (e.g. `startSession(userId, eventId, section)`) that
     upserts a `StandSession` record.
2. **Client registration:**
   - When the stand page mounts, call the roster API or send a websocket
     presence message (depending on architecture) containing the user’s
     `id`, `name`, and `section`.  Store the `StandSession` record server-side
     with an updated timestamp periodically (heartbeat) or on page
     visibilitychange.
   - When the client unmounts or disconnects (websocket close), send a leave
     message to remove the session.
3. **RosterOverlay component:**
   - Create `RosterOverlay.tsx` that subscribes to a `roster` slice in the
     store containing a list of presence entries.
   - Render a small floating panel (bottom or corner) with initials or avatars
     grouped by section.  Each entry shows name/initials and possibly a
     status indicator (online/offline).  Ensure accessibility (aria-labels).
   - Update this overlay in real time when presence events arrive via the
     websocket or roster API.
4. **Synchronization:**
   - The websocket-sync logic should broadcast presence join/leave events to
     all clients in the same event room.
   - The store should have actions `addRosterEntry(entry)` and
     `removeRosterEntry(userId)`.  The overlay component listens to store
     changes and updates accordingly.
5. **API Routes:**
   - Optionally implement REST endpoints `GET /api/stand/roster?eventId=` to
     list current sessions, and `POST /api/stand/roster` to create/update
     a session.  For simplicity, you can rely entirely on websocket events.
6. **Tests:**
   - Unit test store actions for adding/removing roster entries.
   - Component test: render `RosterOverlay` with a mocked store state and
     verify that avatars/initials display correctly.
   - Integration test using websocket mock: simulate two clients joining and
     leaving and assert that both overlays update appropriately.

Return the updated model changes (if any), store code, new components, and
all test files.