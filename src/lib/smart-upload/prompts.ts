// src/lib/smart-upload/prompts.ts
// ============================================================
// Centralized Smart Upload prompt templates.
// System prompts define behavior; user prompts define task input/output.
// ============================================================

export const PROMPT_VERSION = '2.0.0';

// =============================================================================
// System Prompts
// =============================================================================

export const DEFAULT_VISION_SYSTEM_PROMPT =
  'You are an expert music librarian and sheet-music metadata extractor. Be precise, deterministic, and schema-compliant.';

export const DEFAULT_VERIFICATION_SYSTEM_PROMPT =
  'You are a strict verification assistant. Reconcile metadata against provided pages and return corrected JSON only.';

export const DEFAULT_HEADER_LABEL_SYSTEM_PROMPT =
  'You identify instrument-part labels from sheet-music page header crops with high precision.';

export const DEFAULT_ADJUDICATOR_SYSTEM_PROMPT =
  'You are a senior adjudicator that resolves disagreements between extraction passes and produces a single final JSON decision.';

// =============================================================================
// User Prompt Templates
// =============================================================================

export const DEFAULT_VISION_USER_PROMPT_TEMPLATE = `Analyze the sampled score pages and return ONE JSON object.

Context:
- Total pages in original PDF: {{totalPages}}
- Sampled pages provided: {{sampledPages}}
- Sampled page labels: {{pageList}}

Rules:
1. Page labels are authoritative ("Original Page 1" is the first page of the PDF).
2. All page ranges MUST be 1-indexed.
3. cuttingInstructions must cover all pages exactly once (no gaps, no overlaps).
4. Return valid JSON only (no markdown fences).

Required object schema:
{
  "title": string,
  "subtitle": string | null,
  "composer": string | null,
  "arranger": string | null,
  "publisher": string | null,
  "copyrightYear": number | null,
  "ensembleType": string | null,
  "keySignature": string | null,
  "timeSignature": string | null,
  "tempo": string | null,
  "fileType": "FULL_SCORE" | "CONDUCTOR_SCORE" | "CONDENSED_SCORE" | "PART",
  "isMultiPart": boolean,
  "parts": [
    {
      "instrument": string,
      "partName": string,
      "section": "Woodwinds" | "Brass" | "Percussion" | "Strings" | "Keyboard" | "Vocals" | "Score" | "Other",
      "transposition": "C" | "Bb" | "Eb" | "F" | "G" | "D" | "A",
      "partNumber": number
    }
  ],
  "cuttingInstructions": [
    {
      "partName": string,
      "instrument": string,
      "section": string,
      "transposition": string,
      "partNumber": number,
      "pageRange": [number, number]
    }
  ],
  "totalPageCount": number,
  "confidenceScore": number,
  "notes": string | null
}`;

export const DEFAULT_VERIFICATION_USER_PROMPT_TEMPLATE = `Verify and, if needed, correct extracted metadata against the provided images.

Context:
- Total pages: {{pageCount}}
- Original metadata JSON:
{{originalMetadataJson}}

Rules:
1. Page labels are authoritative and 1-indexed.
2. Keep correct values unchanged; only correct incorrect values.
3. cuttingInstructions must cover all pages exactly once (no gaps, no overlaps).
4. Return JSON only.

Return a JSON object containing corrected metadata fields plus:
- "verificationConfidence": integer 0-100
- "corrections": string | null`;

export const DEFAULT_HEADER_LABEL_USER_PROMPT_TEMPLATE = `You are given header-crop images from multiple pages.

Page labels for this batch:
{{pageLabels}}

Rules:
1. Each image is labeled "Page N" and page numbers are 1-indexed.
2. Return one output entry for each provided page label.
3. If unreadable, set label to null and confidence to 0.
4. Return JSON only.

Return exactly this JSON shape:
[
  { "page": 1, "label": "Bb Clarinet 1", "confidence": 95 }
]`;

export const DEFAULT_ADJUDICATOR_USER_PROMPT_TEMPLATE = `Adjudicate first-pass and second-pass extraction outputs and produce a final result.

Context:
- Total pages: {{pageCount}}
- First-pass metadata:
{{firstPassMetadata}}

- Second-pass metadata:
{{secondPassMetadata}}

- Identified Disagreements:
{{disagreements}}

Rules:
1. Prefer values supported by explicit page evidence.
2. Keep confirmed values unchanged.
3. cuttingInstructions must remain 1-indexed and fully cover pages.
4. Return JSON only.

Return:
{
  "adjudicatedMetadata": { ...same structure as extraction metadata... },
  "adjudicationNotes": string | null,
  "finalConfidence": number,
  "requiresHumanReview": boolean
}`;

