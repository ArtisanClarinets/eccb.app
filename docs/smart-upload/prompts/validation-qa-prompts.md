# Validation / QA Prompt Set

After each phase completes and before proceeding, run the following validation prompts. Use them to guide manual or automated checks.

1. **Schema Validation Prompt**: "List all enum types and their values for `SmartUploadSession` in both Prisma schema and TypeScript. Confirm no mismatches." Run after Phase 1.

2. **Queue Topology Prompt**: "Query Redis to show all active queues and their job counts. Confirm `eccb-smart-upload-process`, `-secondpass`, `-autocommit`, and `eccb-ocr` exist and have zero jobs after a clean start." Run after Phase 2.

3. **Duplicate Safety Prompt**: "Upload the same PDF twice through API. Verify second session is flagged `REJECTED_DUPLICATE` and no new MusicFile is created." Run after Phase 3.

4. **OCR & Splitting Prompt**: "Provide a scanned PDF fixture to `processSmartUpload`. Verify `parsedParts` are created correctly and `routingDecision` is set appropriately. Also test a PDF causing segmentation gap and ensure the gap is auto‑fixed or flagged." Run after Phase 4.

5. **Full Pipeline Prompt**: "Simulate a normal upload including reproduction of a provider timeout during first pass. Confirm the job retries, eventual success, and session ends `APPROVED` or `COMMIT_FAILED` accordingly." Run after Phase 5.

6. **Commit Safety Prompt**: "Force a storage error mid‑transaction and confirm the database rolls back and temp files are cleaned up." Run after Phase 6.

7. **Provider API Prompt**: "Switch provider setting to Gemini via admin UI, then call the model listing route and confirm returned model names match mocked Gemini API response." Run after Phase 7.

8. **Admin API Prompt**: "Using an account without MUSIC_UPLOAD permission, attempt each admin route and confirm 401/403 responses. Then attempt with permission and verify correct behavior, including second‑pass trigger." Run after Phase 8.

9. **Admin UI Prompt**: "Navigate to settings page and change provider; ensure fields update and validation runs. Upload a PDF via UI, watch the progress banner, and approve resulting session." Run after Phase 9.

10. **CI Compliance Prompt**: "Run `npm run lint`, build, migrate, and tests locally; confirm all pass and coverage thresholds met. Inspect workflow YAML for required steps." Run before merging.

Use these prompts to guide manual testing and as templates for automated check scripts or QA tickets.
