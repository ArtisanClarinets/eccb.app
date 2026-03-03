/**
 * Page Labeler Service
 *
 * Orchestrates page labeling strategies for music PDF segmentation:
 * 1. Text-layer headers (extractPdfPageHeaders + detectPartBoundaries)
 * 2. OCR segmentation (segmentByHeaderImages)
 * 3. LLM header-label fallback (last resort with budget limits)
 *
 * Production-grade goals:
 * - Never log raw OCR text or PDF bytes
 * - Strict budget enforcement for LLM calls
 * - Deterministic strategy selection based on prior results
 * - Comprehensive diagnostics without exposing sensitive content
 */

import { logger } from '@/lib/logger';
import { loadLLMConfig, type LLMRuntimeConfig } from '@/lib/llm/config-loader';
import { SessionBudget } from '@/lib/smart-upload/budgets';
import { buildHeaderLabelPrompt } from '@/lib/smart-upload/prompts';
import { extractPdfPageHeaders, normalizePdfText } from '@/lib/services/pdf-text-extractor';
import { detectPartBoundaries, type SegmentationResult } from '@/lib/services/part-boundary-detector';
import { segmentByHeaderImages, type HeaderImageSegmentationResult } from '@/lib/services/header-image-segmentation';
import { callVisionModel, runtimeToAdapterConfig } from '@/lib/llm/index';
import { type CuttingInstruction } from '@/lib/services/cutting-instructions';

// =============================================================================
// Types
// =============================================================================

/** Source of page label */
export type PageLabelSource = 'text' | 'ocr' | 'llm';

/** Single page label */
export interface PageLabel {
  /** Label for the page (instrument/part name) */
  label: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Source of the label */
  source: PageLabelSource;
}

/** Strategy used for labeling */
export type LabelingStrategy = 'text' | 'ocr' | 'llm' | 'hybrid';

/** Diagnostic info for a strategy */
export interface StrategyDiagnostic {
  strategy: LabelingStrategy;
  durationMs: number;
  success: boolean;
  pagesProcessed: number;
  labelsExtracted: number;
  /** Reason if strategy failed or was skipped */
  reason?: string;
}

/** Result from page labeling */
export interface PageLabelerResult {
  /** Cutting instructions derived from labels */
  cuttingInstructions: CuttingInstruction[];
  /** Labels keyed by 1-indexed page number */
  pageLabels: Record<number, PageLabel>;
  /** Aggregate confidence score 0-100 */
  confidence: number;
  /** Primary strategy used */
  strategyUsed: LabelingStrategy;
  /** Detailed diagnostics */
  diagnostics: {
    strategies: StrategyDiagnostic[];
    totalDurationMs: number;
    budgetRemaining: number;
    budgetLimit: number;
  };
}

