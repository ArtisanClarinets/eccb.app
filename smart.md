Goal
Perform a thorough read-only audit of /home/dylan/eccb.app for overall completion/readiness, covering routes (public/member/admin), actions, services, auth/permissions, security (rate-limit/CSRF), deployment docs, and tests; then produce:
1) feature coverage map (implemented/partial/missing),  
2) enterprise deployment-readiness gaps,  
3) placeholders/coming-soon/legacy duplication/risky inconsistencies,  
4) prioritized granular TODO list with file paths + acceptance criteria.
Instructions
- User explicitly required: do not edit files.
- Audit must be recursive, conservative, and evidence-based.
- Focus areas requested: app routes (public/member/admin), actions, services, auth/permissions, settings, security/rate-limit/csrf, deployment docs, and tests.
- Deliverable format is the 4-section audit output listed above.
Discoveries
- The repo is a Next.js app with broad route/API surface and substantial test presence, including smart upload + digital stand modules.
- Route inventory captured for:
  - Public pages (src/app/(public)/**)
  - Member pages (src/app/(member)/**)
  - Admin pages (src/app/(admin)/**)
  - API routes (src/app/api/**)
- Actions/services/auth/security files were identified and inspected (guards, permissions, CSRF, rate limit, setup endpoints, storage/services).
- A number of partial/missing UX implementations were confirmed (e.g. explicit “coming soon” and “will be implemented here” pages).
- Multiple legacy/duplication/inconsistency signals were observed:
  - Duplicate admin layout trees (src/app/(admin)/layout.tsx and src/app/(admin)/admin/layout.tsx) with different permission patterns/import sources.
  - Permission naming appears inconsistent across code (dot style constants vs many colon and mixed strings).
  - Documentation states production-ready/completed, but code still contains placeholders and partially implemented subsystems.
  - Setup/repair endpoints and other sensitive routes show mixed authorization patterns.
  - Security implementation exists (CSP/headers/rate-limit/CSRF), but coverage and consistency appear uneven across all mutating endpoints.
- Deployment/config drift signals found:
  - env.example exists (not .env.example), while docs often reference .env.example.
  - Mixed database assumptions across docs/scripts/workflows (MariaDB/MariaDB/MySQL references).
  - CI/build configs and local docs don’t always align.
- Test landscape:
  - Many Vitest tests under src/**/__tests__ and src/**/*.test.*.
  - Gaps for some high-risk API areas (not all critical routes have direct tests).
  - CI workflow exists in .github/workflows/test.yml.
Accomplished
- Completed a large read-only reconnaissance and deep inspection pass across:
  - app routes (public/member/admin),
  - API routes,
  - auth/permissions/guards,
  - rate limiting + CSRF,
  - setup/repair + monitoring + jobs APIs,
  - storage/virus scanning/cleanup services,
  - deployment + security documentation,
  - CI/test configuration.
- Confirmed key evidence points for:
  - implemented areas,
  - partial/placeholder areas,
  - inconsistencies and likely readiness risks.
- No file modifications were made.
- In progress / left to do: assemble the final audit response in the requested 4-part format with prioritized TODOs and concrete acceptance criteria per item/path.
Relevant files / directories
- Core app surfaces  
  - src/app/  
  - src/app/(public)/  
  - src/app/(member)/  
  - src/app/(admin)/  
  - src/app/api/
- Representative route files inspected  
  - src/app/(public)/page.tsx  
  - src/app/(public)/directors/page.tsx  
  - src/app/(public)/gallery/page.tsx  
  - src/app/(public)/sponsors/page.tsx  
  - src/app/(public)/contact/page.tsx  
  - src/app/(public)/[...slug]/page.tsx  
  - src/app/(member)/member/page.tsx  
  - src/app/(member)/music/upload/page.tsx  
  - src/app/(admin)/members/page.tsx  
  - src/app/(admin)/layout.tsx  
  - src/app/(admin)/admin/layout.tsx  
  - src/app/(admin)/admin/page.tsx  
  - src/app/setup/page.tsx
- Auth, permissions, security  
  - src/proxy.ts  
  - src/lib/auth/config.ts  
  - src/lib/auth/permissions.ts  
  - src/lib/auth/guards.ts  
  - src/lib/auth/permission-constants.ts  
  - src/lib/csrf.ts  
  - src/lib/rate-limit.ts  
  - src/lib/env.ts  
  - src/hooks/use-permissions.ts  
  - src/app/api/me/permissions/route.ts
- High-risk/critical API routes inspected  
  - src/app/api/auth/[...all]/route.ts  
  - src/app/api/files/upload/route.ts  
  - src/app/api/files/[...key]/route.ts  
  - src/app/api/files/download/[...key]/route.ts  
  - src/app/api/files/download-url/route.ts  
  - src/app/api/members/route.ts  
  - src/app/api/admin/users/ban/route.ts  
  - src/app/api/admin/users/impersonate/route.ts  
  - src/app/api/admin/jobs/route.ts  
  - src/app/api/admin/monitoring/route.ts  
  - src/app/api/admin/audit/export/route.ts  
  - src/app/api/admin/uploads/providers/discover/route.ts  
  - src/app/api/setup/route.ts  
  - src/app/api/setup/repair/route.ts  
  - src/app/api/setup/status/route.ts  
  - src/app/api/health/route.ts  
  - src/app/api/email/test/route.ts  
  - src/app/api/stand/annotations/route.ts  
  - src/app/api/stand/setlists/route.ts  
  - src/app/api/stand/roster/route.ts  
  - src/app/api/stand/preferences/route.ts  
  - src/app/api/stand/practice-logs/route.ts
- Services / workers / setup internals  
  - src/lib/services/storage.ts  
  - src/lib/services/virus-scanner.ts  
  - src/lib/services/storage-cleanup.ts  
  - src/lib/websocket/stand-socket.ts  
  - src/lib/feature-flags.ts  
  - src/lib/setup/setup-guard.ts  
  - src/lib/setup/schema-automation.ts  
  - src/workers/
- Admin actions and domain actions inspected  
  - src/app/(admin)/admin/*/actions.ts (multiple domains)  
  - src/app/(member)/member/profile/actions.ts  
  - src/app/(public)/contact/actions.ts  
  - src/app/(admin)/admin/audit/actions.ts  
  - src/app/(admin)/admin/settings/actions.ts
- Testing and CI  
  - vitest.config.ts  
  - src/**/*.test.ts / src/**/*.test.tsx (broadly surveyed via glob)  
  - src/app/api/files/smart-upload/__tests__/e2e.test.ts  
  - src/app/api/stand/**/__tests__/route.test.ts  
  - .github/workflows/test.yml
- Deployment, ops, and documentation  
  - README.md  
  - DEPLOYMENT.md  
  - LOCAL_SETUP.md  
  - docs/SECURITY.md  
  - PERMISSIONS.md  
  - COMPLETION_CHECKLIST.md  
  - TRACKING_PRODUCTION_READY.md  
  - scripts/check-routes.ts  
  - scripts/deploy.sh  
  - scripts/deploy-setup.sh  
  - scripts/start.ts  
  - docker-compose.yml  
  - env.example  
  - prisma/seed.ts
▣  Compaction · gpt-5.3-codex · 34.4s
Thinking: Delivering final audit with TODOs
Absolutely — I’m confident on next steps, so here is the completed audit in the 4-part format.
1) Feature Coverage Map
- Implemented
  - Public/member/admin route scaffolding and broad API surface are present across /home/dylan/eccb.app/src/app/(public), /home/dylan/eccb.app/src/app/(member), /home/dylan/eccb.app/src/app/(admin), and /home/dylan/eccb.app/src/app/api.
  - Auth, permissions, and guard infrastructure exists in /home/dylan/eccb.app/src/lib/auth/config.ts, /home/dylan/eccb.app/src/lib/auth/permissions.ts, /home/dylan/eccb.app/src/lib/auth/guards.ts, and /home/dylan/eccb.app/src/hooks/use-permissions.ts.
  - Core security primitives exist: CSRF in /home/dylan/eccb.app/src/lib/csrf.ts, rate limiting in /home/dylan/eccb.app/src/lib/rate-limit.ts, and proxy/header policy in /home/dylan/eccb.app/src/proxy.ts.
  - Storage/operations services exist in /home/dylan/eccb.app/src/lib/services/storage.ts, /home/dylan/eccb.app/src/lib/services/virus-scanner.ts, /home/dylan/eccb.app/src/lib/services/storage-cleanup.ts.
  - Test framework and CI are wired via /home/dylan/eccb.app/vitest.config.ts and /home/dylan/eccb.app/.github/workflows/test.yml, with substantial route/service tests.
