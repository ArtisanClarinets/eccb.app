# Smart Upload Acceptance Criteria

**System:** Smart Upload
**Purpose:** Autonomous LLM-integrated music-library digitization pipeline
**Document Type:** Acceptance Criteria / Release Gate / Definition of Done
**Version:** 1.0
**Status:** Proposed Release Standard
**Primary Goal:** Convert uploaded music PDFs into correctly segmented, normalized, committed library records and individual part PDFs with no human intervention for normal cases.

---

# 1. Executive Standard

Smart Upload is **accepted as complete** only when a valid music PDF can be uploaded once and the system, by itself:

1. securely accepts the file,
2. validates and stores the original asset,
3. extracts page-level signals from text, image, and OCR-capable workflows,
4. identifies score and part boundaries correctly,
5. generates correct individual part PDFs,
6. derives normalized work-level and part-level metadata,
7. commits clean and linked database records exactly once,
8. saves all generated assets to storage correctly,
9. emits truthful progress and audit events,
10. recovers safely from retriable failure states,
11. routes ambiguous or unsafe cases to exception handling instead of silently committing bad data,
12. requires **no human review in the normal path**.

Manual review may exist, but only as an **exception workflow**, not as a required step for ordinary uploads.

---

# 2. Scope

This acceptance standard applies to the full Smart Upload workflow:

* upload intake
* auth, permissions, CSRF, rate limiting
* original file storage
* queueing and background processing
* text extraction
* image rendering
* OCR fallback
* LLM vision / document reasoning
* deterministic segmentation
* boundary validation
* PDF splitting
* metadata normalization
* duplicate detection
* autonomous commit
* storage persistence
* DB persistence
* retry behavior
* progress and status reporting
* audit logging
* provider configuration
* admin monitoring and exception handling
* automated tests
* production release readiness

---

# 3. Product Outcome

The system must save substantial labor during library digitization by replacing manual work in all normal cases, including:

* manual renaming of parts
* manual splitting of PDFs
* manual metadata entry
* manual identification of page ranges
* manual creation of database rows
* manual storage placement
* manual orchestration of OCR or second-pass verification
* manual triggering of “approve” for ordinary successful uploads

The system is not accepted if ordinary uploads still require human babysitting.

---

# 4. Supported Input Classes

The accepted production scope must include, at minimum:

## 4.1 Standard Input Types

* full ensemble packet PDFs
* single-part PDFs
* conductor score PDFs
* score + parts in one PDF
* multi-page parts
* single-page parts
* scanned PDFs
* born-digital PDFs with text layer
* mixed PDFs containing both image-only and text-backed pages

## 4.2 Supported Musical Use Cases

* band parts
* orchestral parts
* chamber music packets
* wind ensemble parts
* jazz ensemble packets
* conductor score + player-part sets
* common chair naming formats
* common transposition/instrument naming formats

## 4.3 Required Minimum Classification Ability

The system must correctly distinguish, where present:

* conductor score
* full score
* study score
* individual player part
* instrument family
* instrument variant
* chair / desk / part number
* movement or subsection labels when relevant to naming or grouping

---

# 5. Provider Baseline

This acceptance standard assumes the system supports major multimodal / structured-output provider classes that are capable of image or document understanding and schema-constrained output. Official docs currently show support for multimodal input and/or structured outputs across OpenAI, Anthropic, Gemini, and OpenRouter; Gemini also documents document processing workflows. ([OpenAI Platform][1])

The production system **must** support these provider classes as first-class runtime options:

* OpenAI
* Anthropic
* Gemini
* OpenRouter
* local/self-hosted Ollama
* Ollama Cloud
* custom OpenAI-compatible endpoints

For acceptance, provider support means more than “the dropdown exists.” It means:

* configuration works,
* secrets are handled safely,
* connectivity can be verified,
* supported models can be discovered or configured,
* request and response handling are correct,
* structured output validation is enforced,
* fallback behavior is defined,
* provider-specific quirks do not break the ingest pipeline.

---

# 6. Key Definitions

## 6.1 Normal Case

A valid music PDF whose contents are sufficiently legible and structured for the system to determine part boundaries and metadata with confidence above configured thresholds.

## 6.2 Exception Case

A file that is corrupt, ambiguous, unsupported, severely degraded, contradictory, or below confidence thresholds such that autonomous commit would be unsafe.

## 6.3 Autonomous Commit

