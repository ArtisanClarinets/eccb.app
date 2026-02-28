Below is an **exhaustively granular “Definition of Done”** for the Digital Music Stand—structured so you can turn it into tickets, QA scripts, and release gates. It covers:

* **Everything already in your codebase** (stand viewer, PDF, annotations, links, audio, sync, preferences, roster, tools)
* **What’s needed to reach “PiaScore-level”** in reliability and UX
* The **new items you added**: *music playback with synced score*, *PDF markup tools*, *practice tracking logs*

I’m writing this as if “done” means: **members can use it daily for rehearsals and performances with no special training, with correct permissions, and with production monitoring.**

---

# Digital Music Stand: Definition of Done (Exhaustive)

## 0) Release readiness gates

### 0.1 “Ship blocker” conditions (must be true)

* [ ] A member can reach the stand from the UI **without needing a direct URL**.
* [ ] A member cannot access a stand for an event they should not have access to (no URL guessing / direct object reference).
* [ ] No PERSONAL annotations are ever visible to other users.
* [ ] A stand session does not crash on empty/partial profile data (names missing, no section assigned, etc.).
* [ ] PDF pages render reliably on desktop + iOS Safari + Android Chrome.
* [ ] Page turning works correctly and never gets stuck at page 1 due to missing totalPages.
* [ ] All stand APIs have consistent request/response contracts, validated inputs, and correct status codes.

### 0.2 Minimum test gates (must pass in CI)

* [ ] Stand page authorization tests.
* [ ] Annotation visibility & layer permissions tests.
* [ ] Stand file proxy ownership/event authorization tests.
* [ ] Navigation link create/update/delete tests.
* [ ] Audio link create/update/delete tests.
* [ ] Practice log create/read tests.
* [ ] Smoke test for stand page render + load (server component + client component hydration).

---

# 1) Member UI integration (discoverability + entry points)

## 1.1 Stand is visible and accessible from member UI

* [ ] Member sidebar includes a persistent “Music Stand” nav item.
* [ ] `/member/stand` hub page exists and shows:

  * [ ] Upcoming events with a program (music attached) with “Open Stand” buttons.
  * [ ] “Resume last opened stand” (based on stored preference).
  * [ ] Clear “No program yet” state for events without music.
* [ ] Member Calendar cards include a stand action when an event has music.
* [ ] Member Event Detail page includes “Open Music Stand” button when music is present.

## 1.2 Member can reach the stand even if the event detail page is not used

* [ ] `/member/stand` is fully functional, not just a link list.
* [ ] Hub page respects permissions: it only lists stands the member can open.

## 1.3 UI permissions are reflected (no confusing dead buttons)

* [ ] If a member cannot access an event’s stand, the UI does not show “Open Stand” (or shows disabled with tooltip “Not assigned / not eligible” depending on policy).
* [ ] Director-only tools (SmartNav edit, director annotation layer write, command broadcast) are hidden for non-directors.

---

# 2) Admin / organization controls

## 2.1 Admin can attach and manage event programs (required for member access)

* [ ] `/admin/events/[id]/music` exists and is linked from the admin event page.
* [ ] Admin can:

  * [ ] Add pieces from the music library to the event.
  * [ ] Remove pieces from the event.
  * [ ] Reorder pieces (persisted `sortOrder`).
  * [ ] Mark which PDF is the “default” for members if multiple PDFs exist.
  * [ ] Optional: assign sections/parts to pieces.

## 2.2 Organization-level “Music Stand” settings (recommended)

* [ ] Admin Settings includes a “Music Stand” section with:

  * [ ] Stand enabled/disabled (global kill switch).
  * [ ] Stand access policy:

    * [ ] Attendance required vs member-only vs published-only.
  * [ ] SECTION layer write policy:

    * [ ] section members / section leaders / director only
  * [ ] Real-time mode policy:

    * [ ] polling only / socket enabled
  * [ ] Whether cross-piece navigation links are allowed.
  * [ ] Default zoom and performance mode defaults (optional).
* [ ] Settings are persisted in SystemSetting (or org settings model) and applied across stand routes + APIs.

---

# 3) Authorization & security (non-negotiable)

## 3.1 Stand route authorization (server-side)

* [ ] `/member/stand/[eventId]` validates:

  * [ ] user is authenticated
  * [ ] user is a valid member (or staff role)
  * [ ] user is allowed to access the event per org policy
* [ ] Unauthorized access returns `notFound()` (prevents event enumeration).
* [ ] Unauthorized attempts are logged (structured logs).