- Partial
  - Several routes/pages still show placeholder/coming-soon behavior (notably in parts of public/member/admin surfaces), including paths under /home/dylan/eccb.app/src/app/(public) and /home/dylan/eccb.app/src/app/(member)/music/upload/page.tsx.
  - Admin architecture is split/duplicated between /home/dylan/eccb.app/src/app/(admin)/layout.tsx and /home/dylan/eccb.app/src/app/(admin)/admin/layout.tsx, creating inconsistent protection/composition patterns.
  - Permission model usage appears inconsistent across constants/strings in /home/dylan/eccb.app/src/lib/auth/permissions.ts and /home/dylan/eccb.app/src/lib/auth/permission-constants.ts.
  - Security controls exist but are not consistently enforced across all mutating endpoints in /home/dylan/eccb.app/src/app/api/**/route.ts.
  - Deployment docs/scripts are extensive but not fully aligned (env/db assumptions drift) across /home/dylan/eccb.app/README.md, /home/dylan/eccb.app/DEPLOYMENT.md, /home/dylan/eccb.app/LOCAL_SETUP.md, and /home/dylan/eccb.app/env.example.
- Missing (for enterprise-grade readiness)
  - Single authoritative route protection matrix (who can access which page/API, and how enforced).
  - Uniform policy middleware for all write endpoints (CSRF + rate-limit + authz at one standard boundary).
  - Complete end-to-end tests for highest-risk admin/setup/file-mutation flows.
  - Clean deprecation/removal plan for legacy/duplicate admin structure.
2) Enterprise Deployment-Readiness Gaps
- Security consistency gap: endpoint-by-endpoint variation in authz/CSRF/rate-limit checks increases bypass risk (/home/dylan/eccb.app/src/app/api).
- Authorization model gap: mixed permission naming conventions raise policy drift/false denies/false allows (/home/dylan/eccb.app/src/lib/auth/permissions.ts, /home/dylan/eccb.app/src/lib/auth/permission-constants.ts).
- Architecture gap: duplicated admin layout trees complicate verification, maintenance, and incident response (/home/dylan/eccb.app/src/app/(admin)/layout.tsx, /home/dylan/eccb.app/src/app/(admin)/admin/layout.tsx).
- Setup/repair hardening gap: setup-related endpoints/pages require stricter production-state controls and auditability (/home/dylan/eccb.app/src/app/api/setup/route.ts, /home/dylan/eccb.app/src/app/api/setup/repair/route.ts, /home/dylan/eccb.app/src/app/setup/page.tsx).
- Ops/documentation drift gap: env naming and database assumptions are not fully canonicalized (/home/dylan/eccb.app/env.example, /home/dylan/eccb.app/DEPLOYMENT.md, /home/dylan/eccb.app/LOCAL_SETUP.md).
- Test coverage gap: strong unit coverage exists, but critical integrated scenarios need fuller e2e regression guarantees for production confidence.
3) Placeholders, Legacy Duplication, Risky Inconsistencies
- Placeholder/coming-soon indicators remain in user-facing and member/admin flows (evidence in inspected route pages under /home/dylan/eccb.app/src/app/(public) and /home/dylan/eccb.app/src/app/(member)).
- Legacy/duplication:
  - Dual admin layout structure likely overlaps responsibilities:
    - /home/dylan/eccb.app/src/app/(admin)/layout.tsx
    - /home/dylan/eccb.app/src/app/(admin)/admin/layout.tsx
- Risky inconsistencies:
  - Permission key format and source inconsistency (dot, colon, mixed literals) across auth and route checks.
  - Documentation “production-ready/completed” language does not fully match runtime placeholder status and mixed enforcement behavior (/home/dylan/eccb.app/COMPLETION_CHECKLIST.md, /home/dylan/eccb.app/TRACKING_PRODUCTION_READY.md vs code reality).
  - Environment/config naming mismatch (env.example vs expected .env.example conventions in docs/tooling).
4) Prioritized Granular TODO List (with acceptance criteria)
- P0 — Normalize authorization vocabulary and enforcement
  - Files: /home/dylan/eccb.app/src/lib/auth/permissions.ts, /home/dylan/eccb.app/src/lib/auth/permission-constants.ts, /home/dylan/eccb.app/src/lib/auth/guards.ts, /home/dylan/eccb.app/src/app/api/**/route.ts
  - Acceptance criteria: one canonical permission key scheme; zero ad-hoc permission literals in API/page guards; automated test proves deny/allow matrix for representative admin/member/public actions.
- P0 — Enforce consistent write-endpoint security policy
  - Files: /home/dylan/eccb.app/src/lib/csrf.ts, /home/dylan/eccb.app/src/lib/rate-limit.ts, /home/dylan/eccb.app/src/proxy.ts, /home/dylan/eccb.app/src/app/api/**/route.ts
  - Acceptance criteria: all mutating routes documented and verified to apply authn/authz + CSRF + rate limiting; exceptions explicitly documented and tested.