A successful end-to-end ingest where the system writes final library records and generated part assets without waiting for human approval.

## 6.4 Idempotent Commit

A commit behavior in which retries, duplicate job delivery, or client retry of upload requests do not create harmful duplicate records or duplicate part assets.

## 6.5 Canonical Metadata

Normalized metadata used by the library as the stable source of truth, regardless of how labels appear in the source PDF.

---

# 7. Non-Negotiable Release Principle

The system must prefer:

1. **deterministic parsing first** where reliable,
2. **LLM-assisted interpretation second** where needed,
3. **OCR fallback automatically** where text extraction is insufficient,
4. **second-pass verification automatically** where ambiguity remains,
5. **exception routing instead of unsafe commit** when confidence remains too low.

The system must never silently guess and commit low-confidence results as if they were correct.

---

# 8. Definition of Done

Smart Upload is **Done** only when all of the following are true:

1. Ordinary valid uploads complete end-to-end with no human intervention.
2. Each intended part becomes the correct individual PDF.
3. Work-level and part-level metadata are normalized and saved properly.
4. DB records are correct, linked, and transactionally safe.
5. Retries do not create duplicates.
6. Worker crashes and provider failures are survivable or fail cleanly.
7. OCR and second-pass flows are automatic and policy-driven.
8. Exception cases are routed visibly and safely.
9. Status, logs, metrics, and audit trails are truthful.
10. End-to-end tests prove the autonomous path works.

If any one of these is false, the system is **not done**.

---

# 9. Functional Acceptance Criteria

# 9.1 Intake and Upload Acceptance

## 9.1.1 Upload Security

The upload endpoint must:

* require authentication,
* require correct upload permission,
* enforce CSRF where applicable,
* enforce rate limiting,
* reject unsupported content types,
* validate magic bytes,
* reject malformed or truncated PDFs,
* reject files above configured size limits,
* reject files above configured page-count policy where applicable,
* return stable machine-readable errors for rejected requests.

## 9.1.2 Durable Intake

Before queueing background work, the system must:

* store the original uploaded file durably,
* create exactly one upload session,
* bind the session to the authenticated actor,
* persist enough metadata to resume or audit later,
* generate a stable upload/session identifier,
* record original filename and upload timestamp,
* record source storage key,
* enqueue the first processing job only after durable session creation succeeds.

## 9.1.3 Idempotent Client Retry

If the client retries the upload request because of timeout, refresh, or network interruption:

* the system must not create duplicate committed library records,
* the system must not lose the original session linkage,
* duplicate detection policy must either:

  * resume the same session,
  * reject as duplicate,
  * or create a separately traceable new session with no harmful duplicate commit risk.

---

# 9.2 Queue and Orchestration Acceptance

## 9.2.1 Deterministic Job Ownership

For every job type:

* there must be one canonical job definition,
* the queue name must be known,
* the worker owner must be known,
* the worker must either:

  * handle every job type on the queue,
  * or separate job types by queue.

No accepted design may allow a worker to consume a job it cannot process correctly.

## 9.2.2 Required Job Types

At minimum, the orchestration layer must support:

* upload processing
* OCR fallback processing
* second-pass verification
* autonomous commit
* cleanup
* retry / repair-safe replay where designed

## 9.2.3 Retry Policy

Each job type must define:

* retryable failure classes,
* terminal failure classes,
* max retry count,
* backoff behavior,
* idempotency requirements,
* progress reporting expectations.

## 9.2.4 Job Truthfulness

A job may be marked complete only if its intended side effects were successfully performed and validated.

A job may not be treated as successful simply because no exception was thrown.

---

# 9.3 Processing Pipeline Acceptance

## 9.3.1 Stage A — Session Load

The processing worker must:

* load the session successfully,
* verify original storage object existence,
* verify session is in a processable state,
* prevent illegal duplicate processing where needed,
* record processing start time.

## 9.3.2 Stage B — PDF Analysis

The system must:

* inspect the original PDF,
* count pages correctly,
* detect text-layer presence,
* render page images as needed,
* extract per-page text where available,
* generate header crops or similar page-region signals where configured,
* persist enough intermediate data to support verification and debugging.

## 9.3.3 Stage C — Extraction Strategy Selection

The system must choose the correct strategy automatically:

* text-first when text layer is strong,
* OCR-enabled when text layer is absent or weak,
* vision-assisted when page semantics require image understanding,
* second-pass verification when first-pass confidence is below threshold,
* exception routing when safe automation is not possible.