## 3.2 Stand file access is secure (no storageKey guessing)

* [ ] PDFs are loaded through a stand proxy route (same origin), e.g.:

  * [ ] `/api/stand/files/[...key]?eventId=...`
* [ ] Proxy route validates:

  * [ ] user session
  * [ ] event access
  * [ ] the requested file belongs to a piece included in that event
* [ ] No direct `storageKey` URL allows bypassing access rules.

## 3.3 Annotation privacy rules are correct

* [ ] PERSONAL annotations are only returned to the author.
* [ ] SECTION annotations are only returned to users who match the section scope.
* [ ] DIRECTOR annotations are returned to all permitted viewers, but only writable by director roles.

## 3.4 Every stand API enforces access

For every stand endpoint (`annotations`, `navigation-links`, `audio`, `sync`, `roster`, `files`, `preferences`, `metadata`, `omr`):

* [ ] session required
* [ ] access validated (event or piece assignment or admin role)
* [ ] input validated via Zod
* [ ] consistent error codes: 401 unauth, 403 forbidden, 404 not found, 400 validation

---

# 4) PDF rendering and viewer experience (PiaScore-level)

## 4.1 PDF rendering is reliable and fast

* [ ] PDF renders to the actual visible canvas (ref wiring correct).
* [ ] PDF worker loads under CSP (no blocked cdn).
* [ ] High DPI rendering is crisp (devicePixelRatio handled).
* [ ] Zoom range works (min/max defined and enforced).
* [ ] Pan/scroll works smoothly.
* [ ] Adjacent page preload works and doesn’t leak memory.

## 4.2 Page navigation is correct

* [ ] `totalPages` is accurate per piece.
* [ ] next/prev page works at boundaries.
* [ ] nextPageOrPiece works: advances to next piece at end, and sets `atEnd` properly.
* [ ] Jump-to-page works.
* [ ] Jump-to-piece works (setlist manager).

## 4.3 Performance / stage mode

* [ ] Performance/Gig mode hides non-essential UI and prevents accidental edits.
* [ ] Fullscreen works reliably.
* [ ] Night mode works and is legible (contrast acceptable).
* [ ] A “lock controls” mode exists (prevents taps from changing tools during performance).

## 4.4 Cross-platform QA matrix

* [ ] Desktop Chrome
* [ ] Desktop Safari
* [ ] iOS Safari
* [ ] Android Chrome
* [ ] Tablet layout (iPad, Android tablet)

---

# 5) Parts & assignment logic (musician-specific like real digital stands)

## 5.1 Correct part selection per member

* [ ] For each event piece, the stand selects the member’s best PDF:

  * [ ] Based on part assignment (MusicAssignment / instrument / section).
  * [ ] Fallback to “default part PDF” if assignment is missing.
  * [ ] Fallback to full score PDF as last resort.
* [ ] Member can manually override part for a piece and it persists (preference).
* [ ] Director can switch to full score view easily.

## 5.2 Program completeness checks

* [ ] Admin UI flags missing PDFs for event program items.
* [ ] Stand hub UI shows “incomplete program” warnings where appropriate.

---

# 6) Annotation system (PDF markup tools)

You already have a strong base—“done” means it behaves like a pro tool.

## 6.1 Tool completeness (PDF markup/annotation tools)

* [ ] Pencil tool: smooth strokes, pressure scaling, adjustable thickness.
* [ ] Highlighter: semi-transparent stroke, blends correctly.
* [ ] Eraser: removes strokes predictably (per-layer rules).
* [ ] Whiteout: opaque paint that hides underlying marks.
* [ ] Text: place/edit/move text annotations; font size; multi-line.
* [ ] Stamps: musical stamps (breath, fermata, etc.), scalable and rotatable (optional).

## 6.2 Annotation persistence model is unified

* [ ] Annotation persistence stores full `strokeData` (not stringified or flattened).
* [ ] Store types match API response shape.
* [ ] Loader data includes `strokeData` for all annotations and is serializable.

## 6.3 Layer permissions are enforced in UI and API

* [ ] UI disables selecting DIRECTOR layer unless user role is director/admin.
* [ ] API returns 403 for forbidden writes.
* [ ] SECTION writes enforce section policy (org setting or defined rule).

## 6.4 Annotation editing behaviors

* [ ] Undo/Redo per layer (PiaScore-level expectation).
* [ ] Clear page (per layer) with confirmation.
* [ ] Lasso select (optional but high value).
* [ ] Export annotations (optional): PDF export with marks baked-in.

