## Prompt Title

Phase 4 – OCR, Text Extraction, Rendering, Segmentation, Splitting

## Role

You are a domain expert in PDF processing and OCR with experience optimizing for scanned documents.

## Objective

Harden and extend the services that analyze PDFs: text extraction, OCR fallback, header labeling, part boundary detection, cutting instructions validation, and PDF splitting. Add missing failure handling, configurability, and comprehensive unit tests for edge cases.

## Context

Several components drive the core of Smart Upload's parsing pipeline. They currently work but have TODO notes in documentation and tests indicating missing coverage and bugs (e.g., header-crop bug, workerSrc glitch, segmentation edge-cases). These services must be bulletproof and deterministic to allow autonomous ingest. This phase must also add headers for scanned documents and support second pass splitting when initial segmentation is skipped.

## Verified Files to Review

- `src/lib/services/pdf-text-extractor.ts`
- `src/lib/services/ocr-fallback.ts`
- `src/lib/services/pdf-renderer.ts`
- `src/lib/services/part-boundary-detector.ts`
- `src/lib/services/cutting-instructions.ts` (not yet reviewed; search file)
- `src/lib/services/pdf-splitter.ts`
- `src/workers/smart-upload-processor.ts` and `smart-upload-worker.ts` for usage patterns
- Existing tests under `__tests__` for these services

## Files to Modify

- Add missing error logging, commentary, and defensive checks to each service (https://docs/smart-upload/TODO sections flagged modifications).
- Fix `pdf-renderer` workerSrc bug (remove any leftover `workerSrc` lines and ensure `disableWorker: true` everywhere).
- Add capability to specify `scale` and `maxWidth` via runtime config in rendering calls.
- Ensure `extractPdfPageHeaders` gracefully handles truncated or corrupt PDFs and returns stable shapes.
- Improve `part-boundary-detector` to handle ambiguous transitions, single-page blips, and overlapping ranges. Add diagnostic output.
- Update `cutting-instructions.ts` (if exists) to validate delivered instructions: enforce no gaps, no overlaps, proper one-index vs zero-index conversion, ability to auto‑repair small gaps by extending preceding/next ranges.
- Ensure `splitPdfByCuttingInstructions` covers case when splitting is triggered on second pass when `parseStatus !== 'PARSED'` (bug earlier noted in docs). Add logic to processor when splitting from second pass when first pass skipped.

## Files to Create

- New unit test files (e.g., `pdf-renderer.test.ts`, `part-boundary-detector.test.ts`, `cutting-instructions.test.ts`) under appropriate `__tests__` directories with extensive fixtures.
- Fixtures for various PDF edge cases: scanned images, encrypted PDF, blank pages, repeated headers, corrupted files. Place them under `src/app/api/files/smart-upload/__tests__/__fixtures__/` or new `src/lib/services/__tests__/fixtures/`.

## Technical Requirements

1. **Performance:** Batch rendering functions should reuse loaded PDF across pages and accept configurable options; implement caching if beneficial.
2. **OCR Integration:** `ocr-fallback.ts` should expose an API to run tesseract-like OCR only when needed and allow toggling via config. Add tests verifying that when `enableTesseractOcr=false`, images are not processed.
3. **Segmentation:** `detectPartBoundaries` must return `segmentationConfidence` and allow threshold tuning; when confidence < config.skipParseThreshold, pipeline must treat as `no_parse_second_pass` and still produce a 'full score' instruction.
4. **Cutting Instructions Validation:** Add `validateAndNormalizeInstructions()` utility to
   - convert one/zero index
   - clamp to [1,totalPages]
   - fill gaps by extending previous range if gap <=2 pages or raise an error otherwise
   - merge overlapping ranges and log warnings.
5. **Splitting Logic:** Guarantee that `splitPdfByCuttingInstructions()` returns empty array on zero instructions not crash; add tests for invalid ranges.
6. **Logging:** Services must log metrics only, not PDF content. Add comments about this requirement.

## Required Constraints

- Do not introduce image‑processing dependencies that break builds or require platform-specific builds beyond existing `canvas`/`sharp`.
- Keep the public APIs of services unchanged except for optional parameters and new validation functions.
- Do not degrade performance of the existing pipeline for happy‑path documents.

## Edge Cases to Handle

- Input PDFs that are encrypted, password-protected or truncated: functions should catch exceptions and return either default values or throw controlled errors that workers can catch and mark session `PARSE_FAILED`.
- Pages with rotated orientation – `pdf-text-extractor` may fail to extract header; log and continue.
- Images with watermarks interfering with OCR; treat them as low confidence and mark for second pass.
- Overlapping cutting instructions provided by LLM; normalization should detect and adjust rather than crash.
- Mixed text + image pages; header crop may produce blank; fallback to OCR.

## Required Verification

- **DoD Compliance:** Verify that your changes align with the overarching goals of a complete, enterprise-level autonomous system defined in `docs/smart-upload/smart-upload.DoD.md` and `smart-upload.DoD.acceptance-criteria.md`.
- **Zero Warnings/Errors:** You must run all tests, linting (`npm run lint`), typechecking (`npx tsc --noEmit` or `npm run build`), and Next.js build. Do not complete this phase until **ALL** warnings and errors generated by any of these tools have been completely resolved.

- Add unit tests covering at least 30 edge cases across services including those listed in Section 9 of orchestrator instructions.
- Run coverage report and ensure >90% in the modified service modules.
- Simulate worker processing an example scanned PDF through sample pipeline and confirm segmentation and splitting produce expected `cuttingInstructions` and `parsedParts` entries.
- Lint and typecheck after modifications.

## Expected Deliverables

- Hardened service modules with improved validation and configuration.
- Additional utility functions for instructions validation.
- Comprehensive fixture PDFs and corresponding tests.
- Documentation comments referencing earlier bug fixes (e.g. second-pass re-split logic).

## Stop Conditions

Stop if:
- Required third-party libraries for OCR or PDF processing conflict with the existing project or cannot be bootstrapped.
- A service change would require rewriting large portions of the smart-upload processors; escalate to orchestrator to split into further phases.
