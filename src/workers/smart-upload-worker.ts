/**
 * Smart Upload Worker for ECCB Platform
 *
 * Handles second-pass verification of music uploads using LLM.
 * This runs as a background job to avoid blocking the upload API.
 */

import { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { downloadFile, uploadFile } from '@/lib/services/storage';
import { renderPdfPageBatch } from '@/lib/services/pdf-renderer';
import { callVisionModel } from '@/lib/llm';
import { loadSmartUploadRuntimeConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';
import type { LLMRuntimeConfig } from '@/lib/llm/config-loader';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import { buildGapInstructions, validateAndNormalizeInstructions } from '@/lib/services/cutting-instructions';
import { queueSmartUploadAutoCommit } from '@/lib/jobs/smart-upload';
import { evaluateQualityGates } from '@/lib/smart-upload/quality-gates';
import { buildPartStorageSlug, buildPartFilename } from '@/lib/smart-upload/part-naming';
import { jsonrepair as repairJson } from 'jsonrepair';
import { logger } from '@/lib/logger';
import {
  buildVerificationPrompt,
  DEFAULT_VERIFICATION_SYSTEM_PROMPT,
  DEFAULT_ADJUDICATOR_SYSTEM_PROMPT,
  buildAdjudicatorPrompt,
} from '@/lib/smart-upload/prompts';
import type {
  CuttingInstruction,
  ExtractedMetadata,
  ParsedPartRecord,
  SecondPassStatus,
} from '@/types/smart-upload';
import type { SmartUploadSecondPassJobData } from '@/lib/jobs/definitions';

// =============================================================================
// Constants
// =============================================================================

const MAX_PDF_PAGES_FOR_LLM = 100; // Raised from 50 — ensures large PDFs (e.g. 67-page band parts) are fully covered
const MAX_SAMPLED_PARTS = 3;
/** Number of pages sent to the adjudicator — sampled evenly across the whole PDF */
const MAX_ADJUDICATOR_PAGES = 20;



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

async function convertAllPdfPagesToImages(pdfBuffer: Buffer): Promise<string[]> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES_FOR_LLM);

  logger.info('Converting PDF pages to images', { totalPages, pagesToProcess });

  const pageIndices = Array.from({ length: pagesToProcess }, (_, i) => i);
  return renderPdfPageBatch(pdfBuffer, pageIndices);
}

// Token bucket rate limiter for LLM calls
class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  constructor(rpm: number) {
    this.maxTokens = rpm;
    this.tokens = rpm;
    this.refillRate = rpm / 60;
    this.lastRefill = Date.now();
  }
  setLimit(rpm: number): void {
    this.maxTokens = rpm;
    this.refillRate = rpm / 60;
    if (this.tokens > rpm) this.tokens = rpm;
  }
  async consume(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) { this.tokens -= 1; return; }
    const wait = (1 - this.tokens) / this.refillRate * 1000;
    await new Promise(r => setTimeout(r, wait));
    this.refill();
    this.tokens -= 1;
  }
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
const llmRateLimiter = new TokenBucketRateLimiter(15);

/**
 * Call the verification LLM using the shared adapter pattern.
 * Uses verificationModel instead of visionModel for the second pass.
 * Accepts optional labeled inputs (sampled parts) for cross-reference.
 */
