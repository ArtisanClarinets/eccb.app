/**
 * Smart Upload Processor Worker
 *
 * Handles the main Smart Upload pipeline:
 * 1. Download and render PDF to images
 * 2. Vision LLM analysis for metadata extraction
 * 3. Validate cutting instructions
 * 4. Split PDF into parts
 * 5. Save part records to database
 * 6. Queue for second pass if needed
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
import {
  queueSmartUploadSecondPass,
  queueSmartUploadAutoCommit,
  SmartUploadJobProgress,
} from '@/lib/jobs/smart-upload';
import { buildPartFilename, buildPartStorageSlug, normalizeInstrumentLabel } from '@/lib/smart-upload/part-naming';
import { evaluateQualityGates, isForbiddenLabel } from '@/lib/smart-upload/quality-gates';
import { parseJsonLenient, safePreview } from '@/lib/smart-upload/json';
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

  const confidenceScore =
    typeof parsed.confidenceScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.confidenceScore)))
      : 0;

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

  // Step 1: Download and render PDF to images
  await progress('downloading', 5, 'Downloading PDF from storage');

  const downloadResult = await downloadFile(smartSession.storageKey);
  if (typeof downloadResult === 'string') {
    throw new Error('Expected file stream but got URL');
  }

  const pdfBuffer = await streamToBuffer(downloadResult.stream);

  await progress('rendering', 10, 'Rendering PDF pages to images');

  const { images: pageImages, totalPages, sampledIndices } = await samplePdfPages(pdfBuffer, sessionId);

  // -----------------------------------------------------------------
  // Text layer detection (deterministic segmentation when available)
  // -----------------------------------------------------------------
  await progress('analyzing', 20, 'Detecting text layer for deterministic segmentation');

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

  // For scanned/image PDFs, try a header-crop labeling pass to recover boundaries.
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

      // -----------------------------------------------------------------------
      // Batched header-label LLM call.
      // We chunk the pages so each LLM request stays within
      // MAX_HEADER_CROP_BATCH_SIZE images — crucial for providers with small
      // context windows (GPT-4V, Groq). Gemini handles >67 images but batching
      // keeps latency and cost predictable across all providers.
      // -----------------------------------------------------------------------
      const allParsedHeaderLabels: HeaderLabelEntry[] = [];
      for (let batchStart = 0; batchStart < headerCropImages.length; batchStart += MAX_HEADER_CROP_BATCH_SIZE) {
        // Budget check before each header-label batch call
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

        const batchPrompt = buildHeaderLabelPrompt(llmConfig.headerLabelPrompt || '', {
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
            system: DEFAULT_HEADER_LABEL_SYSTEM_PROMPT,
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
          // Persist per-page header labels from vision pass for Review UI
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

  // Step 2: Vision LLM analysis
  await progress('analyzing', 30, 'Running AI vision analysis on pages');

  let visionResult: { content: string };

  if (canSendPdf) {
    // ── PDF-to-LLM mode: send the whole PDF as a native document ──────────
    logger.info('Using PDF-to-LLM mode', { sessionId, provider: llmConfig.provider });

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

    const pdfPrompt = buildPdfVisionPrompt(
      DEFAULT_PDF_VISION_USER_PROMPT_TEMPLATE,
      { totalPages },
    );

    visionResult = await callVisionModel(
      adapterConfig,
      [], // no images — PDF is the input
      pdfPrompt,
      {
        system: llmConfig.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
        responseFormat: { type: 'json' },
        modelParams: llmConfig.visionModelParams,
        maxTokens: 4096,
        temperature: 0.1,
        documents: [pdfDocument],
      },
    );
    budget.record();
  } else {
    // ── Standard image-based vision mode ──────────────────────────────────
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
      DEFAULT_VISION_USER_PROMPT_TEMPLATE,
      {
        totalPages,
        sampledPageNumbers: sampledIndices,
      },
    );

    visionResult = await callVisionModel(
      adapterConfig,
      images,
      visionPrompt,
      {
        system: llmConfig.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT,
        responseFormat: { type: 'json' },
        modelParams: llmConfig.visionModelParams,
        maxTokens: 4096,
        temperature: 0.1,
      },
    );
    budget.record();
  }

  const extraction = parseVisionResponse(visionResult.content, totalPages);

  // If deterministic segmentation produced instructions, overlay them on the LLM extraction
  if (deterministicInstructions && deterministicInstructions.length > 0) {
    extraction.cuttingInstructions = toOneIndexedInstructions(deterministicInstructions);
    // Boost confidence when deterministic path used
    extraction.confidenceScore = Math.max(
      extraction.confidenceScore,
      deterministicConfidence
    );
    logger.info('Using deterministic cutting instructions', { sessionId, parts: deterministicInstructions.length });
  }

  // Persist per-page labels and segmentation confidence in extractedMetadata
  if (Object.keys(pageLabels).length > 0) {
    extraction.pageLabels = pageLabels;
  }
  if (deterministicConfidence > 0) {
    extraction.segmentationConfidence = deterministicConfidence;
  }

  // Store the raw first-pass LLM response for audit purposes
  const firstPassRaw = visionResult.content;

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
