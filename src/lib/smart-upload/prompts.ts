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
  'You identify instrument-part labels from sheet-music page header crops with high precision. '
  + 'When a page header is unreadable or contains no instrument name, you MUST return a JSON null value — '
  + 'never return the string "null", "none", "unknown", "n/a", or any similar placeholder. '
  + 'A JSON null means the page label is absent. A non-null string means you are confident the text is a real instrument name.';

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
3. Focus exclusively on the instrument or part name visible in the page header (e.g. "1st Bb Clarinet", "Tuba", "Percussion").
   - Ignore title text, composer names, copyright notices, and measure numbers.
4. If the header is unreadable or shows no instrument name, set label to JSON null (not the string "null") and confidence to 0.
5. NEVER return the string literals "null", "none", "unknown", "n/a" as a label value — use JSON null instead.
6. Common instrument families for reference: Piccolo, Flute, Oboe, Bassoon, Eb Clarinet, Bb Clarinet, Bass Clarinet,
   Alto Saxophone, Tenor Saxophone, Baritone Saxophone, Trumpet, Cornet, F Horn, Trombone, Euphonium, Tuba,
   Timpani, Percussion, Mallet Percussion, String Bass, Piano, Full Score, Conductor Score, Condensed Score.
7. Return JSON only.

Return exactly this JSON shape:
[
  { "page": 1, "label": "Bb Clarinet 1", "confidence": 95 },
  { "page": 2, "label": null, "confidence": 0 }
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
// PDF-to-LLM Prompt Template (Enterprise)
// =============================================================================

/**
 * When sending the full PDF natively to the LLM (Gemini / Anthropic),
 * we can skip the per-page sampling verbiage and ask for full analysis.
 */
export const DEFAULT_PDF_VISION_USER_PROMPT_TEMPLATE = `Analyze the attached PDF document of sheet music and return ONE JSON object.

Context:
- Total pages in the PDF: {{totalPages}}

Rules:
1. All page ranges MUST be 1-indexed and inclusive on both ends.
2. cuttingInstructions must cover ALL {{totalPages}} pages exactly once (no gaps, no overlaps).
3. Each cuttingInstruction MUST include a "pageRange" field as [firstPage, lastPage].
4. Return valid JSON only (no markdown fences, no prose).

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
  "confidenceScore": number,
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
      "section": "Woodwinds" | "Brass" | "Percussion" | "Strings" | "Keyboard" | "Vocals" | "Score" | "Other",
      "transposition": "C" | "Bb" | "Eb" | "F" | "G" | "D" | "A",
      "partNumber": number,
      "pageRange": [number, number]
    }
  ],
  "totalPageCount": number,
  "notes": string | null
}`;

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
 * Build the PDF-to-LLM first-pass prompt (enterprise mode).
 * Used when sending the full PDF document natively to the provider.
 */
export function buildPdfVisionPrompt(
  template: string | undefined,
  context: { totalPages: number },
): string {
  const safeTemplate = template?.trim() || DEFAULT_PDF_VISION_USER_PROMPT_TEMPLATE;
  return safeTemplate.replace(/{{totalPages}}/g, String(context.totalPages));
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