The system must not require a human to decide which path to run in ordinary cases.

## 9.3.4 Stage D — Structured Understanding

The system must produce structured outputs that include, where derivable:

### Work-level

* title
* composer
* arranger
* publisher or source collection if present
* movement/work grouping if relevant
* whether the packet contains score, parts, or both
* confidence
* warnings
* extraction provenance

### Part-level

* instrument label
* canonical instrument
* instrument family
* transposition where relevant
* chair / part number
* whether the page group is a score or playable part
* page start
* page end
* display name
* normalized filename stem
* confidence
* extraction provenance

## 9.3.5 Structured Output Validity

Any LLM-produced structured result must:

* conform to a schema,
* be validated before use,
* be rejected or repaired if malformed,
* never be committed directly without validation,
* never be trusted solely because the provider returned HTTP 200.

---

# 9.4 Segmentation and Boundary Acceptance

## 9.4.1 Boundary Determination

The system must determine part boundaries using:

* deterministic rules where possible,
* text-layer signals where possible,
* OCR signals where needed,
* vision/header reasoning where needed,
* second-pass verification where ambiguity remains.

## 9.4.2 Boundary Validity Rules

Final cutting instructions must satisfy all of the following:

* every page belongs to either:

  * a defined part,
  * a defined score,
  * or an explicit leftover/unclassified state,
* no out-of-range page numbers,
* no negative indexes,
* no impossible page overlaps unless explicitly intended,
* no silent page loss,
* no unsignaled gap between classified pages where policy forbids it.

## 9.4.3 Multi-Part Packet Handling

The system must correctly handle:

* single part followed by another part,
* score followed by parts,
* parts followed by score,
* repeated instrument names,
* multiple chairs of same instrument,
* page-turn continuation without repeated title,
* cover sheets,
* blank separator pages,
* page number resets inside a combined packet,
* packets that include duplicates for rehearsal or replacement.

---

# 9.5 PDF Split Acceptance

## 9.5.1 Output Generation

For every accepted final boundary group, the system must:

* generate an individual PDF,
* verify it opens correctly,
* verify it contains at least one page,
* verify its page range matches the final instructions,
* upload it to storage,
* capture the resulting storage key,
* associate the generated asset with the session.

## 9.5.2 Output Naming

Every generated output file must have:

* deterministic naming,
* canonical instrument naming,
* canonical chair naming,
* valid filesystem-safe slug,
* stable extension,
* no disallowed characters,
* no ambiguous placeholder names in accepted autonomous commits.

## 9.5.3 Output Integrity

The system is not accepted if it can produce part PDFs that:

* are empty,
* contain the wrong pages,
* contain pages from the wrong part,
* are mislabeled as the wrong instrument,
* omit required pages,
* duplicate unintended pages,
* or cannot be opened by standard PDF readers.

---

# 9.6 Metadata Normalization Acceptance

## 9.6.1 Canonical Instrument Mapping

The system must normalize equivalent labels to a canonical form.

Examples of equivalence classes that must normalize consistently include, where relevant:

* Bb Clarinet / B♭ Clarinet / Clarinet in Bb / Clarinet in B-flat
* 1st Clarinet / First Clarinet / Clarinet 1 / Clarinet I
* Bass Clarinet / B. Cl. / Bs. Cl. where confidence supports the mapping
* Conductor / Full Score / Score where correct context supports the mapping

## 9.6.2 Required Normalization Rules

The normalization layer must address:

* unicode variants
* accidental notation variants
* roman numeral vs arabic numeral chair labels
* abbreviations
* punctuation variants
* whitespace noise
* capitalization noise
* common OCR substitutions
* common publisher formatting differences

## 9.6.3 Provenance Preservation

The system must preserve both:

* normalized value,
* raw extracted value,

for later troubleshooting or model improvement where useful.

---

# 9.7 Duplicate Detection Acceptance

## 9.7.1 Session-Level Duplicate Safety

The system must not create harmful duplicate results if:

* the client retries,
* the worker retries,
* the queue redelivers,
* the process restarts mid-commit,
* the same original file is uploaded again accidentally.

## 9.7.2 Library-Level Duplicate Policy

The system must define and enforce policy for:

* same original PDF uploaded twice,
* same work uploaded from slightly different filenames,
* same part names inside the same upload,
* same piece with revised metadata,
* same storage object referenced by retried commit,
* conflicting existing records in the library.