## 6.5 Real-time annotation sync

* [ ] SECTION and DIRECTOR annotations appear for other users within ≤ 2 seconds (polling) or near-instant (socket).
* [ ] PERSONAL annotations never sync to others.

---

# 7) Navigation links / Smart Nav (rehearsal navigation)

## 7.1 Links work reliably

* [ ] Hotspots appear in view mode (directors can toggle visibility).
* [ ] Tap hotspot jumps to correct destination page.
* [ ] Links support:

  * [ ] same-piece jumps
  * [ ] optional cross-piece jumps (if enabled)

## 7.2 Full CRUD + correct endpoints

* [ ] Create, update, delete links are implemented and used correctly by UI.
* [ ] UI matches API response shapes (no `{link}` vs `{navigationLink}` mismatch).
* [ ] Delete uses `/api/stand/navigation-links/[id]` (not query param).

## 7.3 Director edit mode is fully wired

* [ ] UI has an explicit “Edit Nav Links” toggle.
* [ ] Edit mode shows draggable resizable hotspots.
* [ ] Edits persist and sync.

---

# 8) Audio links + playback (current feature set)

## 8.1 Audio links CRUD is complete

* [ ] GET list audio links per piece.
* [ ] POST create audio link (authorized roles).
* [ ] PUT update audio link (authorized roles).
* [ ] DELETE remove audio link (authorized roles).
* [ ] UI exists for directors/librarians to manage audio links (add/edit/delete).

## 8.2 Audio playback UX

* [ ] Audio player supports play/pause, seek, volume.
* [ ] Loop points work reliably.
* [ ] Audio links are scoped per piece (no cross-piece confusion).
* [ ] Playback state doesn’t reset unexpectedly on page turn.

---

# 9) NEW: Music playback with synced score (deep integration)

This is the “big new feature.” “Done” requires clear scope because it can mean different things. Here’s a complete DoD that includes a phased path.

## 9.1 Scope decision (must be explicitly chosen)

You must choose one baseline approach:

### Approach A — “Audio + time-aligned PDF highlighting (minimal viable sync)”

* Uses audio file(s) and a mapping (timestamps → page/measure/region)
* No MusicXML required at first

### Approach B — “MusicXML renderer + playback (true notation sync)”

* Requires MusicXML import and rendering (VexFlow / OpenSheetMusicDisplay)
* Playback via MIDI or synthesized audio
* Deepest integration, highest effort

**Definition of Done must include which approach is shipping now and which is roadmap.**

## 9.2 Minimal shippable “synced score” (recommended first milestone)

* [ ] A piece can have an optional “sync map” asset:

  * [ ] array of `{ tStartMs, tEndMs, pageNumber, rectNormalized }`
* [ ] When audio plays:

  * [ ] the stand highlights the current rect on the PDF page
  * [ ] auto-scroll/page-turn optional but configurable
* [ ] Sync map creation workflow exists (admin-only):

  * [ ] basic editor to set anchor points (e.g., click on page at time)
  * [ ] exports/updates mapping data stored in DB
* [ ] User can toggle “Follow playback” on/off
* [ ] Fallback works when sync map missing (audio plays without highlighting)

## 9.3 Full MusicXML route (true PiaScore competitor)

If you choose to ship MusicXML support:

* [ ] MusicXML can be uploaded/attached per piece/part
* [ ] The app renders notation in-browser (OSMD or VexFlow)
* [ ] Playback supports:

  * [ ] measure-level highlighting
  * [ ] tempo control
  * [ ] metronome click optionally
* [ ] Page turn follows playback (optional)
* [ ] Notation view can be switched back to PDF view
* [ ] Sync between PDF + MusicXML is defined (or you accept “either/or”)

## 9.4 Permissions & performance

* [ ] Only authorized roles can upload sync assets and edit maps.
* [ ] Sync playback works on mobile without stuttering (basic perf budget).
* [ ] All sync assets are loaded from same origin and authorized (no direct links).

---

# 10) NEW: Practice tracking logs (partially implemented target)

You mentioned practice tracking is “partially implemented.” “Done” means it’s actually usable.

## 10.1 Practice Log core model

* [ ] DB model exists for practice sessions:

  * `id, userId, pieceId (or assignmentId), eventId optional, startedAt, durationSeconds, notes, tags`
* [ ] Logs can be created:

  * [ ] manually (“Log practice” button)
  * [ ] optionally automatically when audio playback occurs (opt-in)

## 10.2 Practice log UI

