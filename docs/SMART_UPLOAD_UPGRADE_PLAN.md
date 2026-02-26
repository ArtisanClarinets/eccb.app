# Smart Upload Upgrade Plan: Towards 100% Autonomous Ingestion

**Document Version:** 1.0
**Date:** 2026-02-26
**Author:** GitHub Copilot

## 1. Vision & Goals

The goal is to evolve the Smart Upload system from a semi-automated metadata extraction tool into a **fully autonomous, zero-touch music library ingestion pipeline**. 

The system should, without human intervention (unless confidence is critically low):
1.  **Extract** all relevant metadata with high accuracy.
2.  **Verify** the extracted data through a multi-pass process.
3.  **Identify** all individual instrument parts within a multi-part PDF.
4.  **Split** the source PDF into separate, correctly named files for each part.
5.  **Auto-configure** itself with free-tier LLM providers where possible to minimize cost.

---

## 2. Phased Implementation Plan

This is a large-scale project. It will be broken down into four distinct phases to manage complexity and deliver value incrementally.

### Phase 1: Foundational Fixes & Reliability (Current Sprint)

This phase addresses immediate bugs, improves the existing foundation, and enhances provider configuration.

**Tasks:**

1.  **Fix Provider Connection Tests:**
    -   [x] **Gemini:** Update test logic to query a specific model endpoint (`/models/gemini-pro-vision`) instead of the list endpoint (`/models`).
    -   **Audit All Providers:** Review and verify the test connection logic for Ollama, OpenAI, Anthropic, and OpenRouter to ensure they use the correct API endpoints and authentication methods.

2.  **Resolve Save (PUT) Failures:**
    -   [x] **Root Cause:** Identified as a likely stale Next.js dev server process.
    -   **Action:** Instruct user to restart the dev server. No code changes are required as the endpoint and form are correctly configured.

3.  **Enhance Multi-Pass Verification:**
    -   **Concept:** Introduce a third, more powerful "Adjudicator" pass.
    -   **Pass 1 (Vision - *as-is*):** Fast, initial extraction.
    -   **Pass 2 (Verification - *as-is*):** Quick correction of simple errors.
    -   **Pass 3 (Adjudicator - *New*):** Triggered if confidence from Pass 2 is < 85%. Uses a more powerful model (e.g., GPT-4o, Claude 3.5 Sonnet) with a chain-of-thought prompt to perform deep reasoning.
        -   **Cross-references data:** (e.g., "This says Clarinet, but the key is C. Is this a C Clarinet part or a transposition error?").
        -   **Fills in missing metadata:** Infer `genre`, `difficulty`, or `year` based on title and composer.
        -   **Outputs a final "adjudicated" JSON object** with a reason for every change made.

4.  **Auto-Configuration for Free LLM Tiers:**
    -   **Goal:** Simplify setup for users without expensive API subscriptions.
    -   **UI:** Add a "Discover & Configure Free Providers" button to the settings page.
    -   **API Endpoint (`/api/admin/uploads/providers/discover`):**
        -   This new endpoint will contain logic to query APIs of providers known to have free tiers (e.g., OpenRouter, Google AI Studio).
        -   It will fetch lists of free-to-use vision models.
    -   **Provider Metadata:** Update `src/lib/llm/providers.ts` to include information about free tiers and how to access them.
    -   **Automatic Setup:** For providers like OpenRouter, the system can pre-fill the recommended free models (`google/gemini-2.0-flash-exp:free`) automatically after the user provides an API key.

---

### Phase 2: Autonomous Part Splitting (Next Sprint)

This is the core feature enhancement to achieve full automation.

**Tasks:**

1.  **Upgrade Vision Prompt for Part Identification:**
    -   Modify the `DEFAULT_VISION_SYSTEM_PROMPT` to require a more structured output for parts.
    -   The prompt must instruct the LLM to return a `parts` array, where each object contains:
        ```json
        {
          "instrument": "Bb Clarinet",
          "chair": "1st",
          "page_start": 2,
          "page_end": 3
        }
        ```

