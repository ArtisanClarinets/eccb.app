/**
 * Smart Upload Processor Worker
 *
 * Handles the main Smart Upload pipeline with OCR-first architecture:
 *
 * 1. Download PDF
 * 2. Extract text layer → deterministic part-boundary detection
 * 3. If deterministic segmentation confidence ≥ threshold:
 *    → OCR-first path: extract title/composer from text layer + filename
 *    → Skip LLM entirely (zero API calls, zero cost)
 * 4. Otherwise, fall back to LLM:
 *    → Send entire PDF (or rendered images) for AI analysis
 * 5. Validate cutting instructions
 * 6. Split PDF into parts
 * 7. Quality gates for auto-commit eligibility
 * 8. Route: auto-commit, second-pass, or human review
 */

import { Job } from 'bullmq';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/db';
import { downloadFile, uploadFile } from '@/lib/services/storage';
import { renderPdfHeaderCropBatch, renderPdfPageBatch, clearRenderCache } from '@/lib/services/pdf-renderer';
import { callVisionModel } from '@/lib/llm';
import { loadSmartUploadRuntimeConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';
import type { LLMRuntimeConfig } from '@/lib/llm/config-loader';
import {
  toOneIndexed,
  validateAndNormalizeInstructions,
  buildGapInstructions,
} from '@/lib/services/cutting-instructions';
import { splitPdfByCuttingInstructions, validatePdfBuffer } from '@/lib/services/pdf-splitter';
import { extractPdfPageHeaders } from '@/lib/services/pdf-text-extractor';
import { detectPartBoundaries } from '@/lib/services/part-boundary-detector';
import { extractOcrFallbackMetadata } from '@/lib/services/ocr-fallback';
import { segmentByHeaderImages, preprocessForOcr } from '@/lib/services/header-image-segmentation';
import { labelPages, type PageLabelerResult } from '@/lib/services/page-labeler';
import { buildAdapterConfigForStep, type LLMStepName } from '@/lib/llm/config-loader';
import {
  queueSmartUploadSecondPass,
  queueSmartUploadAutoCommit,
  SmartUploadJobProgress,
} from '@/lib/jobs/smart-upload';
import { buildPartFilename, buildPartStorageSlug, normalizeInstrumentLabel } from '@/lib/smart-upload/part-naming';
import { evaluateQualityGates, isForbiddenLabel } from '@/lib/smart-upload/quality-gates';
import { parseJsonLenient } from '@/lib/smart-upload/json';
import { createSessionBudget } from '@/lib/smart-upload/budgets';
import { getProviderMeta } from '@/lib/llm/providers';
import type { LabeledDocument } from '@/lib/llm/types';
import { sanitizeCuttingInstructionsForSplit } from '@/lib/services/cutting-instructions';
import { logger } from '@/lib/logger';
import { deepCloneJSON } from '@/lib/json';
import {
  buildHeaderLabelPrompt,
  buildPdfVisionPrompt,
  buildVisionPrompt,
  DEFAULT_HEADER_LABEL_SYSTEM_PROMPT,
  DEFAULT_PDF_VISION_USER_PROMPT_TEMPLATE,
  DEFAULT_VISION_SYSTEM_PROMPT,
  DEFAULT_VISION_USER_PROMPT_TEMPLATE,
  PROMPT_VERSION,
} from '@/lib/smart-upload/prompts';
import type {
  CuttingInstruction,
  ExtractedMetadata,
  ParsedPartRecord,
  RoutingDecision,
  SecondPassStatus,
} from '@/types/smart-upload';
import type { SmartUploadProcessData } from '@/lib/jobs/smart-upload';

// =============================================================================
// Constants
// =============================================================================

const MAX_SAMPLED_PAGES = 8; // hard cap for vision pass
/** Maximum header-crop images sent to LLM in a single call.
 *  Providers with small context windows (GPT-4V, Groq) can struggle with >20
 *  images; Gemini handles much more, but batching keeps costs predictable. */
const MAX_HEADER_CROP_BATCH_SIZE = 30;

// =============================================================================
// Vision System Prompt
// =============================================================================

// =============================================================================
// Helper Functions
// =============================================================================

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Duplicate helper used elsewhere; keeps logging safe without leaking stack or data.
function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function safeErrorDetails(err: unknown) {
  const e = asError(err);
  return {
    errorMessage: e.message,
    errorName: e.name,
    errorStack: e.stack,
  };
}

/**
 * Select representative pages from a PDF for LLM analysis.
 * - Always includes the first 2 pages (cover + first music page)
 * - For docs > MAX_SAMPLED_PAGES pages: samples evenly, always includes the last page
 * Returns base64-encoded PNG images in page order.
 */
async function samplePdfPages(
  pdfBuffer: Buffer,
  cacheTag?: string,
): Promise<{ images: string[]; totalPages: number; sampledIndices: number[] }> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  let indices: number[];
  if (totalPages <= MAX_SAMPLED_PAGES) {
    indices = Array.from({ length: totalPages }, (_, i) => i);
  } else {
    const fixed = [0, 1, totalPages - 1];
    const remaining = MAX_SAMPLED_PAGES - fixed.length;
    const step = Math.floor((totalPages - 3) / (remaining + 1));
    const interior: number[] = [];
    for (let i = 1; i <= remaining; i++) {
      const idx = 1 + i * step;
      if (idx < totalPages - 1) interior.push(idx);
    }
    indices = [...new Set([...fixed, ...interior])].sort((a, b) => a - b);
  }

  const images = await renderPdfPageBatch(pdfBuffer, indices, {
    scale: 2,
    maxWidth: 1024,
    quality: 85,
    format: 'png',
    cacheTag,
  });

  logger.info('PDF pages sampled for LLM', {
    totalPages,
    sampledCount: images.length,
    indices,
  });

  return { images, totalPages, sampledIndices: indices };
}

// isForbiddenLabel is now imported from '@/lib/smart-upload/quality-gates'

interface HeaderLabelEntry {
  page: number;
  label: string | null;
  confidence: number;
}

function parseHeaderLabelResponse(content: string): HeaderLabelEntry[] {
  const result = parseJsonLenient<unknown[]>(content, 'array');
  if (!result.ok) {
    logger.warn('parseHeaderLabelResponse: JSON extraction failed', {
      error: result.error,
    });
    return [];
  }

  return (result.value as unknown[])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const value = entry as Record<string, unknown>;
      const page = Number(value.page);
      const confidence = Number(value.confidence);
      const rawLabel =
        typeof value.label === 'string' && value.label.trim().length > 0
          ? value.label.trim()
          : null;
      // Treat sentinel strings returned by the LLM as absent labels so they
      // never propagate into segmentation as fake instrument names.
      const label = rawLabel && !isForbiddenLabel(rawLabel) ? rawLabel : null;

      if (!Number.isFinite(page) || !Number.isInteger(page) || page < 1) {
        return null;
      }

      return {
        page,
        label,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(100, Math.round(confidence)))
          : 0,
      };
    })
    .filter((entry): entry is HeaderLabelEntry => entry !== null);
}

function toOneIndexedInstructions(instructions: CuttingInstruction[]): CuttingInstruction[] {
  return instructions.map((instruction) => ({
    ...instruction,
    pageRange: toOneIndexed(instruction.pageRange),
  }));
}



/**
 * Normalize a confidence value to the 0-100 integer scale.
 * LLMs sometimes return values on a 0-1 probability scale (e.g., 0.9 for 90%).
 * This function detects fractional values strictly less than 1 and converts them.
 */