* [ ] Stand has a “Practice” panel showing:

  * [ ] today’s minutes
  * [ ] last 7/30 day totals
  * [ ] per-piece totals
  * [ ] streaks (optional)
* [ ] “Start practice timer” and “Stop” in the stand
* [ ] Add notes/tags to a session

## 10.3 Reporting & admin visibility

* [ ] Admin (or section leader) can see aggregate practice:

  * [ ] by member
  * [ ] by section
  * [ ] by piece
* [ ] Privacy policy respected (org decides visibility):

  * [ ] “Private to member”
  * [ ] “Visible to directors”
  * [ ] “Visible to section leaders”
* [ ] Export CSV (optional but common request)

## 10.4 API + tests

* [ ] Practice log API routes exist (GET/POST/PUT/DELETE where needed).
* [ ] All routes enforce correct access.
* [ ] Tests cover creating logs, reading own logs, director aggregate access.

---

# 11) Real-time sync & rehearsal controls

## 11.1 Member presence roster is accurate

* [ ] Roster shows names and section reliably.
* [ ] Joining/leaving updates within ≤ 5 seconds (polling) or instantly (socket).
* [ ] No crash when name missing.

## 11.2 Director controls (optional but PiaScore-level rehearsal)

* [ ] Director can broadcast:

  * [ ] page changes
  * [ ] piece changes
  * [ ] mode toggles (night/gig)
* [ ] Members can opt-in/out of “Follow director”
* [ ] Following never overwrites PERSONAL state (e.g., tool selection)

---

# 12) Accessibility, quality, and production ops

## 12.1 Accessibility

* [ ] Keyboard navigation works (next/prev, tool selection).
* [ ] Canvas has accessible labeling.
* [ ] Reduced motion respected.
* [ ] Contrast meets basic WCAG for night mode.

## 12.2 Monitoring

* [ ] Error boundary is present for stand route.
* [ ] Errors are logged centrally (Sentry/console structured at minimum).
* [ ] Metrics capture:

  * [ ] stand opens
  * [ ] pdf load failures
  * [ ] annotation save failures
  * [ ] sync failures

## 12.3 Data integrity

* [ ] DB indices exist for frequently queried keys:

  * annotations by pieceId/page/layer/sectionId
  * navigationLinks by pieceId
  * audioLinks by pieceId
  * practiceLogs by userId/pieceId/date
* [ ] No migration mismatch between schema and runtime usage.

---

# 13) End-to-end QA scripts (what QA must be able to do)

## 13.1 Member flows

* [ ] Open stand from sidebar hub.
* [ ] Open stand from event.
* [ ] Select part and persist choice.
* [ ] Annotate PERSONAL; refresh; still there; no one else sees it.
* [ ] Annotate SECTION; other section members see it; other sections do not.
* [ ] View DIRECTOR marks; cannot edit them.
* [ ] Use pedal keys to turn pages.
* [ ] Start practice timer; stop; see it in practice history.

## 13.2 Director flows

* [ ] Build event program in admin; reorder.
* [ ] Open stand; edit SmartNav; verify members can jump.
* [ ] Add rehearsal audio; update link; delete link.
* [ ] Broadcast page changes; members following director move pages.
* [ ] View practice analytics (if policy allows).

## 13.3 Security flows

* [ ] Attempt to open stand by guessing eventId → notFound.
* [ ] Attempt to fetch stand PDF by guessing storageKey → 403/404.
* [ ] Attempt to fetch someone else’s PERSONAL annotations → returns none.
* [ ] Attempt SECTION write not in that section → 403.

---

# Your three new items mapped into “Done”

✅ **Music playback with synced score**
Done means: audio playback + a defined sync strategy (at least minimal mapping highlight) + admin tooling to author sync + permissions.

✅ **Markup/annotation tools**
Done means: toolset works reliably, persists correctly (strokeData), real-time works for shared layers, and permissions are correct.

✅ **Practice tracking logs**
Done means: create logs from stand, view your history, aggregate/visibility policy, admin reporting, and tests.

---

## Recommended milestone breakdown (so “done” isn’t a cliff)

If you want a sane delivery path:

### Milestone 1 — “Production usable stand”

UI entry points + program admin + security + PDF render + annotations + nav links + audio CRUD.

### Milestone 2 — “PiaScore-level”

Per-member parts, setlist manager, pedal mapping, offline caching, undo/redo, follow-director.

### Milestone 3 — “Synced playback + practice”

Synced score baseline (mapping highlight) + practice logs + reporting.

---