## 9.7.3 Required Behavior

For each duplicate class, the system must do one of the following explicitly:

* merge safely,
* reject safely,
* version safely,
* create a new distinct entity safely,
* or route to exception handling.

Silent duplicate pollution is not acceptable.

---

# 9.8 Autonomous Commit Acceptance

## 9.8.1 Commit Preconditions

The system may auto-commit only when all commit preconditions pass, including:

* session exists,
* original file exists,
* generated part assets exist,
* final structured metadata is valid,
* confidence thresholds are met,
* no unresolved validation errors remain,
* duplicate policy outcome is resolved,
* session is in a commit-eligible state.

## 9.8.2 Transactionality

Commit must be transactional across the DB operations that define library truth. If the transaction fails:

* no partial library state may remain,
* session must reflect failure or retry state truthfully,
* generated storage assets may remain temporarily only if cleanup policy and traceability are preserved.

## 9.8.3 Idempotency

If commit is retried:

* no duplicate music-piece records,
* no duplicate part rows,
* no duplicate file rows,
* no duplicate linkage rows,
* no session corruption.

## 9.8.4 Post-Commit

After successful commit, the system must:

* mark session completed,
* link all created records,
* persist final confidence and provenance as designed,
* record audit events,
* clean temporary artifacts according to policy,
* preserve enough state to support support/debugging.

---

# 9.9 Exception Workflow Acceptance

## 9.9.1 Exception Triggers

The system must route to exception handling when any of the following occurs:

* corrupt or unreadable PDF,
* storage fetch failure,
* OCR failure with no safe fallback,
* provider failure with no safe retry path,
* schema-invalid LLM output after repair attempts,
* contradictory boundary outputs,
* confidence below threshold,
* ambiguous part naming,
* impossible page grouping,
* duplicate conflict unresolved,
* commit preconditions fail,
* commit transaction fails repeatedly,
* output asset validation fails.

## 9.9.2 Exception State Requirements

An exception session must have:

* stable state,
* readable summary,
* machine-readable error code,
* failure stage,
* retryability flag,
* audit trail,
* visibility in admin monitoring.

## 9.9.3 Safety Rule

Exception sessions must **not** be auto-committed.

---

# 10. Provider-Specific Acceptance Criteria

# 10.1 Common Provider Criteria

Every provider integration must satisfy all of the following:

* provider value is supported in schema,
* config loader reads it correctly,
* admin UI can select and save it,
* secret handling is correct,
* connection test works,
* model discovery works or explicit model configuration is supported,
* structured-output path is defined,
* image/document input path is defined,
* timeout/retry behavior is defined,
* malformed output handling is defined,
* provider-specific parameter schema is defined,
* logging redacts secrets,
* capability mismatch is surfaced clearly.

---

# 10.2 OpenAI Acceptance

OpenAI support is accepted only if the system can:

* validate OpenAI configuration,
* discover or accept vision-capable models,
* send image-aware requests correctly,
* receive structured outputs safely,
* handle model-specific parameter support safely,
* distinguish auth failures, endpoint failures, and malformed output failures clearly. Official OpenAI docs show vision/image input and structured-output capabilities in the current API docs. ([OpenAI Platform][1])

---

# 10.3 Anthropic Acceptance

Anthropic support is accepted only if the system can:

* validate Anthropic keys and endpoint behavior,
* send image-aware requests correctly,
* handle Anthropic-specific headers and request formatting,
* validate structured outputs or strict schema-constrained responses where used,
* handle provider-specific error semantics cleanly. Anthropic documents image understanding and recommends structured outputs when guaranteed JSON conformance is needed. ([Claude API Docs][2])

---

# 10.4 Gemini Acceptance

Gemini support is accepted only if the system can:

* process image inputs,
* support structured output validation,
* support document-oriented workflows for PDF reasoning where used,
* distinguish model classes and preview limitations safely,
* avoid relying on unsupported parameter combinations. Google documents image input, structured outputs, and document processing for Gemini. ([Google AI for Developers][3])

---

# 10.5 OpenRouter Acceptance

OpenRouter support is accepted only if the system can:

* validate OpenRouter auth and endpoint routing,
* discover or accept compatible multimodal models,
* distinguish between router-layer issues and upstream model/provider issues,
* enforce structured-output validation,
* detect unsupported features on specific routed models safely. OpenRouter documents multimodal input and structured outputs for compatible models. ([OpenRouter][4])

