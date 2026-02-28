# One-Shot Coding Agent Prompt — Smart Upload: Close All Remaining DoD Gaps

**Target model:** Claude Opus 4.6  
**Repository:** ArtisanClarinets/eccb.app (branch: main)  
**Prepared:** 2026-02-27

---

## Context

You are working in the ECCB (Emerald Coast Community Band) platform — a Next.js 16 / React 19 / MariaDB-MySQL / Prisma / BullMQ / Redis application. The **Smart Upload** subsystem autonomously ingests music PDFs: it extracts metadata with a vision LLM, detects part boundaries, splits the PDF, normalises instrument names, and commits records to the music library. The system was extensively implemented across many sessions. All tests currently pass (101 test files, 1599 tests, 0 failures).

**Critical constraint:** Every change you make must leave the codebase with **0 TypeScript errors** (`npx tsc --noEmit`), **0 ESLint errors/warnings** (`npm run lint`), and **all tests passing** (`npm run test`). Run these checks after every meaningful batch of changes and fix problems before moving on.

---

## Remaining DoD Gaps — What You Must Implement

The following items are **not yet done** and must be completed. Each includes the file(s) to touch and precise instruction.

---

### GAP 1 — Temp artifact cleanup on worker failure (DoD §2.3)

**Problem:** `cleanupSmartUploadTempFiles(sessionId)` is called in the reject route but **not** called when the BullMQ worker itself fails (throws an unhandled error or exhausts retries).