- P0 — Harden setup/repair surfaces for production safety
  - Files: /home/dylan/eccb.app/src/app/api/setup/route.ts, /home/dylan/eccb.app/src/app/api/setup/repair/route.ts, /home/dylan/eccb.app/src/app/api/setup/status/route.ts, /home/dylan/eccb.app/src/lib/setup/setup-guard.ts
  - Acceptance criteria: setup endpoints locked behind explicit environment/state guards and privileged auth; audit logs for every setup/repair invocation; integration tests cover allowed/denied states.
- P1 — Consolidate duplicated admin layout/protection architecture
  - Files: /home/dylan/eccb.app/src/app/(admin)/layout.tsx, /home/dylan/eccb.app/src/app/(admin)/admin/layout.tsx, dependent admin routes under /home/dylan/eccb.app/src/app/(admin)/admin
  - Acceptance criteria: a single authoritative admin shell/guard path; no duplicated permission gate logic; route tests confirm unchanged user-facing behavior.
- P1 — Remove or finish placeholder user journeys
  - Files: placeholder-bearing pages in /home/dylan/eccb.app/src/app/(public)/**/page.tsx and /home/dylan/eccb.app/src/app/(member)/**/page.tsx (including /home/dylan/eccb.app/src/app/(member)/music/upload/page.tsx)
  - Acceptance criteria: no “coming soon / will be implemented here” strings in production routes unless feature-flagged with explicit fallback UX and tracking ticket reference.
- P1 — Build route-to-policy coverage map and gate in CI
  - Files: /home/dylan/eccb.app/scripts/check-routes.ts, /home/dylan/eccb.app/.github/workflows/test.yml, policy source files in /home/dylan/eccb.app/src/lib/auth
  - Acceptance criteria: generated artifact maps each page/API to required role/permission; CI fails on unmapped protected routes or policy drift.