---

# 10.6 Ollama / Ollama Cloud Acceptance

Ollama-class support is accepted only if the system can:

* connect to local or cloud endpoints,
* discover installed or available models where supported,
* distinguish native endpoint behavior from OpenAI-compatible behavior where applicable,
* avoid assuming unsupported JSON/vision capabilities,
* handle local model availability failures,
* degrade gracefully when model capacity is insufficient.

---

# 10.7 Custom OpenAI-Compatible Endpoint Acceptance

Custom provider support is accepted only if the system can:

* validate endpoint URL,
* validate auth mode,
* test a compatible health/model endpoint,
* document required API contract,
* fail safely when the endpoint is not truly OpenAI-compatible,
* apply strict schema validation before using returned structured data.

---

# 11. OCR Acceptance Criteria

# 11.1 Automatic OCR Invocation

OCR must run automatically when any of the following is true:

* text layer is absent,
* text layer coverage is below threshold,
* header extraction coverage is below threshold,
* confidence in segmentation is below threshold,
* image-only or scan-heavy PDF is detected,
* text is clearly corrupted or unusable.

## 11.2 OCR Integration

OCR output must feed back into the same Smart Upload session and be reusable by:

* metadata extraction,
* part-boundary detection,
* second-pass verification,
* exception diagnostics.

## 11.3 OCR Quality Safeguards

OCR must support:

* page-level confidence where available,
* partial-page/header-region OCR where configured,
* retry or alternative mode where policy allows,
* failure classification.

## 11.4 OCR Non-Acceptance Conditions

The system is not accepted if OCR exists but:

* is not automatically triggered,
* is not integrated into main pipeline decisions,
* requires a human to initiate it for normal scanned PDFs,
* or cannot influence final segmentation outcomes.

---

# 12. State Model Acceptance Criteria

A single canonical state model must be enforced across DB, API, workers, UI, and tests.

## 12.1 Required State Families

At minimum:

### Session Lifecycle

* uploaded
* queued
* processing
* awaiting_ocr
* awaiting_second_pass
* ready_to_commit
* committing
* completed
* needs_review
* failed
* rejected

### OCR Lifecycle

* not_needed
* queued
* processing
* completed
* failed

### Second-Pass Lifecycle

* not_needed
* queued
* processing
* completed
* failed

### Commit Lifecycle

* not_started
* queued
* processing
* completed
* failed

## 12.2 State Integrity Requirements

* all written states must be valid,
* all transitions must be legal,
* impossible combinations must be blocked,
* null vs enum-value drift is not allowed,
* UI labels must derive from canonical states,
* API responses must not invent alternate spellings.

The system is not accepted if multiple parts of the system represent the same state differently.

---

# 13. Security Acceptance Criteria

# 13.1 Auth and Permissions

All Smart Upload routes must enforce the correct current permission model consistently.

Acceptance fails if:

* any route uses legacy permission names that no longer align with current policy,
* preview or review endpoints are weaker than upload endpoints,
* session ownership or admin privileges are inconsistently enforced.

# 13.2 Secret Handling

The system must:

* store provider secrets safely,
* mask secrets in UI,
* preserve secrets correctly during partial settings updates,
* never return full secrets to client,
* never log secrets,
* separate provider-specific keys correctly.

# 13.3 Storage Safety

The system must:

* validate requested preview assets,
* prevent arbitrary file access,
* prevent path traversal or storage-key abuse,
* bind previews to session-scoped allowed assets,
* use signed URLs or equivalent controls correctly.

# 13.4 Input Safety

The system must:

* reject unsafe file types,
* reject malformed PDF payloads,
* protect against oversized inputs,
* enforce content validation before expensive processing,
* enforce rate limiting on expensive routes.

---

# 14. Observability Acceptance Criteria

# 14.1 Logging

The system must emit structured logs for:

* upload accepted
* session created
* job enqueued
* processing started
* OCR triggered
* second pass triggered
* segmentation produced
* part PDFs generated
* commit started
* commit completed
* exception triggered
* failure details
* cleanup completed

## 14.2 Correlation

Every log, progress event, and audit event must be correlatable by:

* session ID
* job ID
* actor ID where relevant
* timestamp
* stage

## 14.3 Metrics

Production acceptance requires metrics for:

