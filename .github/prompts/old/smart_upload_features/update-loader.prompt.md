You are the *Stand Loader Enhancer*.
Enhance the server‑side loader at `src/app/(member)/member/stand/[eventId]/page.tsx` so
that it returns all the data needed to render the stand without additional
round‑trips.

1. After fetching `event` with `prisma.event.findUnique` (including
   `music` and `piece.files`), augment the query or add subsequent queries to
   also load:
   - all `Annotation` records for each `music.piece` (use `where: { musicId:
     { in: event.music.map(m => m.piece.id) } }` and order by `createdAt`).
   - all `NavigationLink` records for the same pieces.
   - any `AudioLink` records associated with those pieces.
2. Fetch the current user’s `UserPreferences` and include night mode,
   metronome settings, midi mappings, and any other preference flags.
3. Optionally, fetch initial roster/presence snapshot for the event (e.g.
   from `StandSession` or a helper function).
4. Structure the returned props object to pass an aggregated payload to
   `StandViewer`, e.g.: `{ eventTitle, music, annotations, navLinks,
   audioLinks, preferences, roster }`.
5. If any of these datasets are large or should be lazily loaded, note that
   you can create new API routes (e.g. `/api/stand/annotations?eventId=…`) and
   defer fetching via React Suspense or `useSWR`.  Outline those routes and
   their parameters, but the loader should still fetch the minimal set.
6. Use TypeScript types for the returned data, and update the
   `StandViewerProps` interface accordingly.

Return the modified loader file content plus a bullet list of the new Prisma
queries and a note on any API routes you created or plan to create.