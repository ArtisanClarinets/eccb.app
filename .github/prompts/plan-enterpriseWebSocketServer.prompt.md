## Plan: Enterprise WebSocket Server for Digital Music Stand

This plan details the implementation of a production-grade, horizontally scalable WebSocket server to provide real-time synchronization (annotations, page turns, presence) for the Digital Music Stand. It leverages the existing `Socket.IO` framework, moves in-memory state to Redis for persistence and scalability, and integrates seamlessly with the ECCB App architecture.

### TL;DR
We will move the existing (currently inactive) WebSocket logic into a dedicated, enterprise-grade server process. Key upgrades include replacing in-memory maps with **Redis** for state and using the **Socket.IO Redis Adapter** for multi-node support. Security is handled via session token validation, and reliability is ensured through automatic polling fallbacks.

---

### Steps

**1. Infrastructure & Scaling (Redis Integration)**
- Refactor [src/lib/websocket/stand-socket.ts](src/lib/websocket/stand-socket.ts) to replace `eventRooms` and `standStates` Maps with **Redis hashes**.
- Implement a **Redis Pub/Sub** mechanism using `@socket.io/redis-adapter` within `initializeStandSocketServer` to allow events to sync across multiple WebSocket server instances.
- Update [src/lib/redis.ts](src/lib/redis.ts) (or equivalent) to provide a dedicated Redis client for the socket adapter.

**2. Authentication & Authorization**
- Implement a `validateSession` helper in [src/lib/websocket/stand-socket.ts](src/lib/websocket/stand-socket.ts) that reads the `auth_session` cookie or a `token` query param and validates it against the `Session` table in MariaDB or Redis.
- Use the existing `canAccessEvent` check during the `connection` handshake to ensure only authorized members can join an event's real-time room.

**3. Dedicated Server Entry Point**
- Create `src/server/socket-worker.ts` as a standalone Node.js entry point.
- This server will initialize an `http.Server`, attach the `Socket.IO` instance from `stand-socket.ts`, and listen on a configurable port (e.g., `3005`).
- Add a new script to `package.json`: `"start:sockets": "tsx src/server/socket-worker.ts"`.

**4. Worker Process Integration**
- Update [src/workers/index.ts](src/workers/index.ts) to optionally spawn the WebSocket server as part of the background worker process if `process.env.ENABLE_WEBSOCKETS === 'true'`.
- Ensure graceful shutdown: close all socket connections and the Redis adapter before the process exits.

**5. Proxy & Routing Configuration**
- Update the development configuration (or `next.config.ts` rewrites) to proxy requests from `/api/stand/socket` to `localhost:3005`.
- Document Nginx/Load Balancer configurations required for production (enabling `Upgrade` headers and sticky sessions if not using Redis adapter).

**6. Frontend Activation**
- Update [src/lib/stand/settings.ts](src/lib/stand/settings.ts) to default `websocketEnabled` to `true` (controlled by admin toggle).
- Enhance [src/hooks/use-stand-sync.ts](src/hooks/use-stand-sync.ts) to:
  - Detect connection failures and automatically switch to `polling` mode.
  - Implement an exponential backoff for reconnection attempts.
  - Sync the initial state from the WebSocket server upon connection.

**7. Monitoring & Presence**
- Implement a "Heartbeat" mechanism to prune stale presence data from Redis if a client disconnects abruptly.
- Add an internal API endpoint `/api/admin/stand/status` to report active rooms and connection counts.

---

### Verification

**Unit & Integration Tests**
- `npx vitest src/lib/websocket/stand-socket.test.ts`: Verify message validation, room logic, and Redis state transitions.
- Test authentication bypass attempts with invalid session tokens.

**Load & Stress Testing**
- Use `socket.io-client` scripts to simulate 100+ concurrent musicians in a single event room.
- Measure latency for "Page Turn" broadcasts (Target: < 50ms).

**Manual Verification**
1. Enable "WebSocket" mode in Admin Settings.
2. Open the Music Stand in two separate browser windows.
3. Verify that turning a page in one window reflects immediately in the other.
4. Kill the socket server process and verify that the UI seamlessly falls back to 5s polling.

---

### Decisions
- **Standalone Process vs. Next.js Route**: Chose a standalone process (worker) because Next.js Route Handlers do not support persistent TCP/WebSocket connections natively in most production environments.
- **Redis over In-Memory**: Required for "enterprise-level" reliability, allowing the server to restart without losing the current session state or disconnecting users from their "rooms."
- **Shared Session DB**: Leveraging the existing MariaDB/Redis session store ensures that we don't need a separate auth system for WebSockets.