* upload volume
* success rate
* exception rate
* OCR trigger rate
* second-pass trigger rate
* auto-commit rate
* average processing duration
* average pages per upload
* duplicate detection count
* provider failure count
* commit retry count

## 14.4 Audit

The system must record auditable events for:

* accepted upload
* provider selection/config use where appropriate
* autonomous commit
* exception routing
* manual review actions
* rejection
* cleanup

---

# 15. Performance and Capacity Acceptance Criteria

# 15.1 Route Behavior

The upload route must return promptly after durable intake and enqueue. It must not block on full processing.

# 15.2 Worker Behavior

Workers must:

* operate within defined memory limits,
* define timeouts,
* define concurrency,
* avoid unbounded PDF rendering,
* avoid unbounded OCR fan-out,
* avoid queue starvation.

# 15.3 Practical Performance Standard

The team must define environment-specific SLOs before production release, including:

* maximum accepted file size,
* maximum accepted page count,
* target P50 and P95 processing time,
* target success rate for normal uploads,
* retry rate thresholds,
* queue depth alert thresholds.

The system is not accepted if performance is unknown or unmanaged.

---

# 16. Admin and Operations Acceptance Criteria

The admin UI is accepted only as a **monitoring and exception tool**, not as required glue.

## 16.1 Upload UI

Must:

* submit files successfully,
* show truthful session status,
* show progress,
* show final outcome,
* surface machine-readable errors in human-usable form.

## 16.2 Review UI

Must:

* show exception sessions,
* support safe manual actions,
* never be required for ordinary successful uploads,
* display previews safely,
* show provenance and confidence.

## 16.3 Settings UI

Must:

* reflect current runtime truth,
* support provider switching safely,
* preserve masked secrets correctly,
* test provider connection correctly,
* show capability limitations clearly.

---

# 17. Edge-Case Acceptance Matrix

The system must be tested and accepted against the following edge-case families.

# 17.1 File and Transport Edge Cases

* zero-byte file
* truncated upload
* network interruption during upload
* duplicate client submission
* unsupported MIME type
* renamed non-PDF file with `.pdf`
* encrypted PDF
* corrupted PDF xref table
* extremely large PDF
* excessive page count
* file stored successfully but queue enqueue fails
* queue enqueue succeeds but client response is lost

# 17.2 Content Structure Edge Cases

* cover page before parts
* score first, then parts
* parts first, then score
* blank separator pages
* duplicate cover sheets
* repeated headers on every page
* no repeated headers after first page
* mixed orientation pages
* scanned pages mixed with digital pages
* pages with cropped or missing margins
* dark or low-contrast scans
* skewed scans
* handwritten markings
* stamps / library markings
* publisher watermarks
* rotated pages
* duplex scan artifacts
* missing page numbers
* repeated page numbers
* movement changes inside one packet
* instrument changes mid-packet
* multiple copies of same part for stands
* percussion packets with multiple instruments
* piano/conductor reduction pages mixed with player parts

# 17.3 Metadata Ambiguity Edge Cases

* title on cover only
* title split across lines
* composer missing
* arranger present but composer absent
* ambiguous abbreviations
* OCR confusion between numerals and letters
* clarinet chair labels as roman numerals
* transposition embedded in subtitle
* inconsistent instrument label across pages
* score mislabeled as part by raw text
* same part name appearing twice with different page ranges

# 17.4 Provider and Model Edge Cases

* invalid API key
* expired API key
* endpoint timeout
* model not found
* provider returns 200 with malformed JSON
* provider returns partial structured output
* provider supports images but not strict schema
* provider supports schema but chosen model does not
* provider rate limit
* provider intermittent 5xx
* model downgraded or deprecated
* local model missing vision capability
* OpenAI-compatible endpoint that is not actually compatible
* router provider returns upstream capability mismatch

# 17.5 Queue and Worker Edge Cases

* job delivered twice
* worker crash mid-render
* worker crash after split but before commit
* worker crash after commit but before status update
* queue backlog
* queue event stream interruption
* wrong worker consumes wrong job
* retry during partial artifact presence
* dead-letter overflow or silent failure

# 17.6 Storage and DB Edge Cases

* original upload stored but later unavailable
* part PDF upload failure
* signed URL generation failure
* DB transaction deadlock
* unique-constraint collision on commit
* existing library record conflict
* cleanup failure after successful commit
* orphaned storage assets after failed commit
* DB success but event publication failure
* storage success but DB rollback

