# Subagent Prompt Index

This index lists all subagent prompts in the order they must be executed. Each prompt is a separate file in this directory. The orchestrator will read this index to decide sequencing.

1. `subagent-01-schema-state-model.md` – Phase 1: Schema, State Model, and Canonical Types
2. `subagent-02-queue-topology.md` – Phase 2: Queue Topology and Worker Ownership
3. `subagent-03-metadata-normalization.md` – Phase 3: Metadata Normalization and Duplicate Safety
4. `subagent-04-ocr-text-extraction.md` – Phase 4: OCR, Text Extraction, Rendering, Segmentation, Splitting
5. `subagent-05-main-processing.md` – Phase 5: Main Processing Pipeline and Autonomous Workflow
6. `subagent-06-commit-storage-db.md` – Phase 6: Commit, Storage, and DB Persistence
7. `subagent-07-provider-matrix.md` – Phase 7: Provider Matrix and LLM Runtime Alignment
8. `subagent-08-admin-api.md` – Phase 8: Admin API Routes and Exception Workflow
9. `subagent-09-admin-ui.md` – Phase 9: Admin UI Alignment
10. `subagent-10-tests-ci.md` – Phase 10: Tests, Fixtures, CI, and Production Hardening

Additional support prompts:
- `validation-qa-prompts.md` – prompts for manual validation and QA checks.
- `final-orchestration-notes.md` – operational notes for orchestrator after completion.
