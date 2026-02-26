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
import { renderPdfPageBatch } from '@/lib/services/pdf-renderer';
import { callVisionModel } from '@/lib/llm';
import { loadSmartUploadRuntimeConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';
import type { LLMRuntimeConfig } from '@/lib/llm/config-loader';
import {
  validateAndNormalizeInstructions,
  buildGapInstructions,
} from '@/lib/services/cutting-instructions';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import { extractPdfPageHeaders } from '@/lib/services/pdf-text-extractor';
import { detectPartBoundaries } from '@/lib/services/part-boundary-detector';
import {
  queueSmartUploadSecondPass,
  queueSmartUploadAutoCommit,
  SmartUploadJobProgress,
} from '@/lib/jobs/smart-upload';
import { buildPartFilename, buildPartStorageSlug, normalizeInstrumentLabel } from '@/lib/smart-upload/part-naming';
import { logger } from '@/lib/logger';
import { buildVisionPrompt } from '@/lib/smart-upload/prompts';
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
  pdfBuffer: Buffer
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
  });

  logger.info('PDF pages sampled for LLM', {
    totalPages,
    sampledCount: images.length,
    indices,
  });

  return { images, totalPages, sampledIndices: indices };
}



function parseVisionResponse(content: string, totalPages: number): ExtractedMetadata {
  // 1. Strip markdown code fences
  const cleaned = content
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  // 2. Extract first top-level JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error('parseVisionResponse: no JSON object found', {
      contentPreview: content.slice(0, 200),
    });
    return buildFallbackMetadata(totalPages);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    logger.error('parseVisionResponse: JSON.parse failed', { err });
    return buildFallbackMetadata(totalPages);
  }

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

  // Step 1: Download and render PDF to images
  await progress('downloading', 5, 'Downloading PDF from storage');

  const downloadResult = await downloadFile(smartSession.storageKey);
  if (typeof downloadResult === 'string') {
    throw new Error('Expected file stream but got URL');
  }

  const pdfBuffer = await streamToBuffer(downloadResult.stream);

  await progress('rendering', 10, 'Rendering PDF pages to images');

  const { images: pageImages, totalPages, sampledIndices } = await samplePdfPages(pdfBuffer);

  // -----------------------------------------------------------------
  // Text layer detection (deterministic segmentation when available)
  // -----------------------------------------------------------------
  await progress('analyzing', 20, 'Detecting text layer for deterministic segmentation');

  const pageHeaderResult = await extractPdfPageHeaders(
    pdfBuffer,
    Math.min(totalPages, llmConfig.maxPages || 50)
  );

  let deterministicInstructions: CuttingInstruction[] | null = null;
  let deterministicConfidence = 0;

  if (pageHeaderResult.hasTextLayer) {
    logger.info('Text layer detected — attempting deterministic segmentation', {
      sessionId,
      coverage: pageHeaderResult.textLayerCoverage,
    });

    const segResult = detectPartBoundaries(pageHeaderResult.pageHeaders, totalPages, true);
    if (segResult.segments.length > 1 || segResult.segmentationConfidence >= 60) {
      deterministicInstructions = segResult.cuttingInstructions;
      deterministicConfidence = segResult.segmentationConfidence;
      logger.info('Deterministic segmentation succeeded', {
        sessionId,
        segments: segResult.segments.length,
        confidence: deterministicConfidence,
      });
    }
  }

  // Step 2: Vision LLM analysis
  await progress('analyzing', 30, 'Running AI vision analysis on pages');

  const images = pageImages.map((base64Data) => ({
    mimeType: 'image/png' as const,
    base64Data,
  }));

  const adapterConfig = runtimeToAdapterConfig(llmConfig);

  const visionPrompt = buildVisionPrompt(
    llmConfig.visionSystemPrompt || '',
    {
      totalPages,
      sampledPageNumbers: sampledIndices,
    }
  );

  const visionResult = await callVisionModel(
    adapterConfig,
    images,
    visionPrompt,
    {
      maxTokens: 4096,
      temperature: 0.1,
    }
  );

  const extraction = parseVisionResponse(visionResult.content, totalPages);

  // If deterministic segmentation produced instructions, overlay them on the LLM extraction
  if (deterministicInstructions && deterministicInstructions.length > 0) {
    extraction.cuttingInstructions = deterministicInstructions;
    // Boost confidence when deterministic path used
    extraction.confidenceScore = Math.max(
      extraction.confidenceScore,
      deterministicConfidence
    );
    logger.info('Using deterministic cutting instructions', { sessionId, parts: deterministicInstructions.length });
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
        extractedMetadata: JSON.parse(JSON.stringify(extraction)),
        confidenceScore: extraction.confidenceScore,
        routingDecision: 'no_parse_second_pass',
        parseStatus: 'NOT_PARSED',
        secondPassStatus: 'QUEUED',
        cuttingInstructions: JSON.parse(JSON.stringify(cuttingInstructions)),
        llmProvider: llmConfig.provider,
        llmVisionModel: llmConfig.visionModel,
        llmVerifyModel: llmConfig.verificationModel,
        llmModelParams: { temperature: 0.1, max_tokens: 4096 },
        llmPromptVersion: llmConfig.promptVersion || '1.0.0',
      },
    });

    // Queue for second pass
    await queueSmartUploadSecondPass(sessionId);

    await progress('queued_for_second_pass', 100, 'Queued for second pass verification');

    return { status: 'queued_for_second_pass', sessionId };
  }

  // Step 4: Split PDF
  await progress('splitting', 70, `Splitting PDF into ${validation.instructions.length} parts`);

  // Convert validation instructions to full CuttingInstruction format
  // Gap instructions (from buildGapInstructions) already carry their own metadata
  const validatedInstructions: CuttingInstruction[] = validation.instructions.map((inst, idx) => {
    const originalCut = cuttingInstructions[idx];
    return {
      instrument: inst.instrument || originalCut?.instrument || 'Unknown',
      partName: inst.partName,
      section: inst.section || originalCut?.section || 'Other',
      transposition: inst.transposition || originalCut?.transposition || 'C',
      partNumber: inst.partNumber || originalCut?.partNumber || idx + 1,
      pageRange: inst.pageRange,
    };
  });

  const splitResults = await splitPdfByCuttingInstructions(
    pdfBuffer,
    smartSession.fileName.replace(/\.pdf$/i, ''),
    validatedInstructions
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
      pageRange: result.instruction.pageRange,
    });
  }

  // Step 6: If needs second pass, queue it
  let secondPassStatus: SecondPassStatus = 'NOT_NEEDED';
  if (routingDecision === 'auto_parse_second_pass') {
    secondPassStatus = 'QUEUED';
    await queueSmartUploadSecondPass(sessionId);
  }

  // Determine if we should auto-commit (fully autonomous mode)
  const shouldAutoCommit =
    llmConfig.enableFullyAutonomousMode &&
    extraction.confidenceScore >= llmConfig.autonomousApprovalThreshold &&
    secondPassStatus === 'NOT_NEEDED';

  // Update session with results
  await prisma.smartUploadSession.update({
    where: { uploadSessionId: sessionId },
    data: {
      extractedMetadata: JSON.parse(JSON.stringify(extraction)),
      confidenceScore: extraction.confidenceScore,
      routingDecision,
      parseStatus: 'PARSED',
      parsedParts: JSON.parse(JSON.stringify(parsedParts)),
      cuttingInstructions: JSON.parse(JSON.stringify(validatedInstructions)),
      tempFiles: JSON.parse(JSON.stringify(tempFiles)),
      autoApproved: shouldAutoCommit,
      secondPassStatus: secondPassStatus === 'NOT_NEEDED' ? null : secondPassStatus,
      llmProvider: llmConfig.provider,
      llmVisionModel: llmConfig.visionModel,
      llmVerifyModel: llmConfig.verificationModel,
      llmModelParams: { temperature: 0.1, max_tokens: 4096 },
      llmPromptVersion: llmConfig.promptVersion || '2.0.0',
      ...(firstPassRaw ? { firstPassRaw } : {}),
    },
  });

  // Queue auto-commit if eligible
  if (shouldAutoCommit) {
    logger.info('Autonomous mode: queueing auto-commit', {
      sessionId,
      confidence: extraction.confidenceScore,
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
  });

  return {
    status: 'complete',
    sessionId,
    partsCreated: parsedParts.length,
  };
}