The system is not accepted unless each edge-case family has an explicit expected outcome and test coverage commensurate with its risk.

---

# 18. Testing Exit Criteria

# 18.1 Unit Tests Required

Must cover at minimum:

* settings schema validation
* provider-to-secret mapping
* provider-to-endpoint mapping
* state transition validation
* metadata normalization
* filename generation
* boundary validation
* duplicate detection logic
* commit precondition checks

# 18.2 Integration Tests Required

Must cover at minimum:

* upload route acceptance/rejection
* settings save/load/masked secret preservation
* provider connection test route
* model discovery route
* worker processing flow
* OCR orchestration
* second-pass orchestration
* commit transaction behavior
* preview safety
* exception routing

# 18.3 End-to-End Tests Required

Must include at minimum:

## E2E-01 Happy Path, Text-Layer PDF

* upload succeeds
* processing completes
* boundaries are correct
* part PDFs are generated
* metadata is normalized
* auto-commit completes
* DB rows are correct
* assets are linked
* session ends completed

## E2E-02 Happy Path, Scanned PDF Requiring OCR

* OCR triggers automatically
* OCR output influences boundary detection
* part PDFs are correct
* metadata is acceptable
* auto-commit completes safely

## E2E-03 Ambiguous Packet Requiring Second Pass

* second pass triggers automatically
* second pass either resolves safely or routes to exception
* no unsafe auto-commit occurs

## E2E-04 Provider Failure

* failure is classified
* retry occurs if configured
* terminal state is visible if retries exhausted
* no partial commit corruption

## E2E-05 Duplicate/Retry Safety

* upload retry or job retry does not create duplicate records or assets

## E2E-06 Crash Recovery

* worker restart or crash mid-pipeline does not corrupt final state

## E2E-07 Existing Library Conflict

* duplicate policy is enforced safely
* no silent pollution occurs

No production release is accepted without end-to-end autonomous ingest proof.

---

# 19. Production Readiness Gate

The system may be released to production only when all of the following are true:

## 19.1 Functional Gate

Normal uploads complete autonomously.

## 19.2 Data Gate

Outputs are normalized, linked, and correct.

## 19.3 Safety Gate

No lost-job, unsafe-commit, or duplicate-commit defect remains open.

## 19.4 Security Gate

Permissions, secrets, file access, and route protections are correct.

## 19.5 Reliability Gate

Retries, failures, and crash recovery behave safely.

## 19.6 Observability Gate

Operators can diagnose failures without reading raw unstructured logs only.

## 19.7 Testing Gate

Unit, integration, and required end-to-end tests pass.

## 19.8 Operational Gate

Deployment wiring, workers, queues, storage, migrations, and seed/config behavior are aligned with runtime.

If any one gate fails, release must be blocked.

---

# 20. Explicit Non-Acceptance Conditions

Smart Upload must be considered **not accepted** if any of the following remain true:

* ordinary uploads still require manual approval,
* OCR exists but is not automatically orchestrated,
* queue routing can lose or skip jobs,
* worker retries can duplicate records or files,
* state values drift across DB/API/UI/workers,
* provider support is inconsistent across schema/UI/runtime,
* metadata normalization is inconsistent,
* part PDFs cannot be trusted without routine human checking,
* commit is not transactionally safe,
* failure modes are not visible,
* duplicate policy is undefined,
* end-to-end autonomous tests do not exist.

---

# 21. Final Acceptance Statement

Smart Upload is accepted only when it functions as a **complete, automated enterprise workflow** for music-library digitization:

* secure,
* autonomous in ordinary cases,
* exception-safe in ambiguous cases,
* provider-flexible,
* schema-validated,
* idempotent,
* observable,
* transactionally correct,
* operationally supportable,
* and proven by end-to-end tests.

Anything less is not “done”; it is only a partial implementation.

---

[1]: https://platform.openai.com/docs/api-reference/responses/list?utm_source=chatgpt.com "Responses | OpenAI API Reference"
[2]: https://docs.anthropic.com/en/docs/build-with-claude/vision?utm_source=chatgpt.com "Vision - Claude API Docs"
[3]: https://ai.google.dev/gemini-api/docs/structured-output?utm_source=chatgpt.com "Structured outputs | Gemini API - Google AI for Developers"
[4]: https://openrouter.ai/docs/guides/overview/multimodal/overview?utm_source=chatgpt.com "OpenRouter Multimodal | Complete Documentation"
