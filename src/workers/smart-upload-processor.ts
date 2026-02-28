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
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import { extractPdfPageHeaders, type PageHeader } from '@/lib/services/pdf-text-extractor';
import { detectPartBoundaries } from '@/lib/services/part-boundary-detector';
import { extractOcrFallbackMetadata } from '@/lib/services/ocr-fallback';
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
  const pdfDoc = await PDFDocument.load(pdfBuffer);
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
  const adapterConfig = runtimeToAdapterConfig(llmConfig);

  // ── Budget tracking ────────────────────────────────────────────────────
  const budget = createSessionBudget(sessionId, {
    smart_upload_budget_max_llm_calls_per_session: llmConfig.budgetMaxLlmCalls,
    smart_upload_budget_max_input_tokens_per_session: llmConfig.budgetMaxInputTokens,
  });

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

  // Get total page count (lightweight — no rendering)
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();

  // -----------------------------------------------------------------
  // Text layer detection (deterministic segmentation when available)
  // -----------------------------------------------------------------
  await progress('analyzing', 15, 'Detecting text layer for deterministic segmentation');

  const pageHeaderResult = await extractPdfPageHeaders(
    pdfBuffer,
    totalPages
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
  // OCR-First Pipeline:
  // If deterministic segmentation produced high-confidence cutting
  // instructions, skip the LLM entirely — extract title/composer via
  // OCR fallback (text-layer + filename parsing) and proceed directly
  // to validation, splitting, and quality gates.
  //
  // The LLM is only invoked when:
  //  (a) No text layer or segmentation confidence is too low
  //  (b) Single-part PDFs where boundary detection is irrelevant
  // -----------------------------------------------------------------

  let extraction: ExtractedMetadata;
  let firstPassRaw: string | null = null;

  const ocrFirstEligible =
    deterministicInstructions !== null &&
    deterministicInstructions.length > 0 &&
    deterministicConfidence >= llmConfig.skipParseThreshold;

  if (ocrFirstEligible) {
    // ── OCR-first path: deterministic segmentation is sufficient ──────────
    await progress('analyzing', 30, 'OCR-first: using deterministic segmentation (no LLM needed)');

    logger.info('OCR-first pipeline: skipping LLM — deterministic confidence sufficient', {
      sessionId,
      deterministicConfidence,
      threshold: llmConfig.skipParseThreshold,
      segments: deterministicInstructions!.length,
    });

    // Extract title/composer from text-layer + filename parsing
    const ocrMeta = await extractOcrFallbackMetadata({
      pdfBuffer,
      filename: smartSession.fileName,
    });

    extraction = {
      title: ocrMeta.title || smartSession.fileName.replace(/\.pdf$/i, ''),
      composer: ocrMeta.composer,
      confidenceScore: deterministicConfidence,
      fileType: 'FULL_SCORE',
      isMultiPart: deterministicInstructions!.length > 1,
      parts: deterministicInstructions!.map((ci, i) => ({
        instrument: ci.instrument,
        partName: ci.partName,
        section: ci.section,
        transposition: ci.transposition,
        partNumber: ci.partNumber ?? i + 1,
      })),
      cuttingInstructions: toOneIndexedInstructions(deterministicInstructions!),
      pageLabels,
      segmentationConfidence: deterministicConfidence,
      notes: `Processed via OCR-first pipeline (deterministic segmentation, confidence: ${deterministicConfidence}%). No LLM calls used.`,
    };

    logger.info('OCR-first extraction complete', {
      sessionId,
      title: extraction.title,
      composer: extraction.composer,
      parts: extraction.cuttingInstructions?.length ?? 0,
      confidence: extraction.confidenceScore,
    });
  } else {
    // ── LLM fallback: deterministic segmentation insufficient ─────────────
    // When the provider supports native PDF input, send the entire PDF
    // directly — this is faster and far more accurate than rendering
    // individual page images or header crops.
    // -----------------------------------------------------------------

    let visionResult: { content: string };
    let sampledIndices: number[] = [];
    // Hoisted for retry access across both PDF and image branches
    let pdfDocumentRef: LabeledDocument | undefined;
    let visionPromptRef: string = '';
    let pageImagesRef: string[] = [];

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
      visionPromptRef = pdfPrompt;

      visionResult = await callVisionModel(
        adapterConfig,
        [], // no images — PDF is the input
        pdfPrompt,
        {
          system: llmConfig.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
          responseFormat: { type: 'json' },
          modelParams: llmConfig.visionModelParams,
          maxTokens: 8192,
          temperature: 0.1,
          documents: [pdfDocument],
        },
      );
      budget.record();
    } else {
      // ── Standard image-based vision mode (fallback for non-PDF providers) ─
      await progress('rendering', 10, 'Rendering PDF pages to images');

      const sampleResult = await samplePdfPages(pdfBuffer, sessionId);
      const pageImages = sampleResult.images;
      pageImagesRef = pageImages;
      sampledIndices = sampleResult.sampledIndices;

      // For scanned/image PDFs without text layer, try header-crop labeling
      if (!deterministicInstructions || deterministicConfidence < llmConfig.skipParseThreshold) {
        await progress('analyzing', 25, 'Running header-label pass for scanned pages');

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

          const headerAdapterConfig = {
            ...adapterConfig,
            llm_vision_model: llmConfig.verificationModel,
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
                system: llmConfig.headerLabelPrompt || DEFAULT_HEADER_LABEL_SYSTEM_PROMPT,
                responseFormat: { type: 'json' },
                maxTokens: 2048,
                temperature: 0.1,
                modelParams: llmConfig.verificationModelParams,
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

          const pageHeaders: PageHeader[] = allParsedHeaderLabels.map((entry) => ({
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
              logger.info('Header-label segmentation succeeded', {
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

      const visionPrompt = buildVisionPrompt(
        llmConfig.visionUserPrompt || DEFAULT_VISION_USER_PROMPT_TEMPLATE,
        {
          totalPages,
          sampledPageNumbers: sampledIndices,
        },
      );
      visionPromptRef = visionPrompt;

      visionResult = await callVisionModel(
        adapterConfig,
        images,
        visionPrompt,
        {
          system: llmConfig.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
          responseFormat: { type: 'json' },
          modelParams: llmConfig.visionModelParams,
          maxTokens: 8192,
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
        maxTokens: 8192,
        temperature: 0.1,
      };
      if (pdfDocumentRef) {
        visionResult = await callVisionModel(adapterConfig, [], visionPromptRef, {
          ...retryOptions,
          documents: [pdfDocumentRef],
        });
      } else {
        const retryImages = pageImagesRef.map((base64Data, index) => ({
          mimeType: 'image/png' as const,
          base64Data,
          label: `Original Page ${sampledIndices[index] + 1}`,
        }));
        visionResult = await callVisionModel(adapterConfig, retryImages, visionPromptRef, retryOptions);
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
  const validation = validateAndNormalizeInstructions(
    cuttingInstructions,
    totalPages,
    { oneIndexed: true, detectGaps: true }
  );

  // Detect and fill uncovered page ranges (gaps between cuts)
  const gapInstructions = buildGapInstructions(validation.instructions, totalPages);
  if (gapInstructions.length > 0) {
    logger.warn('Gap pages detected — adding uncovered parts', {
      sessionId,
      gaps: gapInstructions.map((g) => g.pageRange),
    });
    validation.instructions.push(...gapInstructions);
    validation.warnings.push(
      `${gapInstructions.length} uncovered page range(s) were added as 'Unlabelled' parts`
    );

    // If ALL instructions are gap-fills (LLM returned 0 valid cutting instructions),
    // the extraction is fundamentally incomplete — force low confidence.
    const validLlmInstructions = validation.instructions.length - gapInstructions.length;
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

  const normalizedInstructionsZero = validation.instructions;
  const normalizedInstructionsOne = toOneIndexedInstructions(normalizedInstructionsZero);

  if (validation.isValid) {
    extraction.cuttingInstructions = normalizedInstructionsOne;
  }

  // Determine routing decision based on confidence
  const { decision: routingDecision, autoApproved: _autoApproved } = determineRoutingDecision(
    extraction.confidenceScore,
    llmConfig
  );

  // If validation failed or low confidence, queue for second pass
  if (!validation.isValid || extraction.confidenceScore < llmConfig.skipParseThreshold) {
    logger.warn('Low confidence or validation failed, queueing for second pass', {
      sessionId,
      confidence: extraction.confidenceScore,
      validationErrors: validation.errors,
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
  await progress('splitting', 70, `Splitting PDF into ${validation.instructions.length} parts`);

  // Sanitize instructions before splitting — remove entries with invalid pageRange
  const validatedInstructions = sanitizeCuttingInstructionsForSplit(normalizedInstructionsZero);

  const splitResults = await splitPdfByCuttingInstructions(
    pdfBuffer,
    smartSession.fileName.replace(/\.pdf$/i, ''),
    validatedInstructions,
    { indexing: 'zero' }
  );

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
  const gateResult = evaluateQualityGates({
    parsedParts,
    metadata: extraction,
    totalPages,
    maxPagesPerPart: llmConfig.maxPagesPerPart ?? 12,
    segmentationConfidence: extraction.segmentationConfidence,
  });

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
      cuttingInstructions: deepCloneJSON(normalizedInstructionsOne) as any,
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