2.  **Integrate a PDF Manipulation Library:**
    -   **Technology:** `pdf-lib` (a robust, server-side Node.js library).
    -   **Installation:** `npm install pdf-lib`.

3.  **Create the PDF Splitting Service:**
    -   **Location:** `src/lib/smart-upload/pdf-splitter.ts`.
    -   **Function:** `async function splitPdfByParts(sourcePdfBuffer, partsMetadata)`.
    -   **Logic:**
        1.  Load the source PDF into `pdf-lib`.
        2.  Iterate through the `partsMetadata` array from the LLM.
        3.  For each part, create a new PDF document.
        4.  Copy the specified pages (`page_start` to `page_end`) from the source document to the new document.
        5.  Return an array of `{ filename, pdfBuffer }` objects.

4.  **Develop Background Job Orchestration:**
    -   **Technology:** BullMQ (already in the tech stack).
    -   **New Queue:** Create a `smart-upload-processing` queue.
    -   **Workflow:**
        1.  After the main Smart Upload API call completes metadata extraction, it **does not** immediately split the PDF.
        2.  Instead, it adds a job to the `smart-upload-processing` queue with the `uploadSessionId` and the extracted `parts` metadata.
        3.  A separate BullMQ worker will process this job.

5.  **Create the BullMQ Worker:**
    -   **Location:** `src/workers/smart-upload-processor.ts`.
    -   **Logic:**
        1.  Receive the job.
        2.  Fetch the original PDF from blob storage.
        3.  Call the `pdf-splitter.ts` service.
        4.  Generate filenames based on metadata (e.g., `Symphony_No_5-1st_Bb_Clarinet.pdf`).
        5.  Save the newly created PDF files back to blob storage, associated with the parent `MusicPiece`.
        6.  Update the `SmartUploadSession` status to `PROCESSED`.

---

### Phase 3: Advanced Automation & UI (Future Sprint)

This phase focuses on refining the automation and providing better feedback to the user.

**Tasks:**

1.  **UI for Part Management:**
    -   In the Music Library view, update the UI to show a list of all child PDF parts associated with a `MusicPiece`.
    -   Allow users to download individual parts or the original combined PDF.

2.  **Confidence-Based Workflow:**
    -   **Fully Autonomous Mode:** Introduce a new system setting: "Enable Fully Autonomous Mode".
    -   **Logic:** If this setting is `true`, and the final adjudicated confidence score is >= 95%, the system will **automatically approve the upload and create the `MusicPiece` and split parts** without any human review.
    -   Uploads with scores < 95% will still appear in the "Pending Review" queue.

3.  **Feedback Loop for AI Improvement:**
    -   When an admin makes a correction in the Review UI, save the "before" and "after" metadata.
    -   This data can be used later to fine-tune a custom model or to generate few-shot examples for prompts to improve accuracy on common errors.

---

### Phase 4: Future Vision & Intelligence

This phase focuses on next-generation capabilities.

**Tasks:**

1.  **External Knowledge Integration:**
    -   For ambiguous metadata (e.g., composer "J. Williams" on a piece titled "Star Wars"), the Adjudicator pass could be enhanced to perform a web search via an API (e.g., Serper) to confirm the identity ("Is John Williams the composer of Star Wars?").

2.  **Duplicate Detection:**
    -   Before creating a new `MusicPiece`, use vector embeddings of the title and composer to find potential duplicates already in the library.
    -   If a likely duplicate is found, flag it for human review instead of auto-approving.

3.  **Automated OMR (Optical Music Recognition):**
    -   For scanned (image-based) PDFs, integrate an OMR tool to convert the music into a digital format (e.g., MusicXML) for even deeper analysis. This is a highly advanced feature.

---

## 3. Configuration & Settings Changes

The `SmartUploadSettingsSchema` will be updated to include:
- `llm_adjudicator_model`: The model to use for the new 3rd pass.
- `enable_fully_autonomous_mode`: A boolean to enable/disable zero-touch processing.
- `autonomous_approval_threshold`: The confidence score (e.g., 95) required for auto-approval.

This structured, phased approach will allow us to deliver your vision for a fully autonomous system reliably and effectively.