function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  // Detect 0-1 probability scale: fractional values > 0 and < 1
  // A value of exactly 1 is treated as 1% (not 100%) — the prompt
  // instructs the LLM to return "integer 0-100".
  if (value > 0 && value < 1) {
    return Math.round(value * 100);
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseVisionResponse(content: string, totalPages: number): ExtractedMetadata {
  const result = parseJsonLenient<Record<string, unknown>>(content, 'object');
  if (!result.ok) {
    logger.error('parseVisionResponse: JSON extraction failed', {
      error: result.error,
    });
    return buildFallbackMetadata(totalPages);
  }

  const parsed = result.value;

  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : 'Unknown Title';

  const confidenceScore = normalizeConfidence(parsed.confidenceScore);

  const isMultiPart = parsed.isMultiPart === true;

  const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];
  const parts = rawParts.map((p: unknown, i: number) => {
    const part = (p ?? {}) as Record<string, unknown>;
    return {
      instrument:
        typeof part.instrument === 'string' ? part.instrument.trim() : `Unknown Part ${i + 1}`,
      partName: typeof part.partName === 'string' ? part.partName.trim() : `Part ${i + 1}`,
      section: typeof part.section === 'string' ? part.section : 'Other',
      transposition: typeof part.transposition === 'string' ? part.transposition : 'C',
      partNumber: typeof part.partNumber === 'number' ? part.partNumber : i + 1,
    };
  });

  const rawCuts = Array.isArray(parsed.cuttingInstructions) ? parsed.cuttingInstructions : [];
  const cuttingInstructions = rawCuts
    .map((c: unknown) => {
      const cut = (c ?? {}) as Record<string, unknown>;
      const pageRange =
        Array.isArray(cut.pageRange) && cut.pageRange.length >= 2
          ? ([Number(cut.pageRange[0]), Number(cut.pageRange[1])] as [number, number])
          : null;
      if (!pageRange || isNaN(pageRange[0]) || isNaN(pageRange[1])) return null;
      return {
        partName: typeof cut.partName === 'string' ? cut.partName.trim() : 'Unknown',
        instrument: typeof cut.instrument === 'string' ? cut.instrument.trim() : 'Unknown',
        section: (typeof cut.section === 'string' ? cut.section : 'Other') as CuttingInstruction['section'],
        transposition: (typeof cut.transposition === 'string' ? cut.transposition : 'C') as CuttingInstruction['transposition'],
        partNumber: typeof cut.partNumber === 'number' ? cut.partNumber : 1,
        pageRange,
      } satisfies CuttingInstruction;
    })
    .filter((c): c is CuttingInstruction => c !== null);

  return {
    title,
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
    composer: typeof parsed.composer === 'string' ? parsed.composer : undefined,
    arranger: typeof parsed.arranger === 'string' ? parsed.arranger : undefined,
    publisher: typeof parsed.publisher === 'string' ? parsed.publisher : undefined,
    copyrightYear:
      typeof parsed.copyrightYear === 'number'
        ? parsed.copyrightYear
        : typeof parsed.copyrightYear === 'string' && parsed.copyrightYear.trim()
          ? parsed.copyrightYear.trim()
          : undefined,
    ensembleType: typeof parsed.ensembleType === 'string' ? parsed.ensembleType : undefined,
    keySignature: typeof parsed.keySignature === 'string' ? parsed.keySignature : undefined,
    timeSignature: typeof parsed.timeSignature === 'string' ? parsed.timeSignature : undefined,
    tempo: typeof parsed.tempo === 'string' ? parsed.tempo : undefined,
    fileType: (['FULL_SCORE', 'CONDUCTOR_SCORE', 'CONDENSED_SCORE', 'PART'] as const).includes(
      parsed.fileType as never
    )
      ? (parsed.fileType as ExtractedMetadata['fileType'])
      : 'FULL_SCORE',
    isMultiPart,
    parts,
    cuttingInstructions,
    confidenceScore,
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

function buildFallbackMetadata(totalPages: number): ExtractedMetadata {
  return {
    title: 'Unknown Title',
    confidenceScore: 0,
    fileType: 'FULL_SCORE',
    isMultiPart: false,
    parts: [],
    cuttingInstructions: [
      {
        partName: 'Full Score',
        instrument: 'Full Score',
        section: 'Score',
        transposition: 'C',
        partNumber: 1,
        pageRange: [1, totalPages],
      },
    ],
    notes: 'Metadata extraction failed — manual review required',
  };
}

function determineRoutingDecision(
  confidence: number,
  config: LLMRuntimeConfig
): { decision: RoutingDecision; autoApproved: boolean } {
  if (confidence >= config.autoApproveThreshold) {
    return { decision: 'auto_parse_auto_approve', autoApproved: true };
  }
  if (confidence >= config.skipParseThreshold) {
    return { decision: 'auto_parse_second_pass', autoApproved: false };
  }
  return { decision: 'no_parse_second_pass', autoApproved: false };
}

// =============================================================================
// Main Job Processor
// =============================================================================

export async function processSmartUpload(job: Job<SmartUploadProcessData>): Promise<{
  status: string;
  sessionId: string;
  partsCreated?: number;
}> {
  const { sessionId, fileId } = job.data;

  /** Convenience wrapper that always includes sessionId in progress payloads */
  const progress = (step: SmartUploadJobProgress['step'], percent: number, message: string) =>
    job.updateProgress({ step, percent, message, sessionId } as SmartUploadJobProgress);

  // Step 0: Starting
  await progress('starting', 0, 'Initializing smart upload processing');

  logger.info('Starting smart upload processing', { sessionId, fileId, jobId: job.id });

  // Find the smart upload session
  const smartSession = await prisma.smartUploadSession.findUnique({
    where: { uploadSessionId: sessionId },
  });

  if (!smartSession) {
    throw new Error(`Smart upload session not found: ${sessionId}`);
  }

  // Load LLM config (uses smart_upload_* settings from DB)
  const llmConfig = await loadSmartUploadRuntimeConfig();

  // ── Budget tracking ────────────────────────────────────────────────────
  const budget = createSessionBudget(sessionId, {
    smart_upload_budget_max_llm_calls_per_session: llmConfig.budgetMaxLlmCalls,
    smart_upload_budget_max_input_tokens_per_session: llmConfig.budgetMaxInputTokens,
  });

  // Check if OCR-first is enabled
  const ocrFirstEnabled = llmConfig.enableOcrFirst ?? true;

  // ── Strategy history for diagnostics + autonomous retry ──────────────────
  interface StrategyAttempt {
    strategy: string;
    confidence: number;
    failureReasons: string[];
    durationMs: number;
    timestamp: string;
    provenance?: {
      textLayerAttempt: boolean;
      textLayerSuccess: boolean;
      textLayerEngine?: string;
      textLayerChars: number;
      ocrAttempt: boolean;
      ocrSuccess: boolean;
      ocrEngine?: string;
      ocrConfidence: number;
      llmFallbackReasons: string[];
    };
  }
  const strategyHistory: StrategyAttempt[] = [];

  // ── PDF-to-LLM capability detection ───────────────────────────────────
  const providerMeta = getProviderMeta(llmConfig.provider);
  const canSendPdf = llmConfig.sendFullPdfToLlm && (providerMeta?.supportsPdfInput ?? false);

  // Step 1: Download PDF
  await progress('downloading', 5, 'Downloading PDF from storage');

  const downloadResult = await downloadFile(smartSession.storageKey);
  if (typeof downloadResult === 'string') {
    throw new Error('Expected file stream but got URL');
  }

  const pdfBuffer = await streamToBuffer(downloadResult.stream);

  // Validate the PDF early so we fail gracefully on corrupt files.  The
  // warning messages seen in the log ("Trying to parse invalid object…")
  // originate from pdf-lib when the parser encounters malformed data.  If
  // validation fails we update the session to PARSE_FAILED and return a
  // non‑throwing result so the job doesn’t dead‑letter.
  const validation = await validatePdfBuffer(pdfBuffer);
  if (!validation.valid) {
    logger.error('PDF validation failed; aborting smart upload', {
      sessionId,
      error: validation.error,
    });
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: {
        parseStatus: 'PARSE_FAILED',
      },
    });
    // Return structured result so callers know parsing never occurred
    return { status: 'parse_failed', sessionId };
  }

  // Get total page count from validated buffer (should exist since valid).
  const totalPages = validation.pageCount ?? 0;

  // -----------------------------------------------------------------
  // Text layer detection (deterministic segmentation when available)
  // -----------------------------------------------------------------
  await progress('analyzing', 15, 'Detecting text layer for deterministic segmentation');

  const pageHeaderResult = await extractPdfPageHeaders(
    pdfBuffer,
    { maxPages: totalPages }
  );

  let deterministicInstructions: CuttingInstruction[] | null = null;
  let deterministicConfidence = 0;
  /** Per-page labels collected during segmentation (1-indexed page → label text) */
  const pageLabels: Record<number, string> = {};

  if (pageHeaderResult.hasTextLayer) {
    logger.info('Text layer detected — attempting deterministic segmentation', {
      sessionId,
      coverage: pageHeaderResult.textLayerCoverage,
    });

    const segResult = detectPartBoundaries(pageHeaderResult.pageHeaders, totalPages, true);
    if (segResult.segments.length > 1 || segResult.segmentationConfidence >= 60) {
      deterministicInstructions = segResult.cuttingInstructions;
      deterministicConfidence = segResult.segmentationConfidence;
      // Persist per-page header text for Review UI
      for (const h of pageHeaderResult.pageHeaders) {
        if (h.hasText && h.headerText) {
          pageLabels[h.pageIndex + 1] = h.headerText;
        }
      }
      logger.info('Deterministic segmentation succeeded', {
        sessionId,
        segments: segResult.segments.length,
        confidence: deterministicConfidence,
      });
    }
  }

  // -----------------------------------------------------------------
  // OCR-First Pipeline (Phase 4):
  // Always run page-labeler BEFORE full-vision LLM to determine if
  // OCR-derived metadata is sufficient. Full vision is only invoked when
  // segmentation/metadata confidence is insufficient by configured thresholds.
  //
  // Step 1: Text layer detection + segmentation
  // Step 2: OCR fallback if text layer insufficient
  // Step 3: Page-labeler orchestration (uses both strategies)
  // Step 4: Only if page-labeler confidence < threshold, invoke full-vision LLM
  // -----------------------------------------------------------------

  let pageLabelerResult: PageLabelerResult | null = null;
  let useFullVisionLLM = false;
  const fullVisionFallbackReasons: string[] = [];
  let ocrProvenance = {
    textLayerAttempt: false,
    textLayerSuccess: false,
    textLayerEngine: '' as string,
    textLayerChars: 0,
    ocrAttempt: false,
    ocrSuccess: false,
    ocrEngine: '' as string,
    ocrConfidence: 0,
    llmFallbackReasons: [] as string[],
  };

  await progress('analyzing', 15, 'Running page-labeler (OCR-first pipeline)');

  if (ocrFirstEnabled) {
    // ── Phase 1: Run page-labeler to get deterministic cutting instructions ─
    try {
      const labelerStart = Date.now();
      pageLabelerResult = await labelPages({
        pdfBuffer,
        totalPages,
        sessionId,
        cacheTag: sessionId,
        enableOcr: llmConfig.enableOcrFirst ?? true,
        enableLlm: false, // Never use LLM for page labeling in OCR-first mode
        maxLLmPages: llmConfig.llmMaxPages,
        maxHeaderBatches: llmConfig.llmMaxHeaderBatches,
        maxLlmCallsPerSession: llmConfig.budgetMaxLlmCalls,
        textOptions: {
          maxProbePages: llmConfig.textProbePages,
          earlyStopConsecutivePages: 3,
        },
        ocrOptions: {
          hashDistanceThreshold: 10,
          cropHeightFraction: 0.2,
          enableOcr: true,
        },
      });

      const labelerDuration = Date.now() - labelerStart;

      // Populate provenance from page-labeler diagnostics
      const textDiag = pageLabelerResult.diagnostics.strategies.find(s => s.strategy === 'text');
      const ocrDiag = pageLabelerResult.diagnostics.strategies.find(s => s.strategy === 'ocr');

      ocrProvenance = {
        textLayerAttempt: textDiag?.pagesProcessed ? textDiag.pagesProcessed > 0 : false,
        textLayerSuccess: textDiag?.success ?? false,
        textLayerEngine: 'pdf-lib-text-layer',
        textLayerChars: textDiag?.labelsExtracted ?? 0,
        ocrAttempt: ocrDiag?.pagesProcessed ? ocrDiag.pagesProcessed > 0 : false,
        ocrSuccess: ocrDiag?.success ?? false,
        ocrEngine: 'header-image-hash-segmentation',
        ocrConfidence: ocrDiag?.success ? pageLabelerResult.confidence : 0,
        llmFallbackReasons: fullVisionFallbackReasons,
      };

      logger.info('Page-labeler completed (OCR-first pipeline)', {
        sessionId,
        strategyUsed: pageLabelerResult.strategyUsed,
        confidence: pageLabelerResult.confidence,
        labelsExtracted: Object.keys(pageLabelerResult.pageLabels).length,
        cuttingInstructionsCount: pageLabelerResult.cuttingInstructions.length,
        durationMs: labelerDuration,
      });

      // Determine if full-vision LLM is needed based on confidence thresholds
      const segmentationConfidence = pageLabelerResult.confidence;
      const threshold = llmConfig.skipParseThreshold;

      if (segmentationConfidence >= threshold && pageLabelerResult.cuttingInstructions.length > 0) {
        // OCR-first path is sufficient - use page-labeler results directly
        useFullVisionLLM = false;
        logger.info('OCR-first: page-labeler confidence sufficient, skipping full-vision LLM', {
          sessionId,
          segmentationConfidence,
          threshold,
          cuttingInstructions: pageLabelerResult.cuttingInstructions.length,
        });
      } else {
        // Confidence insufficient - need full-vision LLM
        useFullVisionLLM = true;
        fullVisionFallbackReasons.push(
          `segmentation confidence (${segmentationConfidence}) < threshold (${threshold})`
        );
        if (pageLabelerResult.cuttingInstructions.length === 0) {
          fullVisionFallbackReasons.push('no cutting instructions from page-labeler');
        }
        logger.info('OCR-first: falling back to full-vision LLM', {
          sessionId,
          segmentationConfidence,
          threshold,
          fallbackReasons: fullVisionFallbackReasons,
        });
      }
    } catch (labelerErr) {
      // Page-labeler failed - fall back to full-vision LLM
      useFullVisionLLM = true;
      fullVisionFallbackReasons.push(
        `page-labeler error: ${labelerErr instanceof Error ? labelerErr.message : String(labelerErr)}`
      );
      logger.warn('Page-labeler failed, falling back to full-vision LLM', {
        sessionId,
        error: labelerErr instanceof Error ? labelerErr.message : String(labelerErr),
      });
    }
  } else {
    // OCR-first disabled - always use full-vision LLM
    useFullVisionLLM = true;
    fullVisionFallbackReasons.push('OCR-first disabled in config');
  }

  // ── Run full-vision LLM only when explicitly needed ────────────────────
  let extraction: ExtractedMetadata;
  let firstPassRaw: string | null = null;

  if (!useFullVisionLLM) {
    // ── OCR-first path sufficient — use page-labeler results directly ───
    // No full-vision LLM call needed; OCR confidence was above threshold.
    // -----------------------------------------------------------------

    // Extract title/composer from text-layer + filename parsing
    const ocrMeta = await extractOcrFallbackMetadata({
      pdfBuffer,
      filename: smartSession.fileName,
    });

    // Use page-labeler results for cutting instructions
    const pageLabelerInstructions = pageLabelerResult?.cuttingInstructions ?? [];
    const pageLabelerLabels: Record<number, string> = {};
    if (pageLabelerResult) {
      for (const [pageNum, label] of Object.entries(pageLabelerResult.pageLabels)) {
        pageLabelerLabels[Number(pageNum)] = label.label;
      }
    }

    extraction = {
      title: ocrMeta.title || smartSession.fileName.replace(/\.pdf$/i, ''),
      composer: ocrMeta.composer,
      confidenceScore: pageLabelerResult?.confidence ?? 0,
      fileType: 'FULL_SCORE',
      isMultiPart: pageLabelerInstructions.length > 1,
      parts: pageLabelerInstructions.map((ci, i) => ({
        instrument: ci.instrument,
        partName: ci.partName,
        section: ci.section,
        transposition: ci.transposition,
        partNumber: ci.partNumber ?? i + 1,
      })),
      cuttingInstructions: toOneIndexedInstructions(pageLabelerInstructions),
      pageLabels: pageLabelerLabels,
      segmentationConfidence: pageLabelerResult?.confidence ?? 0,
      notes: `Processed via OCR-first pipeline (page-labeler, confidence: ${pageLabelerResult?.confidence ?? 0}%). No full-vision LLM calls used.`,
    };

    logger.info('OCR-first extraction complete (page-labeler)', {
      sessionId,
      title: extraction.title,
      composer: extraction.composer,
      parts: extraction.cuttingInstructions?.length ?? 0,
      confidence: extraction.confidenceScore,
      strategyUsed: pageLabelerResult?.strategyUsed ?? 'unknown',
    });

    // Record OCR-first strategy attempt
    strategyHistory.push({
      strategy: `ocr-first-${pageLabelerResult?.strategyUsed ?? 'unknown'}`,
      confidence: extraction.confidenceScore,
      failureReasons: [],
      durationMs: 0,
      timestamp: new Date().toISOString(),
      provenance: ocrProvenance,
    });
  } else {
    // ── Full-vision LLM path (fallback from OCR-first) ─────────────────
    // OCR-first confidence was insufficient — call the full-vision LLM.
    // When the provider supports native PDF input, send the entire PDF
    // directly — this is faster and far more accurate than rendering
    // individual page images or header crops.
    // -----------------------------------------------------------------

    // Record the OCR attempt before LLM fallback
    strategyHistory.push({
      strategy: 'ocr-fallback',
      confidence: pageLabelerResult?.confidence ?? 0,
      failureReasons: fullVisionFallbackReasons,
      durationMs: 0,
      timestamp: new Date().toISOString(),
      provenance: ocrProvenance,
    });

    let visionResult: { content: string };
    let sampledIndices: number[] = [];
    // Hoisted for retry access across both PDF and image branches
    let pdfDocumentRef: LabeledDocument | undefined;
    let visionPromptRef: string = '';
    let pageImagesRef: string[] = [];

    // Use step-specific config for full-vision extraction
    const visionStepConfig = await buildAdapterConfigForStep(llmConfig, 'vision');
    const visionAdapterConfig = {
      ...runtimeToAdapterConfig(llmConfig),
      llm_provider: visionStepConfig.provider,
      llm_endpoint_url: visionStepConfig.endpointUrl,
      llm_vision_model: visionStepConfig.model,
    };

    if (canSendPdf) {
      // ── PDF-to-LLM mode: send the whole PDF as a native document ──────────
      // Skips page sampling AND header-crop labeling — the LLM sees everything.
      await progress('analyzing', 30, 'Sending full PDF to AI for analysis (OCR insufficient)');

      logger.info('Using PDF-to-LLM mode — skipping image rendering', {
        sessionId,
        provider: llmConfig.provider,
        totalPages,
        deterministicConfidence,
        reason: deterministicInstructions
          ? `Deterministic confidence ${deterministicConfidence} < threshold ${llmConfig.skipParseThreshold}`
          : 'No deterministic segmentation available',
      });

      const budgetCheck = budget.check();
      if (!budgetCheck.allowed) {
        logger.warn('Budget exhausted before vision call', { sessionId, reason: budgetCheck.reason });
        throw new Error(`Smart Upload budget exhausted: ${budgetCheck.reason}`);
      }

      const pdfDocument: LabeledDocument = {
        mimeType: 'application/pdf',
        base64Data: pdfBuffer.toString('base64'),
        label: 'Full Score PDF',
      };
      pdfDocumentRef = pdfDocument;

      const pdfPrompt = buildPdfVisionPrompt(
        llmConfig.pdfVisionUserPrompt || DEFAULT_PDF_VISION_USER_PROMPT_TEMPLATE,
        { totalPages },
      );
      // Include original filename as context — helps title/composer extraction
      // when the PDF is scanned (no text layer) and the LLM must guess.
      const filenameHint = `\nOriginal filename: "${smartSession.fileName}"\nUse this filename as a strong hint for the title if the title page is unclear or missing. Do NOT guess a title from instrument pages.`;
      visionPromptRef = pdfPrompt + filenameHint;

      visionResult = await callVisionModel(
        visionAdapterConfig,
        [], // no images — PDF is the input
        visionPromptRef,
        {
          system: visionStepConfig.systemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
          responseFormat: { type: 'json' },
          modelParams: visionStepConfig.modelParams,
          maxTokens: 65536,
          temperature: 0.1,
          documents: [pdfDocument],
        },
      );
      budget.record();
    } else {
      // ── Standard image-based vision mode (fallback for non-PDF providers) ─
      await progress('rendering', 10, 'Rendering PDF pages to images');

      let sampleResult;
      try {
        sampleResult = await samplePdfPages(pdfBuffer, sessionId);
      } catch (err) {
        // A failure here indicates the PDF is too malformed to render even a
        // single page.  Treat as parse failure and bail out cleanly rather than
        // letting the worker crash with a cryptic pdf-lib message.
        logger.error('samplePdfPages failed during smart upload', {
          sessionId,
          ...safeErrorDetails(err),
        });
        await prisma.smartUploadSession.update({
          where: { uploadSessionId: sessionId },
          data: { parseStatus: 'PARSE_FAILED' },
        });
        return { status: 'parse_failed', sessionId };
      }
      const pageImages = sampleResult.images;
      pageImagesRef = pageImages;
      sampledIndices = sampleResult.sampledIndices;

      // For scanned/image PDFs without text layer, try local header-image segmentation
      // first (no LLM, no cost) before falling back to the LLM header-label pass.
      if (!deterministicInstructions || deterministicConfidence < llmConfig.skipParseThreshold) {

        // ── Strategy 1: local perceptual-hash segmentation + OCR-per-segment ──
        // This replaces the LLM header-label pass for the majority of scanned PDFs
        // where header images change clearly at part boundaries.
        if (llmConfig.enableOcrFirst) {
          await progress('analyzing', 22, 'Running local header-image segmentation (no LLM)');
          try {
            const localSeg = await segmentByHeaderImages(pdfBuffer, totalPages, {
              cropHeightFraction: 0.20,
              hashDistanceThreshold: 10,
              enableOcr: true,
              cacheTag: sessionId,
            });

            if (localSeg && localSeg.segmentCount > 1 && localSeg.confidence >= 55) {
              deterministicInstructions = localSeg.cuttingInstructions;
              deterministicConfidence = Math.max(deterministicConfidence, localSeg.confidence);
              // Populate per-page labels for the Review UI (1-indexed)
              for (const ci of localSeg.cuttingInstructions) {
                for (let pg = ci.pageRange[0]; pg <= ci.pageRange[1]; pg++) {
                  pageLabels[pg + 1] = ci.instrument; // pageRange is 0-indexed
                }
              }
              logger.info('Local header-image segmentation succeeded — skipping LLM header-label pass', {
                sessionId,
                segmentCount: localSeg.segmentCount,
                confidence: localSeg.confidence,
                hasOcrLabels: localSeg.hasOcrLabels,
              });
            } else {
              logger.info('Local header-image segmentation inconclusive — falling back to LLM header-label pass', {
                sessionId,
                segmentCount: localSeg?.segmentCount ?? 0,
                confidence: localSeg?.confidence ?? 0,
              });
            }
          } catch (localSegErr) {
            logger.warn('Local header-image segmentation failed; will fall back to LLM', {
              sessionId,
              error: localSegErr instanceof Error ? localSegErr.message : String(localSegErr),
            });
          }
        }

        // ── Strategy 2: LLM header-label pass (fallback: used only when local seg fails) ──
        // Skip if local segmentation already produced sufficient results.
        const needsLlmHeaderPass =
          !deterministicInstructions ||
          deterministicInstructions.length <= 1 ||
          deterministicConfidence < llmConfig.skipParseThreshold;

        if (needsLlmHeaderPass) {
          await progress('analyzing', 25, 'Running LLM header-label pass for scanned pages');

          try {
            const allPageIndices = Array.from({ length: totalPages }, (_, i) => i);
            const headerCropImages = await renderPdfHeaderCropBatch(pdfBuffer, allPageIndices, {
              scale: 2,
              maxWidth: 1024,
              quality: 85,
              format: 'png',
              cropHeightFraction: 0.2,
              cacheTag: sessionId,
            });

      // Use step-specific config for header-label pass
      const headerLabelStepConfig = await buildAdapterConfigForStep(llmConfig, 'header-label');
      const headerAdapterConfig = {
        ...runtimeToAdapterConfig(llmConfig),
        llm_provider: headerLabelStepConfig.provider,
        llm_endpoint_url: headerLabelStepConfig.endpointUrl,
        llm_vision_model: headerLabelStepConfig.model,
      };

      const allParsedHeaderLabels: HeaderLabelEntry[] = [];
      for (let batchStart = 0; batchStart < headerCropImages.length; batchStart += MAX_HEADER_CROP_BATCH_SIZE) {
        const headerBudgetCheck = budget.check();
        if (!headerBudgetCheck.allowed) {
          logger.warn('Budget exhausted during header-label pass; using partial results', {
            sessionId,
            reason: headerBudgetCheck.reason,
            labelsCollected: allParsedHeaderLabels.length,
          });
          break;
        }

        const batchEnd = Math.min(batchStart + MAX_HEADER_CROP_BATCH_SIZE, headerCropImages.length);
        const batchPageIndices = allPageIndices.slice(batchStart, batchEnd);
        const batchImages = headerCropImages.slice(batchStart, batchEnd);

        const batchPrompt = buildHeaderLabelPrompt(llmConfig.headerLabelUserPrompt || llmConfig.headerLabelPrompt || '', {
          pageNumbers: batchPageIndices.map((index) => index + 1),
        });

        const batchResult = await callVisionModel(
          headerAdapterConfig,
          batchImages.map((base64Data, i) => ({
            mimeType: 'image/png' as const,
            base64Data,
            label: `Page ${batchPageIndices[i] + 1}`,
          })),
          batchPrompt,
          {
            system: headerLabelStepConfig.systemPrompt || DEFAULT_HEADER_LABEL_SYSTEM_PROMPT,
            responseFormat: { type: 'json' },
            maxTokens: 2048,
            temperature: 0.1,
            modelParams: headerLabelStepConfig.modelParams,
          }
        );
              budget.record();

              const batchLabels = parseHeaderLabelResponse(batchResult.content);
              allParsedHeaderLabels.push(...batchLabels);

              logger.info('Header-label batch complete', {
                sessionId,
                batchStart: batchStart + 1,
                batchEnd,
                labelsFound: batchLabels.length,
              });
            }

            const pageHeaders = allParsedHeaderLabels.map((entry) => ({
              pageIndex: entry.page - 1,
              headerText: entry.label ?? '',
              fullText: entry.label ?? '',
              hasText: Boolean(entry.label),
            }));

            if (pageHeaders.length > 0) {
              const segResult = detectPartBoundaries(pageHeaders, totalPages, false);
              if (segResult.segments.length > 1 || segResult.segmentationConfidence >= 55) {
                deterministicInstructions = segResult.cuttingInstructions;
                deterministicConfidence = Math.max(
                  deterministicConfidence,
                  segResult.segmentationConfidence
                );
                for (const h of pageHeaders) {
                  if (h.hasText && h.headerText) {
                    pageLabels[h.pageIndex + 1] = h.headerText;
                  }
                }
                logger.info('LLM header-label segmentation succeeded', {
                  sessionId,
                  segments: segResult.segments.length,
                  confidence: segResult.segmentationConfidence,
                });
              }
            }
          } catch (error) {
            logger.warn('Header-label segmentation failed; continuing with first-pass vision', {
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Send sampled images to vision LLM
      await progress('analyzing', 30, 'Running AI vision analysis on pages');

      const budgetCheck = budget.check();
      if (!budgetCheck.allowed) {
        logger.warn('Budget exhausted before vision call', { sessionId, reason: budgetCheck.reason });
        throw new Error(`Smart Upload budget exhausted: ${budgetCheck.reason}`);
      }

      const images = pageImages.map((base64Data, index) => ({
        mimeType: 'image/png' as const,
        base64Data,
        label: `Original Page ${sampledIndices[index] + 1}`,
      }));

      // Use step-specific config for vision pass
      const visionPrompt = buildVisionPrompt(
        llmConfig.visionUserPrompt || DEFAULT_VISION_USER_PROMPT_TEMPLATE,
        {
          totalPages,
          sampledPageNumbers: sampledIndices,
        },
      );
      // Include original filename as context — helps title/composer extraction
      // when the PDF is scanned (no text layer) and the LLM must guess.
      const filenameHint = `\nOriginal filename: "${smartSession.fileName}"\nUse this filename as a strong hint for the title if the title page is unclear or missing. Do NOT guess a title from instrument pages.`;
      visionPromptRef = visionPrompt + filenameHint;

      visionResult = await callVisionModel(
        visionAdapterConfig,
        images,
        visionPromptRef,
        {
          system: visionStepConfig.systemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
          responseFormat: { type: 'json' },
          modelParams: visionStepConfig.modelParams,
          maxTokens: 65536,
          temperature: 0.1,
        },
      );
      budget.record();
    }

    extraction = parseVisionResponse(visionResult.content, totalPages);

    // ── Retry once if LLM response appears truncated ───────────────────────
    // When isMultiPart=true but no cuttingInstructions, the LLM likely stopped
    // generating before completing the JSON. Retry once with the same model.
    if (
      extraction.isMultiPart &&
      (!extraction.cuttingInstructions || extraction.cuttingInstructions.length === 0) &&
      budget.check().allowed
    ) {
      logger.warn('First pass: isMultiPart=true but no cuttingInstructions — retrying', {
        sessionId,
        originalTokens: visionResult.content.length,
      });
      // Re-call the same model (uses either PDF or image path already set up)
      const retryOptions = {
        system: llmConfig.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
        responseFormat: { type: 'json' as const },
        modelParams: llmConfig.visionModelParams,
        maxTokens: 65536,
        temperature: 0.1,
      };
      if (pdfDocumentRef) {
        visionResult = await callVisionModel(visionAdapterConfig, [], visionPromptRef, {
          ...retryOptions,
          documents: [pdfDocumentRef],
        });
      } else {
        const retryImages = pageImagesRef.map((base64Data, index) => ({
          mimeType: 'image/png' as const,
          base64Data,
          label: `Original Page ${sampledIndices[index] + 1}`,
        }));
        visionResult = await callVisionModel(visionAdapterConfig, retryImages, visionPromptRef, retryOptions);
      }
      budget.record();

      const retryExtraction = parseVisionResponse(visionResult.content, totalPages);
      // Use retry result only if it has better cutting instructions
      if (retryExtraction.cuttingInstructions && retryExtraction.cuttingInstructions.length > 0) {
        logger.info('Retry produced valid cutting instructions', {
          sessionId,
          instructionCount: retryExtraction.cuttingInstructions.length,
        });
        extraction = retryExtraction;
        firstPassRaw = visionResult.content;
      } else {
        logger.warn('Retry also produced no cutting instructions — keeping original', { sessionId });
      }
    }

    // If deterministic segmentation produced instructions, overlay them on the LLM extraction
    if (deterministicInstructions && deterministicInstructions.length > 0) {
      extraction.cuttingInstructions = toOneIndexedInstructions(deterministicInstructions);
      // Boost confidence when deterministic path used
      extraction.confidenceScore = Math.max(
        extraction.confidenceScore,
        deterministicConfidence
      );
      logger.info('Using deterministic cutting instructions (with LLM metadata)', {
        sessionId,
        parts: deterministicInstructions.length,
      });
    }

    // Persist per-page labels and segmentation confidence in extractedMetadata
    if (Object.keys(pageLabels).length > 0) {
      extraction.pageLabels = pageLabels;
    }
    if (deterministicConfidence > 0) {
      extraction.segmentationConfidence = deterministicConfidence;
    }

    // Store the raw first-pass LLM response for audit purposes
    firstPassRaw = visionResult.content;
  }

  // ── Handle single-document scores (conductor score, full score, etc.) ───
  // When the LLM provides no valid cutting instructions, create a single "Full
  // Score" part covering all pages rather than letting gap-fill create garbage.
  // This handles conductor scores where ALL instruments are on every page.
  // We do NOT rely on isMultiPart because the LLM is inconsistent about it.
  // Guard: only apply for PDFs ≤ MAX_FULL_SCORE_PAGES. Larger documents with
  // no cutting instructions are multi-part PDFs where the LLM failed to
  // generate instructions (e.g., output truncation).
  const SCORE_FILE_TYPES = ['FULL_SCORE', 'CONDUCTOR_SCORE', 'CONDENSED_SCORE'];
  const MAX_FULL_SCORE_PAGES = 30;
  const hasNoCuttingInstructions =
    !extraction.cuttingInstructions || extraction.cuttingInstructions.length === 0;
  const isScoreFileType = SCORE_FILE_TYPES.includes(extraction.fileType ?? '');

  if (hasNoCuttingInstructions && isScoreFileType && totalPages <= MAX_FULL_SCORE_PAGES) {
    const scoreType =
      extraction.fileType === 'CONDUCTOR_SCORE'
        ? 'Conductor Score'
        : extraction.fileType === 'CONDENSED_SCORE'
          ? 'Condensed Score'
          : 'Full Score';
    extraction.cuttingInstructions = [
      {
        partName: scoreType,
        instrument: scoreType,
        section: 'Score' as CuttingInstruction['section'],
        transposition: 'C' as CuttingInstruction['transposition'],
        partNumber: 1,
        pageRange: [1, totalPages] as [number, number],
      },
    ];
    // Single-page-range score → not multi-part for pipeline purposes
    extraction.isMultiPart = false;
    logger.info('Single-document score detected — created full-score cutting instruction', {
      sessionId,
      scoreType,
      totalPages,
      fileType: extraction.fileType,
    });
  }

  // Step 3: Validate cutting instructions
  await progress('validating', 50, 'Validating extracted cutting instructions');

  const cuttingInstructions = extraction.cuttingInstructions || [];
  const instructionValidation = validateAndNormalizeInstructions(
    cuttingInstructions,
    totalPages,
    { oneIndexed: true, detectGaps: true }
  );

  // Detect and fill uncovered page ranges (gaps between cuts)
  const gapInstructions = buildGapInstructions(instructionValidation.instructions, totalPages);
  if (gapInstructions.length > 0) {
    logger.warn('Gap pages detected — adding uncovered parts', {
      sessionId,
      gaps: gapInstructions.map((g) => g.pageRange),
    });
    instructionValidation.instructions.push(...gapInstructions);
    instructionValidation.warnings.push(
      `${gapInstructions.length} uncovered page range(s) were added as 'Unlabelled' parts`
    );

    // If ALL instructions are gap-fills (LLM returned 0 valid cutting instructions),
    // the extraction is fundamentally incomplete — force low confidence.
    const validLlmInstructions = instructionValidation.instructions.length - gapInstructions.length;
    if (validLlmInstructions === 0) {
      logger.warn('No valid cutting instructions from LLM — forcing low confidence', {
        sessionId,
        originalConfidence: extraction.confidenceScore,
      });
      extraction.confidenceScore = Math.min(extraction.confidenceScore, 10);
    } else {
      // Some valid instructions exist but gaps remain — the extraction is incomplete.
      // Cap confidence below auto-approve to force review or second pass.
      const gapPageCount = gapInstructions.reduce(
        (sum, g) => sum + (g.pageRange[1] - g.pageRange[0] + 1), 0
      );
      if (gapPageCount > 0) {
        const cappedConfidence = Math.min(
          extraction.confidenceScore,
          llmConfig.autoApproveThreshold - 1,
        );
        if (cappedConfidence < extraction.confidenceScore) {
          logger.info('Gap pages exist — capping confidence below auto-approve threshold', {
            sessionId,
            originalConfidence: extraction.confidenceScore,
            cappedConfidence,
            gapPageCount,
          });
          extraction.confidenceScore = cappedConfidence;
        }
      }
    }
  }

  const normalizedInstructionsZero = instructionValidation.instructions;
  const normalizedInstructionsOne = toOneIndexedInstructions(normalizedInstructionsZero);

  if (instructionValidation.isValid) {
    extraction.cuttingInstructions = normalizedInstructionsOne;
  }

  // Determine routing decision based on confidence
  const { decision: routingDecision, autoApproved: _autoApproved } = determineRoutingDecision(
    extraction.confidenceScore,
    llmConfig
  );

  // If validation failed or low confidence, queue for second pass
  if (!instructionValidation.isValid || extraction.confidenceScore < llmConfig.skipParseThreshold) {
    logger.warn('Low confidence or validation failed, queueing for second pass', {
      sessionId,
      confidence: extraction.confidenceScore,
      validationErrors: instructionValidation.errors,
    });

    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: {
        extractedMetadata: deepCloneJSON(extraction) as any,
        confidenceScore: extraction.confidenceScore,
        routingDecision: 'no_parse_second_pass',
        parseStatus: 'NOT_PARSED',
        secondPassStatus: 'QUEUED',
        cuttingInstructions: deepCloneJSON(normalizedInstructionsOne) as any,
        llmProvider: llmConfig.provider,
        llmVisionModel: llmConfig.visionModel,
        llmVerifyModel: llmConfig.verificationModel,
        llmModelParams: deepCloneJSON({
          vision: llmConfig.visionModelParams,
          verification: llmConfig.verificationModelParams,
        }) as any,
        llmPromptVersion: llmConfig.promptVersion || PROMPT_VERSION,
        firstPassRaw: firstPassRaw ?? null,
      },
    });

    // Queue for second pass
    await queueSmartUploadSecondPass(sessionId);

    await progress('queued_for_second_pass', 100, 'Queued for second pass verification');

    return { status: 'queued_for_second_pass', sessionId };
  }

  // Step 4: Split PDF
  await progress('splitting', 70, `Splitting PDF into ${instructionValidation.instructions.length} parts`);

  // Sanitize instructions before splitting — remove entries with invalid pageRange
  const validatedInstructions = sanitizeCuttingInstructionsForSplit(normalizedInstructionsZero);

  let splitResults;
  try {
    splitResults = await splitPdfByCuttingInstructions(
      pdfBuffer,
      smartSession.fileName.replace(/\.pdf$/i, ''),
      validatedInstructions,
      { indexing: 'zero' }
    );
  } catch (err) {
    logger.error('Failed to split PDF during smart upload', {
      sessionId,
      ...safeErrorDetails(err),
    });
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: { parseStatus: 'PARSE_FAILED' },
    });
    return { status: 'parse_failed', sessionId };
  }

  // Step 5: Create part records
  await progress('saving', 90, 'Uploading split parts to storage');

  const parsedParts: ParsedPartRecord[] = [];
  const tempFiles: string[] = [];

  for (const result of splitResults) {
    const normalised = normalizeInstrumentLabel(result.instruction.instrument);
    const displayName = `${smartSession.fileName.replace(/\.pdf$/i, '')} ${normalised.instrument}`;
    const slug = buildPartStorageSlug(displayName);
    const partStorageKey = `smart-upload/${sessionId}/parts/${slug}.pdf`;
    const partFileName = buildPartFilename(displayName);

    await uploadFile(partStorageKey, result.buffer, {
      contentType: 'application/pdf',
      metadata: {
        sessionId,
        instrument: result.instruction.instrument,
        partName: result.instruction.partName,
        section: result.instruction.section,
        originalUploadId: sessionId,
      },
    });

    tempFiles.push(partStorageKey);

    parsedParts.push({
      partName: result.instruction.partName,
      instrument: result.instruction.instrument,
      section: result.instruction.section,
      transposition: result.instruction.transposition,
      partNumber: result.instruction.partNumber,
      storageKey: partStorageKey,
      fileName: partFileName,
      fileSize: result.buffer.length,
      pageCount: result.pageCount,
      pageRange: toOneIndexed(result.instruction.pageRange),
    });
  }

  // Step 6: If needs second pass, queue it
  let secondPassStatus: SecondPassStatus = 'NOT_NEEDED';
  if (routingDecision === 'auto_parse_second_pass') {
    secondPassStatus = 'QUEUED';
    // Pre-update secondPassStatus BEFORE queueing the job to prevent
    // race condition where the worker reads stale NOT_NEEDED status.
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: { secondPassStatus: 'QUEUED' },
    });
    await queueSmartUploadSecondPass(sessionId);
  }

  // ---------------------------------------------------------------------------
  // DoD §1.5 — Autonomous Mode Quality Gates (shared module)
  // ---------------------------------------------------------------------------
  let gateResult = evaluateQualityGates({
    parsedParts,
    metadata: extraction,
    totalPages,
    maxPagesPerPart: llmConfig.maxPagesPerPart ?? 12,
    segmentationConfidence: extraction.segmentationConfidence,
  });

  // Determine if OCR-first path was used (based on extraction notes)
  const ocrFirstUsed = extraction.notes?.includes('OCR-first pipeline') ?? false;

  // Record the primary strategy attempt
  strategyHistory.push({
    strategy: ocrFirstUsed ? 'ocr-first-deterministic' : canSendPdf ? 'llm-pdf-native' : 'llm-image-vision',
    confidence: gateResult.finalConfidence,
    failureReasons: gateResult.reasons,
    durationMs: 0, // filled below
    timestamp: new Date().toISOString(),
  });

  // ── Self-heal loop (autonomous mode only) ─────────────────────────────────
  // If quality gates fail and we're in autonomous mode, try alternate local
  // segmentation strategies before giving up. Each iteration tries a different
  // hash-distance threshold and crop fraction combination. We always pick the
  // attempt with the highest finalConfidence that passes all gates.
  //
  // We only attempt this for the image path (not PDF-to-LLM) because the LLM
  // already saw the full document. For scanned PDFs the segmentation is the
  // main variable we can tune locally without spending more LLM calls.
  if (
    gateResult.failed &&
    llmConfig.enableFullyAutonomousMode &&
    !canSendPdf &&
    !ocrFirstUsed &&
    llmConfig.enableOcrFirst
  ) {
    logger.info('Self-heal: quality gates failed — trying alternate local segmentation strategies', {
      sessionId,
      failureReasons: gateResult.reasons,
    });

    // Strategy variants: [hashDistanceThreshold, cropHeightFraction]
    const STRATEGY_VARIANTS: Array<[number, number]> = [
      [5,  0.15],
      [8,  0.20],
      [15, 0.25],
      [8,  0.30],
      [20, 0.20],
    ];

    for (const [hashThreshold, cropFraction] of STRATEGY_VARIANTS) {
      const healStart = Date.now();
      try {
        const altSeg = await segmentByHeaderImages(pdfBuffer, totalPages, {
          cropHeightFraction: cropFraction,
          hashDistanceThreshold: hashThreshold,
          enableOcr: true,
          cacheTag: sessionId,
        });

        if (!altSeg || altSeg.segmentCount <= 1) continue;

        // Build a trial extraction from the alternate segmentation
        const altInstructions = toOneIndexedInstructions(altSeg.cuttingInstructions);
        const altValidation = validateAndNormalizeInstructions(altInstructions, totalPages, { oneIndexed: true, detectGaps: true });
        const altGapInstructions = buildGapInstructions(altValidation.instructions, totalPages);
        if (altGapInstructions.length > 0) {
          altValidation.instructions.push(...altGapInstructions);
        }

        // Split the PDF with the alternate instructions
        const altValidatedInstructions = sanitizeCuttingInstructionsForSplit(
          altValidation.instructions.map((i) => ({ ...i, pageRange: [i.pageRange[0] - 1, i.pageRange[1] - 1] as [number, number] }))
        );
        const altSplitResults = await splitPdfByCuttingInstructions(
          pdfBuffer,
          smartSession.fileName.replace(/\.pdf$/i, ''),
          altValidatedInstructions,
          { indexing: 'zero' }
        );

        const altParsedParts: ParsedPartRecord[] = altSplitResults.map((r) => {
          const normalised = normalizeInstrumentLabel(r.instruction.instrument);
          return {
            partName: r.instruction.partName,
            instrument: r.instruction.instrument,
            section: r.instruction.section,
            transposition: r.instruction.transposition,
            partNumber: r.instruction.partNumber,
            storageKey: '', // placeholder — not uploaded yet
            fileName: buildPartFilename(`${smartSession.fileName.replace(/\.pdf$/i, '')} ${normalised.instrument}`),
            fileSize: r.buffer.length,
            pageCount: r.pageCount,
            pageRange: toOneIndexed(r.instruction.pageRange),
          };
        });

        const altGateResult = evaluateQualityGates({
          parsedParts: altParsedParts,
          metadata: { ...extraction, cuttingInstructions: altValidation.instructions, segmentationConfidence: altSeg.confidence },
          totalPages,
          maxPagesPerPart: llmConfig.maxPagesPerPart ?? 12,
          segmentationConfidence: altSeg.confidence,
        });

        const healDuration = Date.now() - healStart;
        strategyHistory.push({
          strategy: `local-segment:hash=${hashThreshold}:crop=${cropFraction}`,
          confidence: altGateResult.finalConfidence,
          failureReasons: altGateResult.reasons,
          durationMs: healDuration,
          timestamp: new Date().toISOString(),
        });

        if (!altGateResult.failed || altGateResult.finalConfidence > gateResult.finalConfidence) {
          logger.info('Self-heal: alternate segmentation improved result', {
            sessionId,
            hashThreshold,
            cropFraction,
            confidence: altGateResult.finalConfidence,
            gatesPassed: !altGateResult.failed,
          });

          // Upload the alternate parts and replace parsedParts/tempFiles/extraction
          // Old parts remain in tempFiles and will be cleaned up at commit time
          // (they won't be in finalMusicFileKeys, so deleteFile will handle them).
          parsedParts.length = 0; // clear in place — the const binding stays valid

          for (const result of altSplitResults) {
            const normalised = normalizeInstrumentLabel(result.instruction.instrument);
            const displayName = `${smartSession.fileName.replace(/\.pdf$/i, '')} ${normalised.instrument}`;
            const slug = buildPartStorageSlug(displayName);
            const partStorageKey = `smart-upload/${sessionId}/parts/heal/${slug}.pdf`;
            const partFileName = buildPartFilename(displayName);
            await uploadFile(partStorageKey, result.buffer, {
              contentType: 'application/pdf',
              metadata: { sessionId, instrument: result.instruction.instrument, partName: result.instruction.partName, originalUploadId: sessionId },
            });
            tempFiles.push(partStorageKey); // old keys remain (cleaned up at commit)
            parsedParts.push({
              partName: result.instruction.partName,
              instrument: result.instruction.instrument,
              section: result.instruction.section,
              transposition: result.instruction.transposition,
              partNumber: result.instruction.partNumber,
              storageKey: partStorageKey,
              fileName: partFileName,
              fileSize: result.buffer.length,
              pageCount: result.pageCount,
              pageRange: toOneIndexed(result.instruction.pageRange),
            });
          }

          // Update extraction with alternate segmentation
          extraction.cuttingInstructions = altValidation.instructions;
          extraction.confidenceScore = altSeg.confidence;
          extraction.segmentationConfidence = altSeg.confidence;
          gateResult = altGateResult;

          if (!altGateResult.failed) {
            logger.info('Self-heal succeeded: all quality gates pass with alternate segmentation', { sessionId });
            break; // Stop trying more variants
          }
        }
      } catch (healErr) {
        logger.warn('Self-heal variant failed', {
          sessionId,
          hashThreshold,
          cropFraction,
          error: healErr instanceof Error ? healErr.message : String(healErr),
        });
      }
    }
  }

  const qualityGateFailed = gateResult.failed;
  const qualityGateReasons = gateResult.reasons;
  const finalConfidence = gateResult.finalConfidence;

  if (qualityGateFailed) {
    for (const reason of qualityGateReasons) {
      logger.warn('Auto-commit quality gate failed', { sessionId, reason });
    }
  }

  // Determine if we should auto-commit (fully autonomous mode)
  const shouldAutoCommit =
    llmConfig.enableFullyAutonomousMode &&
    finalConfidence >= llmConfig.autonomousApprovalThreshold &&
    secondPassStatus === 'NOT_NEEDED' &&
    !qualityGateFailed;

  if (qualityGateFailed && llmConfig.enableFullyAutonomousMode) {
    logger.info('Auto-commit blocked by quality gate(s)', { sessionId, reasons: qualityGateReasons });
  }

  // Persist final llmCallCount and strategyHistory (best-effort, non-fatal)
  try {
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: {
        llmCallCount: budget.snapshot().llmCallCount,
        strategyHistory: deepCloneJSON(strategyHistory) as any,
      },
    });
  } catch { /* non-fatal — the main result update follows immediately */ }

  // Update session with results
  await prisma.smartUploadSession.update({
    where: { uploadSessionId: sessionId },
    data: {
      extractedMetadata: deepCloneJSON(extraction) as any,
      confidenceScore: extraction.confidenceScore,
      finalConfidence,
      routingDecision,
      parseStatus: 'PARSED',
      parsedParts: deepCloneJSON(parsedParts) as any,
      // Use extraction.cuttingInstructions — self-heal may have updated it from normalizedInstructionsOne
      cuttingInstructions: deepCloneJSON(extraction.cuttingInstructions ?? normalizedInstructionsOne) as any,
      tempFiles: deepCloneJSON(tempFiles) as any,
      autoApproved: shouldAutoCommit,
      requiresHumanReview: qualityGateFailed || undefined,
      secondPassStatus: secondPassStatus === 'NOT_NEEDED' ? 'NOT_NEEDED' : secondPassStatus,
      llmProvider: llmConfig.provider,
      llmVisionModel: llmConfig.visionModel,
      llmVerifyModel: llmConfig.verificationModel,
      llmModelParams: deepCloneJSON({
        vision: llmConfig.visionModelParams,
        verification: llmConfig.verificationModelParams,
      }) as any,
      llmPromptVersion: llmConfig.promptVersion || PROMPT_VERSION,
      ...(firstPassRaw ? { firstPassRaw } : {}),
    },
  });

  // Queue auto-commit if eligible
  if (shouldAutoCommit) {
    logger.info('Autonomous mode: queueing auto-commit', {
      sessionId,
      finalConfidence,
      threshold: llmConfig.autonomousApprovalThreshold,
    });
    await queueSmartUploadAutoCommit(sessionId);
  }

  await progress('complete', 100, `Processing complete. Created ${parsedParts.length} parts.`);

  logger.info('Smart upload processing complete', {
    sessionId,
    partsCreated: parsedParts.length,
    routingDecision,
    confidence: extraction.confidenceScore,
    budget: budget.snapshot(),
  });

  // Free render cache for this session
  clearRenderCache(sessionId);

  return {
    status: 'complete',
    sessionId,
    partsCreated: parsedParts.length,
  };
}