async function callVerificationLLM(
  pageImages: string[],
  cfg: LLMRuntimeConfig,
  prompt: string,
  labeledImages?: Array<{ label: string; base64Data: string }>,
): Promise<{ parsed: ExtractedMetadata; raw: string }> {
  // setLimit BEFORE consume (rate limiter fix)
  llmRateLimiter.setLimit(cfg.rateLimit);
  await llmRateLimiter.consume();

  // Use verification model for second pass — override llm_vision_model field
  const adapterConfig = {
    ...runtimeToAdapterConfig(cfg),
    llm_vision_model: cfg.verificationModel,
  };

  const images = pageImages.map((base64Data) => ({
    mimeType: 'image/png' as const,
    base64Data,
  }));

  const response = await callVisionModel(adapterConfig, images, prompt, {
    system: cfg.verificationSystemPrompt || DEFAULT_VERIFICATION_SYSTEM_PROMPT,
    responseFormat: { type: 'json' as const },
    maxTokens: 4096,
    temperature: 0.1,
    modelParams: cfg.verificationModelParams,
    ...(labeledImages && labeledImages.length > 0
      ? {
          labeledInputs: labeledImages.map(({ label, base64Data }) => ({
            label,
            mimeType: 'image/png' as const,
            base64Data,
          })),
        }
      : {}),
  });

  const raw = response.content;
  return { parsed: parseVerificationResponse(raw), raw };
}

/**
 * Detect critical disagreements between first and second pass results.
 */
function detectDisagreements(
  first: ExtractedMetadata,
  second: ExtractedMetadata
): string[] {
  const disagreements: string[] = [];

  if (first.title?.toLowerCase().trim() !== second.title?.toLowerCase().trim()) {
    disagreements.push(`Title mismatch: "${first.title}" vs "${second.title}"`);
  }

  if (first.composer?.toLowerCase().trim() !== second.composer?.toLowerCase().trim()) {
    disagreements.push(`Composer mismatch: "${first.composer}" vs "${second.composer}"`);
  }

  // Compare cutting instructions (instrument mapping)
  const firstParts = first.cuttingInstructions?.map(p => p.instrument).sort().join(',') || '';
  const secondParts = second.cuttingInstructions?.map(p => p.instrument).sort().join(',') || '';
  
  if (firstParts !== secondParts) {
    disagreements.push('Instrument mapping mismatch in cutting instructions');
  }

  return disagreements;
}

/**
 * Call the adjudicator LLM to resolve disagreements.
 */
async function callAdjudicatorLLM(
  pageImages: string[],
  cfg: LLMRuntimeConfig,
  prompt: string
): Promise<{ 
  adjudicatedMetadata: ExtractedMetadata; 
  adjudicationNotes: string | null;
  finalConfidence: number;
  requiresHumanReview: boolean;
  raw: string;
}> {
  // Rate limiting
  llmRateLimiter.setLimit(cfg.rateLimit);
  await llmRateLimiter.consume();

  const adapterConfig = {
    ...runtimeToAdapterConfig(cfg),
    llm_vision_model: cfg.adjudicatorModel || cfg.verificationModel,
  };

  // Sample evenly across all available pages so the adjudicator sees the full document,
  // not just the first 10 pages (which would miss instrument parts near the end of large PDFs).
  const adjStep = Math.max(1, Math.floor(pageImages.length / MAX_ADJUDICATOR_PAGES));
  const adjudicatorPageImages = pageImages.filter((_, i) => i % adjStep === 0).slice(0, MAX_ADJUDICATOR_PAGES);
  const images = adjudicatorPageImages.map((base64Data) => ({
    mimeType: 'image/png' as const,
    base64Data,
  }));

  const response = await callVisionModel(adapterConfig, images, prompt, {
    system: DEFAULT_ADJUDICATOR_SYSTEM_PROMPT,
    responseFormat: { type: 'json' as const },
    maxTokens: 4096,
    temperature: 0.1,
  });

  const raw = response.content;
  const parsed = parseVerificationResponse(raw) as any;

  return {
    adjudicatedMetadata: parsed.adjudicatedMetadata || parsed,
    adjudicationNotes: parsed.adjudicationNotes || null,
    finalConfidence: parsed.finalConfidence || 0,
    requiresHumanReview: !!parsed.requiresHumanReview,
    raw,
  };
}