// Backward-compatible aliases for existing settings keys/usages.
export const DEFAULT_HEADER_LABEL_PROMPT = DEFAULT_HEADER_LABEL_USER_PROMPT_TEMPLATE;
export const DEFAULT_ADJUDICATOR_PROMPT = DEFAULT_ADJUDICATOR_USER_PROMPT_TEMPLATE;

// =============================================================================
// Prompt Builder Functions
// =============================================================================

/**
 * Build the first-pass user prompt from template/context.
 */
export function buildVisionPrompt(
  template: string,
  context: {
    totalPages: number;
    sampledPageNumbers: number[];
  }
): string {
  const safeTemplate = template?.trim() || DEFAULT_VISION_USER_PROMPT_TEMPLATE;
  const pageList = context.sampledPageNumbers.map((n) => n + 1).join(', ');

  return safeTemplate
    .replace(/{{totalPages}}/g, String(context.totalPages))
    .replace(/{{pageList}}/g, pageList)
    .replace(/{{sampledPages}}/g, String(context.sampledPageNumbers.length));
}

/**
 * Build the second-pass user prompt from template/context.
 */
export function buildVerificationPrompt(
  template: string,
  context: {
    originalMetadata: Record<string, unknown>;
    pageCount: number;
  }
): string {
  const safeTemplate = template?.trim() || DEFAULT_VERIFICATION_USER_PROMPT_TEMPLATE;
  return safeTemplate
    .replace(/{{pageCount}}/g, String(context.pageCount))
    .replace(/{{originalMetadataJson}}/g, JSON.stringify(context.originalMetadata, null, 2));
}

/**
 * Build the header-label pass user prompt from template/context.
 */
export function buildHeaderLabelPrompt(
  template: string,
  context: {
    pageNumbers: number[];
  }
): string {
  const safeTemplate = template?.trim() || DEFAULT_HEADER_LABEL_USER_PROMPT_TEMPLATE;
  const labels = context.pageNumbers.map((pageNumber) => `Page ${pageNumber}`).join(', ');
  return safeTemplate.replace(/{{pageLabels}}/g, labels);
}

/**
 * Build the third-pass adjudicator user prompt from template/context.
 */
export function buildAdjudicatorPrompt(
  template: string,
  context: {
    firstPassMetadata: Record<string, unknown>;
    secondPassMetadata: Record<string, unknown>;
    disagreements: string[];
    pageCount: number;
  }
): string {
  const safeTemplate = template?.trim() || DEFAULT_ADJUDICATOR_USER_PROMPT_TEMPLATE;
  return safeTemplate
    .replace(/{{firstPassMetadata}}/g, JSON.stringify(context.firstPassMetadata, null, 2))
    .replace(/{{secondPassMetadata}}/g, JSON.stringify(context.secondPassMetadata, null, 2))
    .replace(/{{disagreements}}/g, context.disagreements.join('\n'))
    .replace(/{{pageCount}}/g, String(context.pageCount));
}

// =============================================================================
// Prompt Reset / Initialization
// =============================================================================

/**
 * Get default prompts as a settings record
 */
export function getDefaultPromptsRecord(): Record<string, string> {
  return {
    llm_vision_system_prompt: DEFAULT_VISION_SYSTEM_PROMPT,
    llm_verification_system_prompt: DEFAULT_VERIFICATION_SYSTEM_PROMPT,
    llm_header_label_prompt: DEFAULT_HEADER_LABEL_PROMPT,
    llm_adjudicator_prompt: DEFAULT_ADJUDICATOR_PROMPT,
    llm_prompt_version: PROMPT_VERSION,
  };
}

/**
 * Check if prompts need reset (empty or version mismatch)
 */
export function promptsNeedReset(currentSettings: Record<string, string>): boolean {
  const hasVisionPrompt = !!currentSettings.llm_vision_system_prompt?.trim();
  const hasVerificationPrompt = !!currentSettings.llm_verification_system_prompt?.trim();
  const versionMatch = currentSettings.llm_prompt_version === PROMPT_VERSION;

  return !hasVisionPrompt || !hasVerificationPrompt || !versionMatch;
}
