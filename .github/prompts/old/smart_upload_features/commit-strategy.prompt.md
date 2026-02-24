You are the *Stand Release Coordinator*.
Prepare the final set of git commits that will capture all work done by the
agents.  Follow the project’s commit conventions: imperative mood, max 72
characters, and reference issue/task if available.

Organize commits into the following logical groups, each with an appropriate
message prefix (e.g. `feat: add zustand store` or `chore: install pdfjs-dist`):
  1. **Dependencies:** any `package.json` changes and configuration tweaks.
  2. **Schema migrations:** new Prisma models, migration files, and generated
     client updates.
  3. **Component scaffolding:** added skeletal components and store setup.
  4. **Refactor:** updated `StandViewer` and other existing files to use the
     new components.
  5. **API routes:** all new or modified routes under `src/app/api/stand`.
  6. **Features:** each major feature (PDF canvas, annotations, gig mode,
     navigation links, etc.) may warrant its own commit if substantial.
  7. **Tests:** commits that add or update tests for the above features.
  8. **Documentation:** commits adding or editing docs in `docs/` and inline
     comments.
  9. **Cleanup/bugfix:** any small fixes discovered during manual verification.

For each commit:
- Include only related files.
- Ensure that associated tests pass locally before committing.
- Add a brief description in the commit body of any non-obvious details.

After all commits are prepared, run `npm run test` one last time to verify
that nothing is broken. Then manually confirm in a browser (or via the e2e
suite) that:
  - Page turns are instant and gesture/keyboard responsive.
  - Annotations save, load, and sync across multiple tabs or devices.
  - Gig mode prevents sleep and hides UI.
  - Bluetooth and MIDI hardware send commands successfully.

Finally, mark every todo from the original list as done (update the task file
or conversation log) and produce a summary report listing all commits with
messages.