function parseVerificationResponse(content: string): ExtractedMetadata {
  const cleaned = content
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error('parseVerificationResponse: no JSON found', { preview: content.slice(0, 200) });
    throw new Error('No JSON found in verification LLM response');
  }
  try {
    return JSON.parse(jsonMatch[0]) as ExtractedMetadata;
  } catch {
    // Fallback: attempt to repair malformed JSON from LLM
    try {
      return JSON.parse(repairJson(jsonMatch[0])) as ExtractedMetadata;
    } catch (repairErr) {
      logger.error('parseVerificationResponse: JSON.parse and jsonrepair both failed', { repairErr });
      throw new Error('Invalid JSON in verification LLM response');
    }
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// =============================================================================
// Final Result Handler (handles DB updates, PDF splitting, and auto-approval)
// =============================================================================

async function finalizeSmartUploadSession(
  sessionId: string,
  smartSession: { parseStatus: string | null; routingDecision: string | null; fileName: string; uploadSessionId: string; extractedMetadata: unknown },
  updateData: Record<string, unknown>,
  finalMetadata: ExtractedMetadata,
  finalConfidence: number,
  originalPdfBuffer: Buffer,
  parsedParts: ParsedPartRecord[] | null,
  llmConfig: LLMRuntimeConfig,
  adjudicationData?: { 
    raw: string; 
    notes: string | null; 
    requiresHumanReview: boolean;
    status: string;
    model: string;
  }
): Promise<void> {
  // ── Carry forward segmentationConfidence from first-pass session ──────────
  // The first-pass processor stores segmentationConfidence inside extractedMetadata.
  // If the second pass did not produce its own segConf, use the first pass value.
  const firstPassMeta = smartSession.extractedMetadata as ExtractedMetadata | null;
  const firstPassSegConf = firstPassMeta?.segmentationConfidence;
  if (typeof firstPassSegConf === 'number' && finalMetadata.segmentationConfidence === undefined) {
    finalMetadata = { ...finalMetadata, segmentationConfidence: firstPassSegConf };
  }
  const effectiveSegConf = finalMetadata.segmentationConfidence;

  // Recompute finalConfidence = min(verificationConfidence, segmentationConfidence)
  if (typeof effectiveSegConf === 'number') {
    finalConfidence = Math.min(finalConfidence, effectiveSegConf);
  }
  // Base update data
  Object.assign(updateData, {
    extractedMetadata: finalMetadata,
    confidenceScore: finalConfidence,
    llmProvider: llmConfig.provider,
    llmPromptVersion: llmConfig.promptVersion || '2.0.0',
  });

  // Add adjudication data if present
  if (adjudicationData) {
    Object.assign(updateData, {
      adjudicatorStatus: adjudicationData.status,
      adjudicatorResult: finalMetadata, // Adjudicated metadata is the final metadata
      adjudicatorRaw: adjudicationData.raw,
      finalConfidence: finalConfidence,
      requiresHumanReview: adjudicationData.requiresHumanReview,
      llmAdjudicatorModel: adjudicationData.model,
    });
  }

  let correctedCuttingInstructions = finalMetadata.cuttingInstructions;

  // Gap detection — ensure no pages are silently dropped when the LLM doesn't cover
  // the full PDF (common for large scores where sampling misses later instrument parts).
  if (correctedCuttingInstructions && correctedCuttingInstructions.length > 0) {
    try {
      const { PDFDocument: PDFDoc } = await import('pdf-lib');
      const tmpDoc = await PDFDoc.load(originalPdfBuffer);
      const totalPages = tmpDoc.getPageCount();
      // validateAndNormalizeInstructions normalises to zero-indexed; buildGapInstructions
      // expects zero-indexed ranges and totalPages as a count.
      const oneIndexed = correctedCuttingInstructions;
      const zeroIndexed = oneIndexed.map((ins) => ({
        ...ins,
        pageRange: [ins.pageRange[0] - 1, ins.pageRange[1] - 1] as [number, number],
      }));
      const validation = validateAndNormalizeInstructions(zeroIndexed, totalPages, {
        oneIndexed: false,
        detectGaps: true,
      });
      const gapInstructions = buildGapInstructions(validation.instructions, totalPages);
      if (gapInstructions.length > 0) {
        // Convert gaps back to one-indexed to match the rest of the payload
        const oneIndexedGaps = gapInstructions.map((g) => ({
          ...g,
          pageRange: [g.pageRange[0] + 1, g.pageRange[1] + 1] as [number, number],
        }));
        logger.warn('Second pass gap detection: adding unlabelled parts for uncovered pages', {
          sessionId,
          gaps: oneIndexedGaps.map((g) => g.pageRange),
          totalPages,
        });
        correctedCuttingInstructions = [...oneIndexed, ...oneIndexedGaps].sort(
          (a, b) => a.pageRange[0] - b.pageRange[0]
        );
        finalMetadata = { ...finalMetadata, cuttingInstructions: correctedCuttingInstructions };
        // Keep updateData in sync with the enriched metadata
        updateData.extractedMetadata = finalMetadata;
        // If any single unlabelled gap covers more than 10 pages the session
        // cannot be auto-approved — a human reviewer must adjust the splits.
        const largeGap = oneIndexedGaps.some(
          (g) => g.pageRange[1] - g.pageRange[0] + 1 > 10
        );
        if (largeGap) {
          updateData.requiresHumanReview = true;
          logger.warn('Large unlabelled gap detected — marking session for human review', {
            sessionId,
            largestGap: Math.max(...oneIndexedGaps.map((g) => g.pageRange[1] - g.pageRange[0] + 1)),
          });
        }
      } // end if (gapInstructions.length > 0)
    } catch (gapErr) {
      logger.warn('Second pass gap detection failed; proceeding without gap fill', {
        sessionId,
        error: gapErr instanceof Error ? gapErr.message : String(gapErr),
      });
    }
  }

  if (correctedCuttingInstructions && correctedCuttingInstructions.length > 0) {
    updateData.cuttingInstructions = correctedCuttingInstructions;

    if (smartSession.parseStatus !== 'PARSED') {
      const splitResults = await splitPdfByCuttingInstructions(
        originalPdfBuffer,
        smartSession.fileName.replace(/\.pdf$/i, ''),
        correctedCuttingInstructions,
        { indexing: 'one' }
      );
      const newParsedParts: ParsedPartRecord[] = [];
      const tempFiles: string[] = [];
      for (const part of splitResults) {
        const slug = buildPartStorageSlug(part.instruction.partName) || `part_${part.instruction.partNumber ?? 0}`;
        const partStorageKey = `smart-upload/${sessionId}/parts/${slug}.pdf`;
        await uploadFile(partStorageKey, part.buffer, {
          contentType: 'application/pdf',
          metadata: { sessionId, instrument: part.instruction.instrument, partName: part.instruction.partName, section: part.instruction.section, originalUploadId: sessionId },
        });
        tempFiles.push(partStorageKey);
        newParsedParts.push({
          partName: part.instruction.partName, instrument: part.instruction.instrument,
          section: part.instruction.section, transposition: part.instruction.transposition,
          partNumber: part.instruction.partNumber, storageKey: partStorageKey,
          fileName: buildPartFilename(part.instruction.partName || `Part_${part.instruction.partNumber ?? 0}`),
          fileSize: part.buffer.length,
          pageCount: part.pageCount, pageRange: part.instruction.pageRange,
        });
      }
      updateData.parsedParts = newParsedParts;
      updateData.tempFiles = tempFiles;
      updateData.parseStatus = 'PARSED';
      logger.info('PDF split completed in second pass', { sessionId, partsCount: newParsedParts.length });
    } else if (parsedParts && parsedParts.length > 0) {
      const splitResults = await splitPdfByCuttingInstructions(
        originalPdfBuffer,
        smartSession.fileName.replace(/\.pdf$/i, ''),
        correctedCuttingInstructions,
        { indexing: 'one' }
      );
      const newParsedParts: ParsedPartRecord[] = [];
      for (const part of splitResults) {
        const slug = buildPartStorageSlug(part.instruction.partName) || `part_${part.instruction.partNumber ?? 0}`;
        const partStorageKey = `smart-upload/${sessionId}/parts/${slug}.pdf`;
        await uploadFile(partStorageKey, part.buffer, {
          contentType: 'application/pdf',
          metadata: { sessionId, instrument: part.instruction.instrument, partName: part.instruction.partName, section: part.instruction.section, originalUploadId: sessionId },
        });
        newParsedParts.push({
          partName: part.instruction.partName, instrument: part.instruction.instrument,
          section: part.instruction.section, transposition: part.instruction.transposition,
          partNumber: part.instruction.partNumber, storageKey: partStorageKey,
          fileName: buildPartFilename(part.instruction.partName || `Part_${part.instruction.partNumber ?? 0}`),
          fileSize: part.buffer.length,
          pageCount: part.pageCount, pageRange: part.instruction.pageRange,
        });
      }
      updateData.parsedParts = newParsedParts;
      logger.info('Re-split PDF in second pass', { sessionId, newPartsCount: newParsedParts.length });
    }
  }

  // Auto-approve if legacy mode
  const routingDecision = smartSession.routingDecision as string;
  const isHighConfidence = finalConfidence >= llmConfig.autoApproveThreshold;
  const isAutonomousThreshold = finalConfidence >= llmConfig.autonomousApprovalThreshold;
  const isParsed = updateData.parseStatus === 'PARSED' || smartSession.parseStatus === 'PARSED';

  // ── Shared Quality Gates ───────────────────────────────────────────────
  if (!updateData.requiresHumanReview) {
    const parts: ParsedPartRecord[] =
      (updateData.parsedParts as ParsedPartRecord[] | undefined) ?? (parsedParts ?? []);

    let totalPagesForGates = 0;
    try {
      const { PDFDocument: PDFDoc } = await import('pdf-lib');
      const tmpDoc = await PDFDoc.load(originalPdfBuffer);
      totalPagesForGates = tmpDoc.getPageCount();
    } catch { /* best-effort */ }

    const gateResult = evaluateQualityGates({
      parsedParts: parts,
      metadata: finalMetadata,
      totalPages: totalPagesForGates,
      maxPagesPerPart: llmConfig.maxPagesPerPart ?? 12,
      segmentationConfidence: effectiveSegConf,
    });

    if (gateResult.failed) {
      updateData.requiresHumanReview = true;
      for (const reason of gateResult.reasons) {
        logger.warn('Quality gate failed', { sessionId, reason });
      }
    }
    finalConfidence = gateResult.finalConfidence;
  }

  if (isHighConfidence && routingDecision === 'auto_parse_second_pass' && isParsed && !updateData.requiresHumanReview) {
    updateData.autoApproved = true;
    logger.info('Session auto-approved after processing (legacy threshold)', { sessionId, finalConfidence });
  }

  await prisma.smartUploadSession.update({ where: { uploadSessionId: sessionId }, data: updateData });

  // Trigger fully-autonomous auto-commit if configured
  if (
    llmConfig.enableFullyAutonomousMode &&
    isAutonomousThreshold &&
    isParsed &&
    !updateData.requiresHumanReview
  ) {
    logger.info('Autonomous mode: queueing auto-commit', { sessionId, finalConfidence });
    await queueSmartUploadAutoCommit(sessionId);
  }
}

// =============================================================================
// Main Job Processor
// =============================================================================

async function processSecondPass(job: Job<SmartUploadSecondPassJobData>): Promise<void> {
  const { sessionId } = job.data;

  /** Convenience wrapper that always includes sessionId in progress payloads */
  const progress = (step: string, percent: number, message: string) =>
    job.updateProgress({ step, percent, message, sessionId });

  await progress('starting', 5, 'Initializing second-pass verification');

  logger.info('Starting second pass verification', { sessionId, jobId: job.id });

  // Find the smart upload session
  const smartSession = await prisma.smartUploadSession.findUnique({
    where: { uploadSessionId: sessionId },
  });

  if (!smartSession) {
    throw new Error('Session not found');
  }

  // Check secondPassStatus is QUEUED or FAILED
  const currentSecondPassStatus = smartSession.secondPassStatus as SecondPassStatus;
  if (currentSecondPassStatus !== 'QUEUED' && currentSecondPassStatus !== 'FAILED') {
    throw new Error(`Session is not eligible for second pass. Current status: ${currentSecondPassStatus}`);
  }

  await progress('starting', 10, 'Session validated');

  // Set secondPassStatus to IN_PROGRESS immediately
  await prisma.smartUploadSession.update({
    where: { uploadSessionId: sessionId },
    data: { secondPassStatus: 'IN_PROGRESS' },
  });

  await progress('starting', 15, 'Status set to in-progress');

  try {
    // Load LLM config (uses smart_upload_* settings from DB)
    const llmConfig = await loadSmartUploadRuntimeConfig();

    // Download the original PDF
    const storageKey = smartSession.storageKey;
    const downloadResult = await downloadFile(storageKey);

    if (typeof downloadResult === 'string') {
      throw new Error('Expected file stream but got URL');
    }

    const originalPdfBuffer = await streamToBuffer(downloadResult.stream);
    await progress('downloading', 25, 'PDF downloaded');

    // Convert all pages to images
    const allPageIndices = Array.from({ length: Math.min( 
      (await (async () => { const { PDFDocument } = await import('pdf-lib'); const d = await PDFDocument.load(originalPdfBuffer); return d.getPageCount(); })()), 
      MAX_PDF_PAGES_FOR_LLM 
    ) }, (_, i) => i);
    const originalPageImages = await renderPdfPageBatch(originalPdfBuffer, allPageIndices, {
      scale: 2,
      maxWidth: 1024,
      quality: 85,
      format: 'png',
    });
    await progress('rendering', 35, 'PDF rendered to images');

    // FIX: Treat fields as JSON directly, NOT strings (Bug #2 fix)
    const metadata = smartSession.extractedMetadata as ExtractedMetadata | null;
    if (!metadata) {
      throw new Error('Missing extracted metadata');
    }

    const parsedParts = smartSession.parsedParts as ParsedPartRecord[] | null;
    const cuttingInstructions = smartSession.cuttingInstructions as CuttingInstruction[] | null;

    let verificationPrompt: string = '';

    // Shared update data - will be built in handleSecondPassResult
    const updateData: Record<string, unknown> = {};

    await progress('analyzing', 40, 'Analyzing metadata and parts');

    // Check if we have parsed parts for spot-checking
    if (smartSession.parseStatus === 'PARSED' && parsedParts && parsedParts.length > 0) {
      // Randomly select up to 3 parts for spot-checking
      const shuffledParts = shuffleArray(parsedParts);
      const sampledParts = shuffledParts.slice(0, MAX_SAMPLED_PARTS);

      logger.info('Sampling parts for verification', {
        sessionId,
        totalParts: parsedParts.length,
        sampledCount: sampledParts.length,
      });

      // Collect labeled images from each sampled part (the actual fix)
      const labeledImages: Array<{ label: string; base64Data: string }> = [];
      let promptContent = `## ORIGINAL SCORE (ALL PAGES)\n`;
      promptContent += `Analyze all ${originalPageImages.length} pages of the original score above.\n\n`;

      for (const part of sampledParts) {
        promptContent += `=== PART: ${part.partName} ===\n`;
        promptContent += `Instrument: ${part.instrument}\n`;
        promptContent += `Section: ${part.section}\n`;
        promptContent += `Page Range: ${part.pageRange[0]}-${part.pageRange[1]}\n\n`;

        try {
          const partDownloadResult = await downloadFile(part.storageKey);
          if (typeof partDownloadResult !== 'string') {
            const partPdfBuffer = await streamToBuffer(partDownloadResult.stream);
            const partPageImages = await convertAllPdfPagesToImages(partPdfBuffer);

            // Build labeled images with clear part identification
            for (let i = 0; i < partPageImages.length; i++) {
              labeledImages.push({
                label: `Part "${part.partName}" Page ${i + 1}`,
                base64Data: partPageImages[i],
              });
            }
          }
        } catch (partError) {
          logger.warn('Failed to download part for verification', {
            sessionId,
            partName: part.partName,
            error: partError,
          });
        }
      }

      promptContent += `\n## PROPOSED CUTTING INSTRUCTIONS\n`;
      promptContent += JSON.stringify(cuttingInstructions, null, 2);
      promptContent += `\n\nReview the original score and sampled parts above. Verify that:\n`;
      promptContent += `1. The cuttingInstructions accurately reflect the page ranges for each part\n`;
      promptContent += `2. Each part's instrument, section, and transposition are correct\n`;
      promptContent += `3. No parts are missing from the cuttingInstructions\n\n`;
      promptContent += `Return the corrected JSON with an improved confidenceScore in a "verificationConfidence" field (0-100).\n`;
      promptContent += `Include a "corrections" field explaining any changes made, or null if no corrections were needed.`;

      verificationPrompt = buildVerificationPrompt(
        llmConfig.verificationSystemPrompt || '',
        {
          originalMetadata: metadata as unknown as Record<string, unknown>,
          pageCount: originalPageImages.length,
        }
      ) + '\n\n' + promptContent;

      // Call the verification LLM with labeled part images
      const { parsed: secondPassResult, raw: secondPassRaw } = await callVerificationLLM(
        originalPageImages,
        llmConfig,
        verificationPrompt,
        labeledImages,
      );

      const verificationConfidence = (secondPassResult as unknown as Record<string, unknown>).verificationConfidence as number
        ?? secondPassResult.confidenceScore;

      await progress('verification', 70, 'Verification complete with parts');

      // --- ADJUDICATION LOGIC ---
      const disagreements = detectDisagreements(metadata, secondPassResult);
      const lowConfidence = (verificationConfidence < 85) || (metadata.confidenceScore < 80);
      const needsAdjudication = disagreements.length > 0 || lowConfidence;

      let finalMetadata = secondPassResult;
      let finalConfidence = verificationConfidence;
      let adjudicationData = undefined;

      if (needsAdjudication) {
        await progress('adjudicating', 80, 'Starting adjudication pass');
        const adjudicatorPrompt = buildAdjudicatorPrompt(
          llmConfig.adjudicatorPrompt || '',
          {
            firstPassMetadata: metadata as unknown as Record<string, unknown>,
            secondPassMetadata: secondPassResult as unknown as Record<string, unknown>,
            disagreements,
            pageCount: originalPageImages.length,
          }
        );

        const adjResult = await callAdjudicatorLLM(originalPageImages, llmConfig, adjudicatorPrompt);
        finalMetadata = adjResult.adjudicatedMetadata;
        finalConfidence = adjResult.finalConfidence;
        adjudicationData = {
          raw: adjResult.raw,
          notes: adjResult.adjudicationNotes,
          requiresHumanReview: adjResult.requiresHumanReview,
          status: 'COMPLETE',
          model: llmConfig.adjudicatorModel || llmConfig.verificationModel,
        };
        await progress('adjudicating', 90, 'Adjudication complete');
      }

      Object.assign(updateData, { secondPassResult, secondPassRaw, secondPassStatus: 'COMPLETE', llmVerifyModel: llmConfig.verificationModel });
      await finalizeSmartUploadSession(
        sessionId, smartSession, updateData, finalMetadata, finalConfidence,
        originalPdfBuffer, parsedParts, llmConfig, adjudicationData
      );
    } else {
      // No parts parsed yet - re-run full vision extraction as second opinion
      const fallbackContext = `Extract metadata from ALL ${originalPageImages.length} pages of this music score.
This is a second-pass verification - please review carefully and provide any corrections.

Return JSON with title, composer, confidenceScore, fileType, isMultiPart, ensembleType, keySignature, timeSignature, tempo, parts, and cuttingInstructions.
Include a "verificationConfidence" field (0-100) indicating your confidence in this extraction.
Include a "corrections" field explaining any corrections made from the first pass, or null if no corrections were needed.`;

      const fallbackPrompt = buildVerificationPrompt(
        llmConfig.verificationSystemPrompt || '',
        {
          originalMetadata: metadata as unknown as Record<string, unknown>,
          pageCount: originalPageImages.length,
        }
      ) + '\n\n' + fallbackContext;

      await progress('analyzing', 50, 'Running full vision re-extraction');

      const { parsed: secondPassResult, raw: secondPassRaw } = await callVerificationLLM(originalPageImages, llmConfig, fallbackPrompt);
      const verificationConfidence = (secondPassResult as unknown as Record<string, unknown>).verificationConfidence as number
        ?? secondPassResult.confidenceScore;

      await progress('verification', 70, 'Fallback verification complete');

      // --- ADJUDICATION LOGIC (Fallback path) ---
      const disagreements = detectDisagreements(metadata, secondPassResult);
      const needsAdjudication = disagreements.length > 0 || verificationConfidence < 85;

      let finalMetadata = secondPassResult;
      let finalConfidence = verificationConfidence;
      let adjudicationData = undefined;

      if (needsAdjudication) {
        await progress('adjudicating', 80, 'Starting adjudication pass');
        const adjudicatorPrompt = buildAdjudicatorPrompt(
          llmConfig.adjudicatorPrompt || '',
          {
            firstPassMetadata: metadata as unknown as Record<string, unknown>,
            secondPassMetadata: secondPassResult as unknown as Record<string, unknown>,
            disagreements,
            pageCount: originalPageImages.length,
          }
        );

        const adjResult = await callAdjudicatorLLM(originalPageImages, llmConfig, adjudicatorPrompt);
        finalMetadata = adjResult.adjudicatedMetadata;
        finalConfidence = adjResult.finalConfidence;
        adjudicationData = {
          raw: adjResult.raw,
          notes: adjResult.adjudicationNotes,
          requiresHumanReview: adjResult.requiresHumanReview,
          status: 'COMPLETE',
          model: llmConfig.adjudicatorModel || llmConfig.verificationModel,
        };
        await progress('adjudicating', 90, 'Adjudication complete');
      }

      Object.assign(updateData, { secondPassResult, secondPassRaw, secondPassStatus: 'COMPLETE', llmVerifyModel: llmConfig.verificationModel });
      await finalizeSmartUploadSession(
        sessionId, smartSession, updateData, finalMetadata, finalConfidence,
        originalPdfBuffer, parsedParts, llmConfig, adjudicationData
      );
    }

    await progress('verification', 90, 'Second pass finalized');

    logger.info('Second pass completed', {
      sessionId,
      secondPassStatus: 'COMPLETE',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Second pass failed', { error: err, sessionId });

    // Set secondPassStatus to FAILED
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: { secondPassStatus: 'FAILED' },
    });

    throw err;
  }
}

// =============================================================================
// Worker Management
// =============================================================================

// NOTE: The separate BullMQ worker that used to live here has been removed.
// All Smart Upload jobs are now handled by a single unified worker in
// smart-upload-processor-worker.ts. This prevents jobs from being silently
// lost when two workers consume the same queue and "skip" unowned jobs.
//
// The following legacy exports are kept for API compatibility in case any
// module still imports them, but they are intentional no-ops.

/** @deprecated Use startSmartUploadProcessorWorker() instead */
export function startSmartUploadWorker(): void {
  logger.warn(
    'startSmartUploadWorker() is deprecated — secondPass jobs are now handled by the unified worker in smart-upload-processor-worker.ts'
  );
}

/** @deprecated Use stopSmartUploadProcessorWorker() instead */
export async function stopSmartUploadWorker(): Promise<void> {
  // no-op: unified worker handles shutdown
}

/** @deprecated Use isSmartUploadProcessorWorkerRunning() instead */
export function isSmartUploadWorkerRunning(): boolean {
  return false;
}

export { processSecondPass };