- P1 — Add high-risk integration tests
  - Files: new/expanded tests near /home/dylan/eccb.app/src/app/api/admin/**, /home/dylan/eccb.app/src/app/api/setup/**, /home/dylan/eccb.app/src/app/api/files/**
  - Acceptance criteria: test suite includes success + unauthorized + forbidden + CSRF/rate-limit cases for critical admin/setup/file-mutation endpoints.
- P2 — Resolve env/deployment documentation drift
  - Files: /home/dylan/eccb.app/README.md, /home/dylan/eccb.app/DEPLOYMENT.md, /home/dylan/eccb.app/LOCAL_SETUP.md, /home/dylan/eccb.app/env.example, /home/dylan/eccb.app/docker-compose.yml
  - Acceptance criteria: one canonical env filename convention, one canonical DB target per deployment mode, docs match scripts exactly, and fresh setup from docs succeeds without manual correction.
- P2 — Audit operational endpoints and observability consistency
  - Files: /home/dylan/eccb.app/src/app/api/admin/monitoring/route.ts, /home/dylan/eccb.app/src/app/api/admin/jobs/route.ts, /home/dylan/eccb.app/src/app/api/health/route.ts
  - Acceptance criteria: standardized authz and response schema; consistent redaction and error handling; dashboard/health checks validated by automated tests.


  Goal
Perform a thorough read-only audit of /home/dylan/eccb.app focused on Smart Upload, and produce a final report covering:
1) what is implemented,
2) what is missing/incomplete for OCR-first + LLM-second autonomous ingestion,
3) security/secrets gaps,
4) reliability/idempotency/job-topology gaps,
5) testing gaps,
6) prioritized granular TODOs (P0/P1/P2) with file paths + acceptance checks.
Instructions
- User explicitly required: recursive inspection across upload route, admin upload APIs, workers, queue definitions, schema, LLM adapters/config, smart-upload libs, OCR/PDF services, tests, and docs.
- User explicitly required: read-only audit, no file edits.
- Output must be precise and avoid assumptions.
- Current work stayed within those constraints (inspection only; no modifications run/applied).
Discoveries
- Smart Upload pipeline exists and is substantial, including:
  - Main processing worker with documented OCR-first flow and LLM fallback.
  - Second-pass verification/adjudication worker.
  - Unified BullMQ worker for process/second-pass/auto-commit jobs.
  - Admin settings and review APIs, including model discovery, model params, connection testing, second-pass enqueue endpoint.
  - Smart-upload-specific schema/settings/secret helpers/quality gates/commit logic.
- Prisma schema has a SmartUploadSession model and enums for status, but parseStatus and secondPassStatus are still string fields in DB (not Prisma enums), while typed aliases exist in TS.
- There is a large docs corpus (DoD/checklists/action plans/prompts) indicating known production-readiness concerns and expected acceptance criteria.
- Queue system has retry/backoff and DLQ patterns, and smart-upload queue helpers exist, but dedup/job-idempotency handling needs deeper final assessment.
- OCR service and dedicated OCR worker exist, but integration posture vs “OCR-first autonomous ingest” acceptance needs final gap mapping.
- Multiple tests exist across workers/API/services/libs, with strong mocked coverage; true end-to-end autonomous ingest confidence still needs to be assessed in final report.
Accomplished
- Completed broad discovery and deep file reads across requested subsystems.
- Mapped core architecture and gathered evidence from implementation, tests, and docs.
- Verified route/worker/queue/schema/LLM/security-related code locations for audit analysis.
- No files edited.
- Still in progress: synthesizing findings into the requested 6-section audit with precise gap analysis and prioritized P0/P1/P2 TODOs + acceptance checks.
Relevant files / directories
- Primary upload/API surface
  - src/app/api/files/smart-upload/route.ts
  - src/app/api/files/upload/route.ts
  - src/app/api/admin/uploads/review/route.ts
  - src/app/api/admin/uploads/review/[id]/approve/route.ts
  - src/app/api/admin/uploads/review/[id]/reject/route.ts
  - src/app/api/admin/uploads/review/bulk-approve/route.ts
  - src/app/api/admin/uploads/review/[id]/preview/route.ts
  - src/app/api/admin/uploads/review/[id]/part-preview/route.ts
  - src/app/api/admin/uploads/status/[sessionId]/route.ts
  - src/app/api/admin/uploads/events/route.ts
  - src/app/api/admin/uploads/second-pass/route.ts
  - src/app/api/admin/uploads/settings/route.ts
  - src/app/api/admin/uploads/settings/test/route.ts
  - src/app/api/admin/uploads/settings/reset-prompts/route.ts
  - src/app/api/admin/uploads/models/route.ts
  - src/app/api/admin/uploads/model-params/route.ts
  - src/app/api/admin/uploads/providers/discover/route.ts
- Workers
  - src/workers/smart-upload-processor.ts
  - src/workers/smart-upload-worker.ts
  - src/workers/smart-upload-processor-worker.ts
  - src/workers/ocr-worker.ts
  - src/workers/index.ts
  - src/workers/smart-upload-worker.ts (legacy/no-op exports + processSecondPass)
- Queue + jobs
  - src/lib/jobs/definitions.ts
  - src/lib/jobs/queue.ts
  - src/lib/jobs/smart-upload.ts
  - src/lib/jobs/__tests__/smart-upload-queue.test.ts
- Smart Upload libs
  - src/lib/smart-upload/commit.ts
  - src/lib/smart-upload/schema.ts
  - src/lib/smart-upload/bootstrap.ts
  - src/lib/smart-upload/secret-settings.ts
  - src/lib/smart-upload/quality-gates.ts
  - src/lib/smart-upload/duplicate-detection.ts
  - src/lib/smart-upload/state.ts
  - src/lib/smart-upload/session-errors.ts
  - src/lib/smart-upload/metadata-normalizer.ts
  - src/lib/smart-upload/part-naming.ts
  - src/lib/smart-upload/canonical-instruments.ts
  - src/lib/smart-upload/fallback-policy.ts
  - src/lib/smart-upload/prompts.ts
  - src/lib/smart-upload/budgets.ts
  - src/lib/services/smart-upload-cleanup.ts
- OCR/PDF services
  - src/lib/services/ocr-fallback.ts
  - src/lib/services/pdf-text-extractor.ts
  - src/lib/services/part-boundary-detector.ts
  - src/lib/services/cutting-instructions.ts
  - src/lib/services/pdf-splitter.ts
  - src/lib/services/pdf-renderer.ts
  - src/lib/services/pdf-part-detector.ts
- LLM config/adapters
  - src/lib/llm/config-loader.ts
  - src/lib/llm/index.ts
  - src/lib/llm/types.ts
  - src/lib/llm/providers.ts
  - src/lib/llm/openai.ts
  - src/lib/llm/anthropic.ts
  - src/lib/llm/gemini.ts
  - src/lib/llm/ollama.ts
  - src/lib/llm/ollama-cloud.ts
  - src/lib/llm/openrouter.ts
  - src/lib/llm/mistral.ts
  - src/lib/llm/groq.ts
  - src/lib/llm/custom.ts
  - src/lib/llm/auto-provider.ts
- Schema
  - prisma/schema.prisma
- Tests inspected
  - src/workers/__tests__/smart-upload-processor.test.ts
  - src/workers/__tests__/smart-upload-second-pass.test.ts
  - src/workers/__tests__/quality-gates.test.ts
  - src/workers/__tests__/regression.test.ts
  - src/app/api/files/smart-upload/__tests__/route.test.ts
  - src/app/api/files/smart-upload/__tests__/e2e.test.ts
  - src/app/api/files/smart-upload/__tests__/smart-upload-services.test.ts
  - src/app/api/admin/uploads/settings/__tests__/route.test.ts
  - src/app/api/admin/uploads/review/[id]/approve/__tests__/route.test.ts
  - src/app/api/admin/uploads/review/[id]/reject/__tests__/route.test.ts
  - src/lib/smart-upload/__tests__/
  - src/lib/llm/__tests__/
  - src/lib/services/__tests__/cutting-instructions.test.ts
  - src/lib/services/__tests__/part-boundary-detector.test.ts
  - src/lib/services/__tests__/gap-detection.test.ts
- Docs inspected (smart upload)
  - docs/SMART_UPLOAD.md
  - docs/smart-upload/SMART_UPLOAD_ENTERPRISE_CHECKLIST.md
  - docs/smart-upload/SMART_UPLOAD_ACTION_PLAN.md
  - docs/smart-upload/smart-upload-definition-of-done.md
  - docs/smart-upload/smart-upload.DoD.md
  - docs/smart-upload/smart-upload.DoD.acceptance-criteria.md
  - docs/smart-upload/smart-upload.TODO.md
  - docs/smart-upload/2026-02-25-smart-upload-design.md
  - docs/smart-upload/AUTONOMOUS_AGENT_SMART_UPLOAD_PROMPT.md
  - docs/smart-upload/prompts/ (subagent specs/orchestrator prompts)


  I continued and finished the read-only audit. Here are the concrete findings.
1) What Is Implemented
- Upload intake is guarded and hardened in /home/dylan/eccb.app/src/app/api/files/smart-upload/route.ts: auth, permission, CSRF, rate limit, MIME/type checks, PDF magic-bytes validation, durable storage write, then session create + async queue.
- Main pipeline is substantial in /home/dylan/eccb.app/src/workers/smart-upload-processor.ts: deterministic text-layer segmentation, OCR-first branch (skip LLM when deterministic confidence is high), LLM fallback, cutting-instruction validation/gap fill, split/upload part PDFs, quality gates, second-pass queueing, optional autonomous auto-commit queueing.
- Second pass + adjudication are implemented in /home/dylan/eccb.app/src/workers/smart-upload-worker.ts: verification pass, disagreement detection, adjudicator pass, re-splitting, quality-gate recheck, and autonomous commit trigger.
- Queue topology for Smart Upload is unified in /home/dylan/eccb.app/src/workers/smart-upload-processor-worker.ts (single worker handles process/second-pass/auto-commit), which fixes the historical multi-worker “silent skip” risk.
- Commit path is centralized and idempotent per session in /home/dylan/eccb.app/src/lib/smart-upload/commit.ts via originalUploadId check.
- Admin API surface is broad and permissioned: settings, model discovery/test, review/approve/reject, status polling, SSE progress endpoints under /home/dylan/eccb.app/src/app/api/admin/uploads/.
2) Missing/Incomplete vs OCR-first + LLM-second Autonomous Ingestion
- OCR worker exists but is not wired into orchestration: /home/dylan/eccb.app/src/workers/ocr-worker.ts has no callers, no queue definitions in /home/dylan/eccb.app/src/lib/jobs/definitions.ts, and is not started in /home/dylan/eccb.app/src/workers/index.ts.
- OCR config keys are defined but unused in runtime flow: smart_upload_local_ocr_enabled and smart_upload_ocr_confidence_threshold appear in /home/dylan/eccb.app/src/lib/smart-upload/schema.ts + /home/dylan/eccb.app/src/lib/smart-upload/bootstrap.ts but are not consumed by processing workers.
- Policy/state modules exist but are not integrated: /home/dylan/eccb.app/src/lib/smart-upload/state.ts and /home/dylan/eccb.app/src/lib/smart-upload/fallback-policy.ts are only exercised in tests.
- llm_two_pass_enabled is loaded in config (/home/dylan/eccb.app/src/lib/llm/config-loader.ts) but not enforced in worker logic.
- Autonomous path exists, but manual review remains a primary operational path (PENDING_REVIEW listing and approve/reject workflows are first-class), so “manual review only as exception” is not fully enforced as a system invariant.
3) Security/Secrets Gaps
- Smart Upload provider secrets are stored plaintext in SystemSetting.value (/home/dylan/eccb.app/prisma/schema.prisma:817 model, value String @db.Text), while encrypted-key infrastructure exists elsewhere (APIKey.encryptedKey).
- Secret material appears committed in docs: /home/dylan/eccb.app/docs/smart-upload/SMART_UPLOAD_ACTION_PLAN.md:89 and /home/dylan/eccb.app/docs/smart-upload/SMART_UPLOAD_ACTION_PLAN.md:90 contain full-looking API keys.
- Model discovery endpoint accepts API key via URL query param (/home/dylan/eccb.app/src/app/api/admin/uploads/models/route.ts:696), which increases leakage risk via logs/history/proxies.
- Mutating review endpoints do not enforce CSRF (/home/dylan/eccb.app/src/app/api/admin/uploads/review/[id]/approve/route.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/review/[id]/reject/route.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/review/bulk-approve/route.ts) while other sensitive endpoints do.
4) Reliability/Idempotency/Job Topology Gaps
- Queue enqueue helpers do not set deterministic jobId for dedupe (/home/dylan/eccb.app/src/lib/jobs/smart-upload.ts), so duplicate submissions can enqueue duplicate jobs.
- Second-pass enqueue route explicitly allows already-QUEUED sessions (/home/dylan/eccb.app/src/app/api/admin/uploads/second-pass/route.ts:87) and then enqueues again, enabling duplicate second-pass jobs.
- In processSecondPass, ineligible-state throws are caught and session is set to FAILED (/home/dylan/eccb.app/src/workers/smart-upload-worker.ts:965-973), so concurrent duplicate jobs can create false failure transitions.
- sourceSha256 is computed at upload (/home/dylan/eccb.app/src/app/api/files/smart-upload/route.ts:131) but not used for intake dedupe/resume policy; helper logic in /home/dylan/eccb.app/src/lib/smart-upload/duplicate-detection.ts is not integrated into route/worker commit decisions.
- Schema/type drift remains: Prisma keeps parseStatus and secondPassStatus as loose strings (/home/dylan/eccb.app/prisma/schema.prisma:394-395), allowing untyped values and transition drift.
5) Testing Gaps
- “E2E” test is mock-heavy and not true end-to-end (/home/dylan/eccb.app/src/app/api/files/smart-upload/__tests__/e2e.test.ts), including stale status literals.
- Upload route test does not validate POST behavior meaningfully; it mostly validates mock wiring and OPTIONS (/home/dylan/eccb.app/src/app/api/files/smart-upload/__tests__/route.test.ts).
- No test coverage for duplicate enqueue race conditions (same session queued multiple times), especially second-pass.
- No integration coverage proving OCR worker orchestration end-to-end (queue -> worker -> session transitions) since OCR worker is currently disconnected.
- No security tests around CSRF on approve/reject/bulk-review endpoints.
- No coverage proving dedupe policy at intake (hash/work fingerprint) blocks harmful duplicate commits across retried uploads.
6) Prioritized TODOs (P0/P1/P2) with Acceptance Checks
- P0-1 Secrets hardening: migrate Smart Upload keys out of plaintext SystemSetting to encrypted key storage path.  
  Paths: /home/dylan/eccb.app/prisma/schema.prisma, /home/dylan/eccb.app/src/lib/llm/config-loader.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/settings/route.ts  
  Acceptance: DB no longer stores raw provider keys in systemSetting.value; runtime still loads keys; settings API returns masked placeholders only.
- P0-2 Incident cleanup: remove leaked key material from docs + rotate affected credentials.  
  Paths: /home/dylan/eccb.app/docs/smart-upload/SMART_UPLOAD_ACTION_PLAN.md  
  Acceptance: no full key patterns remain in repo history tip; new keys issued and old revoked.
- P0-3 CSRF parity for review mutations.  
  Paths: /home/dylan/eccb.app/src/app/api/admin/uploads/review/[id]/approve/route.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/review/[id]/reject/route.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/review/bulk-approve/route.ts  
  Acceptance: state-changing review endpoints reject missing/invalid CSRF with 403.
- P0-4 Queue dedupe/idempotent enqueue keys per session+stage.  
  Paths: /home/dylan/eccb.app/src/lib/jobs/smart-upload.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/second-pass/route.ts, /home/dylan/eccb.app/src/app/api/files/smart-upload/route.ts  
  Acceptance: repeated same-session enqueue attempts return same logical job (or no-op), not duplicate execution.
- P0-5 Fix second-pass race/failure semantics.  
  Paths: /home/dylan/eccb.app/src/workers/smart-upload-worker.ts, /home/dylan/eccb.app/src/app/api/admin/uploads/second-pass/route.ts  
  Acceptance: duplicate/late second-pass jobs do not downgrade successful sessions to FAILED.
- P1-1 Wire OCR queue as first-class job type and lifecycle-managed worker.  
  Paths: /home/dylan/eccb.app/src/lib/jobs/definitions.ts, /home/dylan/eccb.app/src/lib/jobs/queue.ts, /home/dylan/eccb.app/src/workers/index.ts, /home/dylan/eccb.app/src/workers/ocr-worker.ts  
  Acceptance: OCR jobs can be enqueued/processed with explicit ownership and health visibility.
- P1-2 Enforce OCR config flags in runtime path.  
  Paths: /home/dylan/eccb.app/src/workers/smart-upload-processor.ts, /home/dylan/eccb.app/src/lib/llm/config-loader.ts  
  Acceptance: smart_upload_local_ocr_enabled + smart_upload_ocr_confidence_threshold materially change routing behavior.
- P1-3 Integrate canonical routing/state engine (or remove dead policy code).  
  Paths: /home/dylan/eccb.app/src/lib/smart-upload/state.ts, /home/dylan/eccb.app/src/lib/smart-upload/fallback-policy.ts, workers/routes using raw strings  
  Acceptance: status transitions validated centrally; no ad hoc status writes in workers/routes.
- P1-4 Implement intake dedupe/resume policy using sourceSha256 and work fingerprint.  
  Paths: /home/dylan/eccb.app/src/app/api/files/smart-upload/route.ts, /home/dylan/eccb.app/src/lib/smart-upload/duplicate-detection.ts, schema fields/indexes  
  Acceptance: client retry and duplicate upload scenarios are deterministic (resume/reject/new-session-with-safe-commit).
- P2-1 Replace query-string API key transport in model discovery with POST body (or server-side only).  
  Paths: /home/dylan/eccb.app/src/app/api/admin/uploads/models/route.ts  
  Acceptance: no API key accepted in URL query parameters.
- P2-2 Align schema typing for parse/second-pass statuses to enums.  
  Paths: /home/dylan/eccb.app/prisma/schema.prisma, /home/dylan/eccb.app/src/types/smart-upload.ts  
  Acceptance: DB enforces valid status values; impossible to persist drift strings.
- P2-3 Upgrade tests to true orchestration coverage.  
  Paths: /home/dylan/eccb.app/src/app/api/files/smart-upload/__tests__/e2e.test.ts, /home/dylan/eccb.app/src/workers/__tests__/  
  Acceptance: tests cover duplicate enqueue races, OCR queue wiring, second-pass race safety, and autonomous commit path with realistic queue/session transitions.


  Goal
Perform a thorough read-only audit of /home/dylan/eccb.app focused on the Digital Music Stand implementation, then produce a structured report with:
1) implemented capabilities (with concrete file refs),  
2) missing/incomplete MVP capabilities vs a minimally equivalent PiaScore baseline,  
3) security/authorization/privacy gaps,  
4) reliability/performance gaps,  
5) testing gaps,  
6) prioritized granular TODO checklist (P0/P1/P2, checkboxes, exact file paths).
No file edits are allowed.
Instructions
- Do a recursive audit of all relevant stand areas:
  - member stand pages
  - stand API routes
  - stand components
  - stand hooks/store
  - stand-related Prisma schema/models
  - tests
  - docs
- Be specific and conservative:
  - only mark items “done” when code clearly implements them.
- Must remain read-only (no edits, no refactors, no patches).
Discoveries
- The audit is in-progress and has already mapped most stand surface area via glob/grep + direct file reads.
- Stand domain models exist in prisma/schema.prisma for:
  - Annotation, NavigationLink, StandSession, AudioLink, UserPreferences, PracticeLog, StandBookmark, StandSetlist, StandSetlistItem.
- There is a centralized stand access helper layer (src/lib/stand/access.ts) but many API routes still use direct auth/role checks instead of consistently using those shared guards.
- Stand file proxy hardening is present in src/app/api/stand/files/[...key]/route.ts (scope required, traversal checks, non-enumerating 404 behavior for denied access).
- Real-time strategy is mixed:
  - polling path actively used (/api/stand/sync)
  - websocket module exists (src/lib/websocket/stand-socket.ts) but custom-server-dependent and partly placeholder-oriented.
- UI feature breadth is substantial (annotations, nav links, audio player, metronome, tuner, pitch pipe, setlist sidebar, gesture/keyboard/MIDI support, performance mode), but some components are clearly stubs/incomplete (BluetoothHandler, NightModeToggle).
- Docs in docs/digitial-music-stand/* are extensive and include a PiaScore-oriented DoD/checklist, but several docs appear aspirational and not fully aligned with implementation reality.
- OMR route and related tests show drift/mismatch risk between implementation and test assumptions.
- A number of tests exist, but quality varies; some are strong behavior tests, some are placeholder/assertion-light.
Accomplished
- Completed broad discovery sweep:
  - globbed stand/music-related files
  - grep’d references across codebase
  - identified key implementation clusters.
- Read and inspected major implementation files across:
  - schema/models
  - stand APIs
  - member stand pages
  - stand components
  - hooks/store
  - websocket sync
  - docs
  - tests.
- No code changes were made (read-only requirement preserved).
- Not yet completed:
  - final synthesis report in the exact 6 requested sections
  - finalized MVP-gap matrix vs PiaScore-minimum
  - finalized P0/P1/P2 checkbox TODO list with exact file paths for all action items.
Relevant files / directories
- Schema / data model
  - prisma/schema.prisma
- Member stand pages
  - src/app/(member)/member/stand/page.tsx
  - src/app/(member)/member/stand/[eventId]/page.tsx
  - src/app/(member)/member/stand/[eventId]/loading.tsx
  - src/app/(member)/member/stand/[eventId]/error.tsx
  - src/app/(member)/member/stand/library/[pieceId]/page.tsx
- Stand API routes
  - src/app/api/stand/annotations/route.ts
  - src/app/api/stand/annotations/[id]/route.ts
  - src/app/api/stand/navigation-links/route.ts
  - src/app/api/stand/navigation-links/[id]/route.ts
  - src/app/api/stand/audio/route.ts
  - src/app/api/stand/audio/[id]/route.ts
  - src/app/api/stand/bookmarks/route.ts
  - src/app/api/stand/setlists/route.ts
  - src/app/api/stand/sync/route.ts
  - src/app/api/stand/roster/route.ts
  - src/app/api/stand/settings/route.ts
  - src/app/api/stand/preferences/route.ts
  - src/app/api/stand/practice-logs/route.ts
  - src/app/api/stand/practice-logs/[id]/route.ts
  - src/app/api/stand/metadata/route.ts
  - src/app/api/stand/files/[...key]/route.ts
  - src/app/api/stand/omr/route.ts
- Stand shared libs
  - src/lib/stand/access.ts
  - src/lib/stand/http.ts
  - src/lib/stand/settings.ts
  - src/lib/stand/telemetry.ts
  - src/lib/stand/index.ts
  - src/lib/feature-flags.ts
  - src/lib/wakeLock.ts
  - src/lib/pdf.ts
  - src/lib/autoCrop.ts
  - src/lib/stamps.ts
- Stand websocket / sync internals
  - src/lib/websocket/stand-socket.ts
  - src/hooks/use-stand-sync.ts
  - src/hooks/useAudioTracker.ts
- Stand store
  - src/store/standStore.ts
- Stand member components (core + utilities)
  - src/components/member/stand/StandViewer.tsx
  - src/components/member/stand/StandCanvas.tsx
  - src/components/member/stand/AnnotationLayer.tsx
  - src/components/member/stand/usePdf.ts
  - src/components/member/stand/Toolbar.tsx
  - src/components/member/stand/NavigationControls.tsx
  - src/components/member/stand/SetlistManager.tsx
  - src/components/member/stand/SmartNavEditor.tsx
  - src/components/member/stand/RosterOverlay.tsx
  - src/components/member/stand/AudioPlayer.tsx
  - src/components/member/stand/Metronome.tsx
  - src/components/member/stand/Tuner.tsx
  - src/components/member/stand/PitchPipe.tsx
  - src/components/member/stand/AudioTrackerSettings.tsx
  - src/components/member/stand/GestureHandler.tsx
  - src/components/member/stand/KeyboardHandler.tsx
  - src/components/member/stand/MidiHandler.tsx
  - src/components/member/stand/BluetoothHandler.tsx
  - src/components/member/stand/PerformanceModeToggle.tsx
  - src/components/member/stand/NightModeToggle.tsx
  - src/components/member/stand/useFullscreen.ts
  - src/components/member/stand/PartSelector.tsx
  - src/components/member/stand/LibraryStandViewer.tsx
  - src/components/member/stand/LibraryPDFViewer.tsx
  - src/components/member/stand/StandLibrarySearch.tsx
- Admin integration
  - src/components/admin/settings/music-stand-settings-form.tsx
  - src/components/member/sidebar.tsx
- Stand tests (API, store, components, hooks, websocket)
  - src/store/__tests__/standStore.test.ts
  - src/store/__tests__/standStore-stand-fixes.test.ts
  - src/lib/websocket/__tests__/stand-socket.test.ts
  - src/hooks/__tests__/useAudioTracker.test.ts
  - src/app/api/stand/sync/__tests__/route.test.ts
  - src/app/api/stand/annotations/__tests__/route.test.ts
  - src/app/api/stand/annotations/[id]/__tests__/route.test.ts
  - src/app/api/stand/preferences/__tests__/route.test.ts
  - src/app/api/stand/practice-logs/__tests__/route.test.ts
  - src/app/api/stand/omr/__tests__/route.test.ts
  - src/components/member/stand/__tests__/StandViewer.test.tsx
  - src/components/member/stand/__tests__/StandCanvas.test.tsx
  - src/components/member/stand/__tests__/AnnotationLayer.test.tsx
  - src/components/member/stand/__tests__/AnnotationLayer.accessibility.test.tsx
  - src/components/member/stand/__tests__/AudioPlayer.test.tsx
  - src/components/member/stand/__tests__/Metronome.test.tsx
  - src/components/member/stand/__tests__/Tuner.test.tsx
  - src/components/member/stand/__tests__/PitchPipe.test.tsx
  - src/components/member/stand/__tests__/KeyboardHandler.test.tsx
  - src/components/member/stand/__tests__/GestureHandler.test.tsx
  - src/components/member/stand/__tests__/MidiHandler.test.tsx
  - src/components/member/stand/__tests__/NightMode.test.tsx
  - src/components/member/stand/__tests__/PerformanceModeToggle.test.tsx
  - src/components/member/stand/__tests__/RosterOverlay.test.tsx
  - src/lib/__tests__/autoCrop.test.ts
- Docs reviewed
  - docs/stand-developer-guide.md
  - docs/digitial-music-stand/stand-user-guide.md
  - docs/digitial-music-stand/stand-annotation-system.md
  - docs/digitial-music-stand/stand-pdf-rendering.md
  - docs/digitial-music-stand/stand.DoD.md
  - docs/digitial-music-stand/2026-02-26-music-stand-update-requested.md

Completed the read-only audit and synthesized the findings into the 6 requested sections. No files were modified.
1) Implemented Capabilities (verified in code)
- Stand entry flow exists: member hub + event stand + library stand pages in /home/dylan/eccb.app/src/app/(member)/member/stand/page.tsx, /home/dylan/eccb.app/src/app/(member)/member/stand/[eventId]/page.tsx, /home/dylan/eccb.app/src/app/(member)/member/stand/library/[pieceId]/page.tsx.
- Core stand viewer is wired with store hydration, annotations/nav/audio/roster preload, and sync hook in /home/dylan/eccb.app/src/components/member/stand/StandViewer.tsx.
- PDF rendering stack is implemented with PDF.js worker configured to same-origin (/pdf.worker.min.mjs) and DPR-aware canvas rendering in /home/dylan/eccb.app/src/lib/pdf.ts, /home/dylan/eccb.app/src/components/member/stand/usePdf.ts, /home/dylan/eccb.app/src/components/member/stand/StandCanvas.tsx.
- Annotation system is substantial: layered canvas (PERSONAL/SECTION/DIRECTOR), pencil/highlighter/eraser/whiteout/text/stamp persistence in /home/dylan/eccb.app/src/components/member/stand/AnnotationLayer.tsx with API endpoints in /home/dylan/eccb.app/src/app/api/stand/annotations/route.ts and /home/dylan/eccb.app/src/app/api/stand/annotations/[id]/route.ts.
- Smart navigation hotspots are implemented for create/delete and in-view jump behavior in /home/dylan/eccb.app/src/components/member/stand/SmartNavEditor.tsx and /home/dylan/eccb.app/src/app/api/stand/navigation-links/route.ts.
- Rehearsal utilities exist and are hooked from toolbar: metronome/tuner/pitch-pipe/audio player/performance mode in /home/dylan/eccb.app/src/components/member/stand/Toolbar.tsx, /home/dylan/eccb.app/src/components/member/stand/Metronome.tsx, /home/dylan/eccb.app/src/components/member/stand/Tuner.tsx, /home/dylan/eccb.app/src/components/member/stand/PitchPipe.tsx, /home/dylan/eccb.app/src/components/member/stand/AudioPlayer.tsx, /home/dylan/eccb.app/src/components/member/stand/PerformanceModeToggle.tsx.
- File proxy hardening is present (scope required, traversal guard, non-enumerating 404) in /home/dylan/eccb.app/src/app/api/stand/files/[...key]/route.ts.
- Data model breadth exists for stand features in /home/dylan/eccb.app/prisma/schema.prisma (Annotation, NavigationLink, StandSession, AudioLink, UserPreferences, PracticeLog, StandBookmark, StandSetlist, StandSetlistItem).
2) Missing / Incomplete MVP vs “minimal PiaScore-equivalent” baseline
- Library mode currently appears broken against the scoped proxy: library viewer builds file URL without eventId/pieceId (/api/stand/files/...), but proxy requires scope; see /home/dylan/eccb.app/src/components/member/stand/LibraryStandViewer.tsx vs /home/dylan/eccb.app/src/app/api/stand/files/[...key]/route.ts.
- Member-specific part assignment selection/persistence is not implemented in event stand flow (event loader includes parts, but piece build picks first PDF only) in /home/dylan/eccb.app/src/components/member/stand/StandViewer.tsx.
- No undo/redo, clear-page workflow, selection/lasso, or annotation edit/move UX in /home/dylan/eccb.app/src/components/member/stand/AnnotationLayer.tsx.
- No synced-score playback baseline (time-map highlighting) and no MusicXML path; current audio player is independent playback only in /home/dylan/eccb.app/src/components/member/stand/AudioPlayer.tsx.
- No “follow director” UX/state despite command protocol existing in sync layers; stand viewer does not consume command/mode callbacks in /home/dylan/eccb.app/src/components/member/stand/StandViewer.tsx and /home/dylan/eccb.app/src/hooks/use-stand-sync.ts.
- Audio/nav admin CRUD UX is incomplete: APIs exist, but no director/librarian management UI found for audio links, and nav UI does not update existing links (create/delete only) in /home/dylan/eccb.app/src/components/member/stand/SmartNavEditor.tsx.
- Practice tracking has API + schema but no visible stand-side timer/panel/history UI in member stand components.
3) Security / Authorization / Privacy Gaps
- Access enforcement is inconsistent across stand APIs: centralized guard exists in /home/dylan/eccb.app/src/lib/stand/access.ts, but many routes still only check session/role and skip event/piece access checks (notably /home/dylan/eccb.app/src/app/api/stand/audio/route.ts, /home/dylan/eccb.app/src/app/api/stand/audio/[id]/route.ts, /home/dylan/eccb.app/src/app/api/stand/navigation-links/route.ts, /home/dylan/eccb.app/src/app/api/stand/navigation-links/[id]/route.ts, /home/dylan/eccb.app/src/app/api/stand/metadata/route.ts, /home/dylan/eccb.app/src/app/api/stand/omr/route.ts).
- SECTION annotation write policy differs from centralized policy intent: route logic permits any member with any section to write SECTION layer, while centralized policy indicates section-leader/section-target checks; compare /home/dylan/eccb.app/src/app/api/stand/annotations/route.ts and /home/dylan/eccb.app/src/lib/stand/access.ts.
- Library page checks member existence but not active status (ACTIVE) in /home/dylan/eccb.app/src/app/(member)/member/stand/library/[pieceId]/page.tsx.
- Roster heartbeat update does not re-validate event access before update in /home/dylan/eccb.app/src/app/api/stand/roster/route.ts (PUT path).
- Validation hardening helper for annotation payload size exists but is not used (strokeDataSchema) in /home/dylan/eccb.app/src/lib/stand/http.ts.
4) Reliability / Performance Gaps
- Real-time state is process-local (Map) for sync/presence; this is not multi-instance safe and can reset on restart/deploy in /home/dylan/eccb.app/src/app/api/stand/sync/route.ts.
- WebSocket layer is partly placeholder/custom-server dependent; polling is the practical path today in /home/dylan/eccb.app/src/lib/websocket/stand-socket.ts.
- Presence count can drift due to mixed DB count + in-memory list aggregation in /home/dylan/eccb.app/src/app/api/stand/sync/route.ts.
- No explicit periodic cleanup of stale in-memory presence/state maps in /home/dylan/eccb.app/src/app/api/stand/sync/route.ts.
- Audio tracker runs analysis loop on animation frames despite an unused fixed interval constant, which can be expensive on low-power/mobile devices in /home/dylan/eccb.app/src/hooks/useAudioTracker.ts.
- PDF adjacent-page preload renders full canvases on each page change with no cache policy/cap, which can increase memory churn in /home/dylan/eccb.app/src/components/member/stand/usePdf.ts.
5) Testing Gaps
- No route tests found for several stand APIs: files proxy, audio CRUD, navigation-links CRUD, roster, metadata, settings, bookmarks, setlists.
- OMR tests are drifted from implementation: tests expect user-preference API-key behavior and status codes that no longer match route behavior using server env keys + role gate; compare /home/dylan/eccb.app/src/app/api/stand/omr/route.ts and /home/dylan/eccb.app/src/app/api/stand/omr/__tests__/route.test.ts.
- Some test files are assertion-light / implementation-detail-heavy rather than behavior-rich (example: synthetic night-mode tests in /home/dylan/eccb.app/src/components/member/stand/__tests__/NightMode.test.tsx).
- WebSocket tests mostly validate parser and in-memory helpers, not end-to-end socket lifecycle/auth/broadcast behavior in /home/dylan/eccb.app/src/lib/websocket/__tests__/stand-socket.test.ts.
- No tests covering the library-mode file-scope bug path (/api/stand/files without scope) from /home/dylan/eccb.app/src/components/member/stand/LibraryStandViewer.tsx.
6) Prioritized Granular TODO Checklist
P0
- [ ] Fix library file proxy URL scoping by appending pieceId (or migrate to piece-aware proxy helper) in /home/dylan/eccb.app/src/components/member/stand/LibraryStandViewer.tsx.
- [ ] Standardize stand API authz on centralized guards (requireStandAccess, requireEventAccess, canAccessPiece) in /home/dylan/eccb.app/src/app/api/stand/audio/route.ts.
- [ ] Standardize stand API authz on centralized guards in /home/dylan/eccb.app/src/app/api/stand/audio/[id]/route.ts.
- [ ] Standardize stand API authz on centralized guards in /home/dylan/eccb.app/src/app/api/stand/navigation-links/route.ts.
- [ ] Standardize stand API authz on centralized guards in /home/dylan/eccb.app/src/app/api/stand/navigation-links/[id]/route.ts.
- [ ] Add piece/event access checks in /home/dylan/eccb.app/src/app/api/stand/metadata/route.ts.
- [ ] Add event/piece access checks in /home/dylan/eccb.app/src/app/api/stand/omr/route.ts and ensure file fetch path uses authorized stand/file scope.
- [ ] Align SECTION-layer write enforcement with canWriteLayer policy in /home/dylan/eccb.app/src/app/api/stand/annotations/route.ts and /home/dylan/eccb.app/src/app/api/stand/annotations/[id]/route.ts.
- [ ] Enforce annotation payload size limits by using strokeDataSchema from /home/dylan/eccb.app/src/lib/stand/http.ts in annotation POST/PUT routes.
- [ ] Require ACTIVE member (or approved privileged role) for library mode in /home/dylan/eccb.app/src/app/(member)/member/stand/library/[pieceId]/page.tsx.
P1
- [ ] Wire follow-director behavior (opt-in/out + apply incoming commands/modes) in /home/dylan/eccb.app/src/components/member/stand/StandViewer.tsx and /home/dylan/eccb.app/src/hooks/use-stand-sync.ts.
- [ ] Replace process-local sync state with shared backend state (Redis) in /home/dylan/eccb.app/src/app/api/stand/sync/route.ts.
- [ ] Add stale presence/state cleanup strategy in /home/dylan/eccb.app/src/app/api/stand/sync/route.ts.
- [ ] Implement navigation-link update UX (or remove unused update API) in /home/dylan/eccb.app/src/components/member/stand/SmartNavEditor.tsx.
- [ ] Add director/librarian audio-link management UI using existing audio APIs in /home/dylan/eccb.app/src/components/member/stand/ (new management component + toolbar entry).
- [ ] Implement member-specific part preference selection/persistence for event stand in /home/dylan/eccb.app/src/components/member/stand/StandViewer.tsx and /home/dylan/eccb.app/src/store/standStore.ts.
- [ ] Connect existing bookmarks/setlists APIs to UI flows in /home/dylan/eccb.app/src/components/member/stand/.
- [ ] Align admin settings model split (musicStand.* keys vs stand global settings) between /home/dylan/eccb.app/src/components/admin/settings/music-stand-settings-form.tsx and /home/dylan/eccb.app/src/lib/stand/settings.ts.
P2
- [ ] Implement or remove placeholder BluetoothHandler in /home/dylan/eccb.app/src/components/member/stand/BluetoothHandler.tsx.
- [ ] Implement or remove dead NightModeToggle in /home/dylan/eccb.app/src/components/member/stand/NightModeToggle.tsx.
- [ ] Add memory/perf budgeting for PDF preload cache in /home/dylan/eccb.app/src/components/member/stand/usePdf.ts.
- [ ] Tune audio analysis cadence for low-power devices in /home/dylan/eccb.app/src/hooks/useAudioTracker.ts.
- [ ] Reconcile stale/aspirational docs with shipped behavior in /home/dylan/eccb.app/docs/stand-developer-guide.md and /home/dylan/eccb.app/docs/digitial-music-stand/stand.DoD.md.
- [ ] Expand QA matrix docs/tests for iOS Safari/Android tablet rendering and gesture behavior in /home/dylan/eccb.app/docs/digitial-music-stand/.