**Files:**
- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`

**Instructions:**
1. In `smart-upload-processor.ts`, locate the outermost `try/catch` that wraps the entire job handler. In the `catch` block, after updating the session to `parseStatus: 'FAILED'`, add a best-effort call:
   ```ts
   try {
     await cleanupSmartUploadTempFiles(data.sessionId);
   } catch (cleanupErr) {
     logger.warn('Cleanup after worker failure failed', { sessionId: data.sessionId, error: cleanupErr });
   }
   ```
   Import `cleanupSmartUploadTempFiles` from `@/lib/services/smart-upload-cleanup`.

2. Apply the same pattern in `smart-upload-worker.ts` in the catch block for the second-pass handler and the auto-commit handler.

3. Ensure no new TypeScript errors are introduced.

---

### GAP 2 — Dead Letter Queue configuration (DoD §7)

**Problem:** BullMQ jobs that exhaust all retries are removed from the queue with no permanent record.

**Files:**
- `src/lib/jobs/smart-upload.ts`
- `src/lib/jobs/queue.ts` (or wherever queue creation options live)

**Instructions:**
1. Locate where the `SMART_UPLOAD` queue is created (look for `new Queue(...)` or equivalent factory).
2. Add `removeOnFail: false` to the **default job options** so exhausted jobs remain in the failed set and can be inspected via BullMQ's failed job APIs.
3. Add a comment explaining this is the DLQ mechanism.
4. If there is a `getFailedJobs()` endpoint or a UI component for the queue, confirm it can query failed jobs.

---

### GAP 3 — LLM error logs must include provider, model ID, and endpoint (DoD §8.1)

**Problem:** `src/lib/llm/index.ts` logs retry/failure attempt count and HTTP status but the structured log fields do not always include the provider name, model ID, and endpoint URL.

**File:** `src/lib/llm/index.ts`

**Instructions:**
1. Find the retry loop (`for (let attempt = 1; attempt <= MAX_RETRIES; attempt++)`).
2. Ensure every `logger.warn` and `logger.error` call in that loop includes:
   ```ts
   {
     provider: config.provider,   // or adapter.provider if that's how it's structured
     model: config.model,
     endpoint: config.endpoint,
     attempt,
     status: response?.status,
     error: ...,
   }
   ```
3. Do not change the function signatures or return types.

---

### GAP 4 — Store per-page header labels in session JSON (DoD §8.2)

**Problem:** During segmentation, per-page header text / LLM labels are extracted and used in-process but never persisted to the session. The Review UI cannot show which label was assigned to each page.

**File:** `src/workers/smart-upload-processor.ts`

**Instructions:**
1. After the deterministic segmentation block (where `pageHeaderResult.pageHeaders` is available) or after the header-crop vision labeling block (where `parsedHeaderLabels` is available), collect the per-page labels into a plain object:
   ```ts
   const pageLabels: Record<number, string> = {};
   pageHeaders.forEach(h => { pageLabels[h.pageNumber] = h.headerText; });
   ```
2. When writing the final `prisma.smartUploadSession.update(...)` at the end of the processor, merge `pageLabels` into the `extractedMetadata` JSON:
   ```ts
   extractedMetadata: {
     ...(existingExtractedMetadata ?? {}),
     pageLabels,
     segmentationConfidence: deterministicConfidence ?? visionConfidence,
   }
   ```
3. Do so for both the text-layer path and the header-crop vision path.
4. Export or document the `pageLabels` structure in `src/types/smart-upload.ts` by adding it to the `ExtractedMetadata` interface as `pageLabels?: Record<number, string>`.

---

### GAP 5 — PDF render cache between passes (DoD §9)

**Problem:** `src/lib/services/pdf-renderer.ts` re-renders every page from byte zero on every call. When the second-pass and adjudicator are invoked, all pages are decoded and rasterised again — wasting CPU and memory.

**Files:**
- `src/lib/services/pdf-renderer.ts`
- `src/workers/smart-upload-processor.ts`
- `src/workers/smart-upload-worker.ts`

**Instructions:**
1. In `pdf-renderer.ts`, add a simple in-process `Map<string, Buffer>` keyed by `${storageKey}:${pageIndex}:${quality}:${scale}` to cache rendered page images within a single Node.js process lifetime.
   ```ts
   const renderCache = new Map<string, Buffer>();
   ```
2. In the batch render functions (`renderPdfPageBatch`, `renderPdfHeaderCropBatch`), check the cache before rendering and populate it after:
   ```ts
   const cacheKey = `${sourceKey}:${pageIdx}:${opts.quality ?? 80}:${opts.scale ?? 2}`;
   if (renderCache.has(cacheKey)) return renderCache.get(cacheKey)!;
   // ...render...
   renderCache.set(cacheKey, rendered);
   ```
3. Add a `clearRenderCache(storageKey?: string)` export that clears entries for a specific key (or all) — called at end of a job to prevent unbounded memory growth.
4. Call `clearRenderCache(storageKey)` in the processor's `finally` block after the job completes.
5. Do not break existing function signatures.

---

### GAP 6 — Storage key cross-user isolation test (DoD §10)

**Problem:** Storage key scoping is implemented but no automated test verifies that a signed URL for user A's upload cannot be generated for user B's session ID.

**File (new):** `src/lib/services/__tests__/storage-isolation.test.ts`

**Instructions:**
Create a new Vitest test file that:
1. Mocks `@/lib/db` and `@/lib/services/storage`.
2. Verifies that `getSignedDownloadUrl` is only called with storage keys that belong to the requesting session/user — e.g., test that a function that generates download URLs for a session will reject/throw if the session's `uploadedBy` does not match the requesting user.
3. Verifies that storage keys always begin with the expected prefix (`smart-upload/`).
4. Mock the session lookup to return a session owned by `userA` and attempting to access it as `userB` should result in a 403 or thrown error (depends on which service/route you're testing — pick the preview route `src/app/api/admin/uploads/review/[id]/preview/route.ts`).

---

### GAP 7 — Part-naming unit tests (DoD §11.1)

**Problem:** `src/lib/smart-upload/part-naming.ts` has no test file. Four exported functions have zero coverage.

**File (new):** `src/lib/smart-upload/__tests__/part-naming.test.ts`

**Instructions:**
Create a comprehensive Vitest test file covering:

1. **`normalizeInstrumentLabel`**:
   - `"Clarinet 1"` → `{ instrument: "1st Bb Clarinet", chair: "1st", transposition: "Bb", section: "Woodwinds" }`
   - `"Clarinet I"` → chair `"1st"`, instrument `"1st Bb Clarinet"`
   - `"Clarinet II"` → chair `"2nd"`, instrument `"2nd Bb Clarinet"`
   - `"Alto Saxophone"` → `{ instrument: "Alto Saxophone", chair: null, transposition: "Eb", section: "Woodwinds" }`
   - `"1st Trumpet"` → `{ instrument: "1st Trumpet", chair: "1st", transposition: "Bb", section: "Brass" }`
   - `"Bass Trombone"` → `{ section: "Brass", transposition: "C" }`
   - `"Snare Drum"` → `{ section: "Percussion" }`
   - `"Conductor Score"` → `{ partType: "CONDUCTOR_SCORE" }`
   - `"Full Score"` → `{ partType: "FULL_SCORE" }`
   - `""` (empty string) → `{ instrument: "Unknown" }`
   - Unknown garbage string → fallback `{ section: "Other" }`

2. **`buildPartDisplayName`**:
   - `("American Patrol", { instrument: "1st Bb Clarinet", chair: "1st", transposition: "Bb", section: "Woodwinds" })` → `"American Patrol 1st Bb Clarinet"`
   - With `arranger`: `"American Patrol arr. Smith 1st Bb Clarinet"`
   - With no chair: `"Stars and Stripes Tuba"`

3. **`buildPartFilename`**:
   - `"American Patrol 1st Bb Clarinet"` → `"American_Patrol_1st_Bb_Clarinet.pdf"`
   - Strips special chars: `"O'Brien / March"` → safe filename

4. **`buildPartStorageSlug`**:
   - Returns a lowercase, hyphenated slug without extension
   - `"American Patrol 1st Bb Clarinet"` → `"american-patrol-1st-bb-clarinet"`

Aim for ≥ 20 test cases total.

---

### GAP 8 — Secret masking unit tests (DoD §11.1)

**Problem:** The `mergeSecretSettings` / mask logic inside `src/app/api/admin/uploads/settings/route.ts` is exercised only through the HTTP layer; no isolated unit test exercises the merge and mask functions.

**Instructions:**
1. Extract the secret-masking logic from `settings/route.ts` into a small helper module `src/lib/smart-upload/secret-settings.ts` with exported functions:
   - `maskSecretValue(value: string | null | undefined): string` — returns `"__SET__"` if non-empty, `""` otherwise
   - `mergeSecretUpdate(current: string | null | undefined, incoming: string): string | null` — if `incoming` is `"__SET__"` or empty-ish sentinel, return `current`; otherwise return `incoming`
2. Update `settings/route.ts` to import and use those functions instead of inlining the logic.
3. Create `src/lib/smart-upload/__tests__/secret-settings.test.ts` with ≥ 12 test cases:
   - `maskSecretValue("abc123")` → `"__SET__"`
   - `maskSecretValue("")` → `""`
   - `maskSecretValue(null)` → `""`
   - `mergeSecretUpdate("existing", "__SET__")` → `"existing"` (no overwrite)
   - `mergeSecretUpdate("existing", "newkey")` → `"newkey"` (update)
   - `mergeSecretUpdate(null, "__SET__")` → `null` (no phantom write)
   - `mergeSecretUpdate(null, "newkey")` → `"newkey"` (first write)
   - `mergeSecretUpdate("existing", "")` → `"existing"` (blank = keep)
   - `mergeSecretUpdate("existing", "__CLEAR__")` → `null` (explicit clear)

---

### GAP 9 — Worker end-to-end integration test with fixture PDF (DoD §11.3)

**Problem:** No test exercises `smart-upload-processor.ts` with a real minimal PDF buffer and a mocked LLM, verifying the full pipeline (render → LLM → parse → validate → split → DB write).

**File (new):** `src/workers/__tests__/smart-upload-processor.test.ts`

**Instructions:**
1. Create a minimal valid PDF buffer fixture (use `%PDF-1.4` 3-page stub that pdf-lib and pdfjs-dist can parse without crashing — see how `src/app/api/files/smart-upload/__tests__/mocks.ts` creates test PDFs).
2. Mock all external dependencies:
   - `@/lib/db` (prisma)
   - `@/lib/services/storage` (uploadFile, downloadFile, getSignedDownloadUrl)
   - `@/lib/llm` (callVisionModel → returns deterministic fixture extraction JSON)
   - `@/lib/llm/config-loader` (loadSmartUploadRuntimeConfig)
   - `@/lib/services/pdf-renderer`
   - BullMQ Job object (`{ id, data, updateProgress }`)
3. The mock `callVisionModel` returns a realistic extraction JSON:
   ```json
   {
     "title": "American Patrol",
     "composer": "F.W. Meacham",
     "arranger": null,
     "parts": [
       { "label": "Piccolo / Flute", "startPage": 1, "endPage": 1 },
       { "label": "1st Bb Clarinet", "startPage": 2, "endPage": 2 },
       { "label": "Tuba",            "startPage": 3, "endPage": 3 }
     ],
     "confidenceScore": 92
   }
   ```
4. Import and call the **processor function** (not the worker entry point) directly with a mocked job.
5. Assert:
   - `prisma.smartUploadSession.update` was called with `parseStatus: 'COMPLETE'`
   - `prisma.smartUploadSession.update` was called with a `parsedParts` array of length 3
   - `uploadFile` was called 3 times (one per split part)
   - `queueSmartUploadAutoCommit` OR `queueSmartUploadSecondPass` was called (depending on confidence)
6. Add a second test case where `callVisionModel` returns low confidence (40) and assert that `requiresHumanReview` is set to `true` and the session is routed to review.

---

### GAP 10 — Second-pass integration test (DoD §11.3)

**Problem:** No test exercises the second-pass handler with an initially ambiguous first-pass result to verify that it updates `parsedParts`, `confidenceScore`, and `secondPassStatus`.

**File:** Add tests to the file created in GAP 9, OR create `src/workers/__tests__/smart-upload-second-pass.test.ts`.

**Instructions:**
1. Mock the same set of dependencies as GAP 9.
2. Set up a session where `confidenceScore` is 55 and `parsedParts` has overlapping page ranges.
3. Mock the second-pass LLM response to return corrected, non-overlapping parts with confidence 88.
4. Call the second-pass handler directly.
5. Assert:
   - `prisma.smartUploadSession.update` was called with `secondPassStatus: 'COMPLETE'`
   - The updated `parsedParts` have non-overlapping ranges
   - `secondPassRaw` is stored
   - If new confidence ≥ threshold, `queueSmartUploadAutoCommit` is called

---

## Implementation Order

Work in this order to minimise regressions:

1. **GAP 8** (extract secret-settings module + tests) — pure refactor, safest first
2. **GAP 7** (part-naming tests) — pure test addition, no code change
3. **GAP 3** (LLM error logging) — small targeted change
4. **GAP 4** (store pageLabels in session) — additive DB write
5. **GAP 1** (cleanup on worker failure) — defensive addition to catch blocks
6. **GAP 2** (DLQ config) — queue options change
7. **GAP 5** (render cache) — performance enhancement, most invasive
8. **GAP 6** (storage isolation test) — pure test addition
9. **GAP 9** (worker e2e test) — most complex test to write
10. **GAP 10** (second-pass test) — builds on GAP 9 infrastructure

---

## Verification Protocol

After each GAP is completed:
```bash
npx tsc --noEmit           # must output nothing
npm run lint               # must output nothing
npx vitest run             # must show 0 failures
```

After all GAPs are complete:
```bash
npm run build              # must succeed with 0 errors
```

Report the final vitest summary line (e.g. `Tests 1720 passed | 0 failed`).

---

## Files You Are Permitted To Create

| Path | Purpose |
|------|---------|
| `src/lib/smart-upload/__tests__/part-naming.test.ts` | GAP 7 |
| `src/lib/smart-upload/__tests__/secret-settings.test.ts` | GAP 8 |
| `src/lib/smart-upload/secret-settings.ts` | GAP 8 helper module |
| `src/workers/__tests__/smart-upload-processor.test.ts` | GAP 9 |
| `src/workers/__tests__/smart-upload-second-pass.test.ts` | GAP 10 |
| `src/lib/services/__tests__/storage-isolation.test.ts` | GAP 6 |

---

## Files You Are Permitted To Modify

| Path | For |
|------|-----|
| `src/workers/smart-upload-processor.ts` | GAPs 1, 4, 5 |
| `src/workers/smart-upload-worker.ts` | GAPs 1, 5 |
| `src/lib/jobs/smart-upload.ts` | GAP 2 |
| `src/lib/jobs/queue.ts` | GAP 2 |
| `src/lib/llm/index.ts` | GAP 3 |
| `src/lib/services/pdf-renderer.ts` | GAP 5 |
| `src/app/api/admin/uploads/settings/route.ts` | GAP 8 refactor |
| `src/types/smart-upload.ts` | GAP 4 type extension |

**Do not modify any other files unless strictly necessary to fix a TypeScript/lint error introduced by your changes.**

---

## Definition of Done for This Prompt

This prompt is **done** when:

1. All 10 GAPs above are implemented.
2. `npx tsc --noEmit` outputs nothing.
3. `npm run lint` outputs nothing.
4. `npx vitest run` shows 0 failures and the total test count is ≥ 1640 (current baseline: 1599).
5. `npm run build` succeeds.
6. The updated `docs/smart-upload/smart-upload.DoD.md` has every previously-unchecked item now marked `[x]` (except §3.1, §3.2, §9 processing time targets, and §12 manual smoke tests which require a real environment).