/** Options for page labeling */
export interface PageLabelerOptions {
  /** PDF buffer to process */
  pdfBuffer: Buffer;
  /** Total pages in PDF */
  totalPages: number;
  /** Session ID for budget tracking */
  sessionId: string;
  /** Override max pages for LLM (default from config) */
  maxLLmPages?: number;
  /** Override max header batches for LLM */
  maxHeaderBatches?: number;
  /** Override max LLM calls per session */
  maxLlmCallsPerSession?: number;
  /** Cache tag for PDF rendering */
  cacheTag?: string;
  /** Enable OCR fallback (default: true) */
  enableOcr?: boolean;
  /** Enable LLM fallback (default: true) */
  enableLlm?: boolean;
  /** Text layer options */
  textOptions?: {
    /** Max pages to probe for text */
    maxProbePages?: number;
    /** Early stop consecutive pages */
    earlyStopConsecutivePages?: number;
  };
  /** OCR segmentation options */
  ocrOptions?: {
    /** Hash distance threshold */
    hashDistanceThreshold?: number;
    /** Crop height fraction */
    cropHeightFraction?: number;
    /** Enable OCR on segments */
    enableOcr?: boolean;
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_LLM_PAGES = 20;
const DEFAULT_MAX_HEADER_BATCHES = 5;
const DEFAULT_MAX_LLM_CALLS = 10;
const MIN_PAGES_FOR_LLM = 3;

/** Minimum confidence to consider a strategy successful */
const MIN_STRATEGY_CONFIDENCE = 30;

/** Minimum labels needed to consider text-layer strategy successful */
const MIN_TEXT_LABELS = 2;

// =============================================================================
// Helper Functions
// =============================================================================

function nowMs(): number {
  const perf = (globalThis as any)?.performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function convertSegmentationResult(
  result: SegmentationResult,
  source: PageLabelSource
): { pageLabels: Record<number, PageLabel>; cuttingInstructions: CuttingInstruction[]; confidence: number } {
  const pageLabels: Record<number, PageLabel> = {};
  const confidenceValues: number[] = [];

  for (const pageLabel of result.pageLabels) {
    const pageNum = pageLabel.pageIndex + 1; // Convert to 1-indexed
    pageLabels[pageNum] = {
      label: pageLabel.label || 'Unknown',
      confidence: pageLabel.confidence,
      source,
    };
    confidenceValues.push(pageLabel.confidence);
  }

  const avgConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : 0;

  return {
    pageLabels,
    cuttingInstructions: result.cuttingInstructions,
    confidence: avgConfidence,
  };
}

function convertHeaderImageResult(
  result: HeaderImageSegmentationResult,
  source: PageLabelSource
): { pageLabels: Record<number, PageLabel>; cuttingInstructions: CuttingInstruction[]; confidence: number } {
  const pageLabels: Record<number, PageLabel> = {};
  const confidenceValues: number[] = [];

  for (const diag of result.diagnostics) {
    const pageNum = diag.pageStart + 1; // Use pageStart as 0-indexed, convert to 1-indexed
    pageLabels[pageNum] = {
      label: diag.label || 'Unknown',
      confidence: diag.ocrConfidence,
      source,
    };
    confidenceValues.push(diag.ocrConfidence);
  }

  const avgConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : result.confidence;

  return {
    pageLabels,
    cuttingInstructions: result.cuttingInstructions,
    confidence: avgConfidence,
  };
}

function buildFallbackCuttingInstructions(
  pageLabels: Record<number, PageLabel>,
  totalPages: number
): CuttingInstruction[] {
  // Group consecutive pages with same label
  const sortedPages = Object.keys(pageLabels)
    .map(Number)
    .sort((a, b) => a - b);

  if (sortedPages.length === 0) {
    // No labels at all - create single part
    return [{
      partName: 'Full Score',
      instrument: 'Full Score',
      section: 'Other',
      transposition: 'C',
      partNumber: 1,
      pageRange: [0, totalPages - 1],
    }];
  }

  const segments: Array<{ start: number; end: number; label: string; confidence: number }> = [];
  let currentStart = sortedPages[0];
  let currentLabel = pageLabels[sortedPages[0]].label;
  let currentConfidence = pageLabels[sortedPages[0]].confidence;

  for (let i = 1; i <= sortedPages.length; i++) {
    const pageNum = sortedPages[i];
    const label = pageNum ? pageLabels[pageNum].label : null;

    if (i === sortedPages.length || label !== currentLabel) {
      segments.push({
        start: currentStart - 1, // Convert to 0-indexed
        end: (i === sortedPages.length ? totalPages : sortedPages[i - 1]) - 1,
        label: currentLabel,
        confidence: currentConfidence,
      });

      if (i < sortedPages.length) {
        currentStart = sortedPages[i];
        currentLabel = pageLabels[sortedPages[i]].label;
        currentConfidence = pageLabels[sortedPages[i]].confidence;
      }
    }
  }

  return segments.map((seg, idx) => ({
    partName: seg.label,
    instrument: seg.label,
    section: 'Other' as const,
    transposition: 'C' as const,
    partNumber: idx + 1,
    pageRange: [seg.start, seg.end] as [number, number],
  }));
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Orchestrate page labeling using multiple strategies.
 *
 * Strategy order:
 * 1. Text-layer headers (extractPdfPageHeaders + detectPartBoundaries)
 * 2. OCR segmentation (segmentByHeaderImages)
 * 3. LLM header-label fallback (budget-limited)
 *
 * @param options - Labeling options
 * @returns Page labeling result with cutting instructions
 */
export async function labelPages(options: PageLabelerOptions): Promise<PageLabelerResult> {
  const startMs = nowMs();
  const {
    pdfBuffer,
    totalPages,
    sessionId,
    maxLLmPages = DEFAULT_MAX_LLM_PAGES,
    maxHeaderBatches = DEFAULT_MAX_HEADER_BATCHES,
    maxLlmCallsPerSession = DEFAULT_MAX_LLM_CALLS,
    cacheTag,
    enableOcr = true,
    enableLlm = true,
    textOptions,
    ocrOptions,
  } = options;

  const diagnostics: StrategyDiagnostic[] = [];

  // Initialize budget tracking
  const budget = new SessionBudget(sessionId, {
    maxLlmCalls: maxLlmCallsPerSession,
    maxInputTokens: 100000,
    maxOutputTokens: 10000,
  });

  logger.info('page-labeler: starting orchestration', {
    totalPages,
    sessionId,
    enableOcr,
    enableLlm,
    maxLLmPages,
    maxHeaderBatches,
    maxLlmCallsPerSession,
  });

  // Strategy 1: Text-layer headers
  const textStartMs = nowMs();
  let textResult: SegmentationResult | null = null;
  let textSuccess = false;
  let textReason: string | undefined;

  try {
    const maxProbe = textOptions?.maxProbePages || Math.min(totalPages, 10);
    const earlyStop = textOptions?.earlyStopConsecutivePages;

    const extractionResult = await extractPdfPageHeaders(pdfBuffer, {
      maxPages: maxProbe,
      earlyStopConsecutivePages: earlyStop,
    });

    if (extractionResult.hasTextLayer && extractionResult.pageHeaders.length > 0) {
      textResult = detectPartBoundaries(
        extractionResult.pageHeaders,
        extractionResult.totalPages,
        true // from text layer
      );

      const labelsCount = textResult.pageLabels.filter(p => p.label).length;
      if (labelsCount >= MIN_TEXT_LABELS && textResult.segmentationConfidence >= MIN_STRATEGY_CONFIDENCE) {
        textSuccess = true;
      } else {
        textReason = `insufficient labels (${labelsCount}) or low confidence (${textResult.segmentationConfidence})`;
      }
    } else {
      textReason = 'no text layer detected';
    }
  } catch (err) {
    textReason = `error: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn('page-labeler: text-layer strategy failed', { reason: textReason });
  }

  const textDurationMs = nowMs() - textStartMs;
  diagnostics.push({
    strategy: 'text',
    durationMs: textDurationMs,
    success: textSuccess,
    pagesProcessed: textResult?.pageLabels.length || 0,
    labelsExtracted: textResult?.pageLabels.filter(p => p.label).length || 0,
    reason: textReason,
  });

  // If text strategy succeeded, return immediately
  if (textSuccess && textResult) {
    const { pageLabels, cuttingInstructions, confidence } = convertSegmentationResult(textResult, 'text');

    logger.info('page-labeler: text strategy succeeded', {
      labelsExtracted: Object.keys(pageLabels).length,
      confidence,
      durationMs: nowMs() - startMs,
    });

    return {
      cuttingInstructions,
      pageLabels,
      confidence,
      strategyUsed: 'text',
      diagnostics: {
        strategies: diagnostics,
        totalDurationMs: nowMs() - startMs,
        budgetRemaining: budget.getRemaining().remainingCalls,
        budgetLimit: maxLlmCallsPerSession,
      },
    };
  }

  // Strategy 2: OCR segmentation
  const ocrStartMs = nowMs();
  let ocrResult: HeaderImageSegmentationResult | null = null;
  let ocrSuccess = false;
  let ocrReason: string | undefined;

  if (enableOcr) {
    try {
      ocrResult = await segmentByHeaderImages(pdfBuffer, totalPages, {
        cacheTag,
        hashDistanceThreshold: ocrOptions?.hashDistanceThreshold,
        cropHeightFraction: ocrOptions?.cropHeightFraction,
        enableOcr: ocrOptions?.enableOcr !== false,
      });

      if (ocrResult && ocrResult.segmentCount > 1 && ocrResult.confidence >= MIN_STRATEGY_CONFIDENCE) {
        ocrSuccess = true;
      } else if (!ocrResult) {
        ocrReason = 'no boundaries detected';
      } else {
        ocrReason = `low confidence (${ocrResult.confidence}) or single segment`;
      }
    } catch (err) {
      ocrReason = `error: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn('page-labeler: OCR strategy failed', { reason: ocrReason });
    }
  } else {
    ocrReason = 'OCR disabled';
  }

  const ocrDurationMs = nowMs() - ocrStartMs;
  diagnostics.push({
    strategy: 'ocr',
    durationMs: ocrDurationMs,
    success: ocrSuccess,
    pagesProcessed: ocrResult?.segmentCount || 0,
    labelsExtracted: ocrResult?.diagnostics.filter(d => d.label).length || 0,
    reason: ocrReason,
  });

  // If OCR strategy succeeded, return
  if (ocrSuccess && ocrResult) {
    const { pageLabels, cuttingInstructions, confidence } = convertHeaderImageResult(ocrResult, 'ocr');

    logger.info('page-labeler: OCR strategy succeeded', {
      labelsExtracted: Object.keys(pageLabels).length,
      confidence,
      durationMs: nowMs() - startMs,
    });

    return {
      cuttingInstructions,
      pageLabels,
      confidence,
      strategyUsed: 'ocr',
      diagnostics: {
        strategies: diagnostics,
        totalDurationMs: nowMs() - startMs,
        budgetRemaining: budget.getRemaining().remainingCalls,
        budgetLimit: maxLlmCallsPerSession,
      },
    };
  }

  // Strategy 3: LLM fallback (last resort with budget limits)
  const llmStartMs = nowMs();
  let llmSuccess = false;
  let llmReason: string | undefined;
  const llmPageLabels: Record<number, PageLabel> = {};

  // Check budget before attempting LLM
  if (!enableLlm) {
    llmReason = 'LLM disabled';
  } else if (totalPages < MIN_PAGES_FOR_LLM) {
    llmReason = `too few pages (${totalPages}) for LLM fallback`;
  } else if (!budget.check().allowed) {
    llmReason = 'budget exhausted';
  } else {
    try {
      // Load LLM config for provider/model settings
      const llmConfig = await loadLLMConfig();

      const maxPagesToProcess = Math.min(totalPages, maxLLmPages);
      const pagesToLabel: number[] = [];
      
      // Sample pages evenly across the document
      const step = Math.max(1, Math.floor(maxPagesToProcess / maxHeaderBatches));
      for (let i = 0; i < maxPagesToProcess && pagesToLabel.length < maxHeaderBatches; i += step) {
        pagesToLabel.push(i + 1); // 1-indexed
      }

      for (const pageNum of pagesToLabel) {
        if (!budget.check().allowed) {
          llmReason = 'budget exhausted during processing';
          break;
        }

        budget.record(1000);

        // Build prompt for this page
        const prompt = buildHeaderLabelPrompt(
          llmConfig.headerLabelUserPrompt || '',
          { pageNumbers: [pageNum] }
        );

        // Convert runtime config to adapter config
        const adapterConfig = runtimeToAdapterConfig(llmConfig);

        // Invoke LLM
        const response = await callVisionModel(
          adapterConfig,
          [],
          prompt,
          {
            system: llmConfig.headerLabelPrompt,
            modelParams: llmConfig.headerLabelModelParams,
            maxTokens: 500,
          }
        );

        // Parse response for label
        const text = response.content || '';
        const normalizedLabel = normalizePdfText(text);

        if (normalizedLabel && normalizedLabel.length > 0) {
          llmPageLabels[pageNum] = {
            label: normalizedLabel.slice(0, 100), // Truncate long labels
            confidence: 50, // LLM confidence is uncertain
            source: 'llm',
          };
        }
      }

      const labelsCount = Object.keys(llmPageLabels).length;
      if (labelsCount >= MIN_TEXT_LABELS) {
        llmSuccess = true;
      } else {
        llmReason = `insufficient labels extracted (${labelsCount})`;
      }
    } catch (err) {
      llmReason = `error: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn('page-labeler: LLM strategy failed', { reason: llmReason });
    }
  }

  const llmDurationMs = nowMs() - llmStartMs;
  diagnostics.push({
    strategy: 'llm',
    durationMs: llmDurationMs,
    success: llmSuccess,
    pagesProcessed: Object.keys(llmPageLabels).length,
    labelsExtracted: Object.keys(llmPageLabels).length,
    reason: llmReason,
  });

  // Determine final result
  let finalPageLabels: Record<number, PageLabel>;
  let finalStrategy: LabelingStrategy;
  let finalConfidence: number;

  if (textResult) {
    // Fall back to text results even if not fully successful
    const { pageLabels, confidence } = convertSegmentationResult(textResult, 'text');
    finalPageLabels = pageLabels;
    finalStrategy = 'text';
    finalConfidence = confidence;
  } else if (ocrResult) {
    // Fall back to OCR results
    const { pageLabels, confidence } = convertHeaderImageResult(ocrResult, 'ocr');
    finalPageLabels = pageLabels;
    finalStrategy = 'ocr';
    finalConfidence = confidence;
  } else if (llmSuccess && Object.keys(llmPageLabels).length > 0) {
    // Use LLM results
    finalPageLabels = llmPageLabels;
    finalStrategy = 'llm';
    finalConfidence = 50;
  } else {
    // Last resort: generate generic labels
    finalPageLabels = {};
    finalStrategy = 'hybrid';
    finalConfidence = 0;
  }

  // If multiple strategies contributed, mark as hybrid
  const strategyCount = diagnostics.filter(d => d.success).length;
  if (strategyCount > 1) {
    finalStrategy = 'hybrid';
  }

  // Generate cutting instructions
  const cuttingInstructions = buildFallbackCuttingInstructions(finalPageLabels, totalPages);

  logger.info('page-labeler: orchestration complete', {
    strategyUsed: finalStrategy,
    labelsExtracted: Object.keys(finalPageLabels).length,
    confidence: finalConfidence,
    cuttingInstructionsCount: cuttingInstructions.length,
    durationMs: nowMs() - startMs,
  });

  return {
    cuttingInstructions,
    pageLabels: finalPageLabels,
    confidence: finalConfidence,
    strategyUsed: finalStrategy,
    diagnostics: {
      strategies: diagnostics,
      totalDurationMs: nowMs() - startMs,
      budgetRemaining: budget.getRemaining().remainingCalls,
      budgetLimit: maxLlmCallsPerSession,
    },
  };
}
