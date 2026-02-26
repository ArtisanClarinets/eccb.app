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
import { createWorker } from '@/lib/jobs/queue';
import { queueSmartUploadAutoCommit } from '@/lib/jobs/smart-upload';
import { logger } from '@/lib/logger';
import {
  buildVerificationPrompt,
  DEFAULT_VERIFICATION_SYSTEM_PROMPT,
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

const MAX_PDF_PAGES_FOR_LLM = 50;
const MAX_SAMPLED_PARTS = 3;



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
  } catch (err) {
    logger.error('parseVerificationResponse: JSON.parse failed', { err });
    throw new Error('Invalid JSON in verification LLM response');
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
// Second-Pass Result Handler (shared between parts-present and fallback paths)
// =============================================================================

async function handleSecondPassResult(
  sessionId: string,
  smartSession: { parseStatus: string | null; routingDecision: string | null; fileName: string; uploadSessionId: string },
  updateData: Record<string, unknown>,
  secondPassResult: ExtractedMetadata,
  verificationConfidence: number,
  secondPassRaw: string,
  correctedCuttingInstructions: CuttingInstruction[] | undefined,
  originalPdfBuffer: Buffer,
  parsedParts: ParsedPartRecord[] | null,
  llmConfig: LLMRuntimeConfig,
): Promise<void> {
  Object.assign(updateData, {
    secondPassResult,
    secondPassRaw,
    secondPassStatus: 'COMPLETE',
    llmProvider: llmConfig.provider,
    llmVisionModel: llmConfig.verificationModel,
    llmVerifyModel: llmConfig.verificationModel,
    llmModelParams: { temperature: 0.1, max_tokens: 4096 },
    llmPromptVersion: llmConfig.promptVersion || '2.0.0',
  });

  if (correctedCuttingInstructions && correctedCuttingInstructions.length > 0) {
    const existingMetadata = updateData.extractedMetadata as Record<string, unknown> | undefined;
    updateData.extractedMetadata = { ...(existingMetadata ?? {}), cuttingInstructions: correctedCuttingInstructions };
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
        const safePartName = part.instruction.partName.replace(/[^a-zA-Z0-9\-_ ]/g, '_');
        const partStorageKey = `smart-upload/${sessionId}/parts/${safePartName}.pdf`;
        await uploadFile(partStorageKey, part.buffer, {
          contentType: 'application/pdf',
          metadata: { sessionId, instrument: part.instruction.instrument, partName: part.instruction.partName, section: part.instruction.section, originalUploadId: sessionId },
        });
        tempFiles.push(partStorageKey);
        newParsedParts.push({
          partName: part.instruction.partName, instrument: part.instruction.instrument,
          section: part.instruction.section, transposition: part.instruction.transposition,
          partNumber: part.instruction.partNumber, storageKey: partStorageKey,
          fileName: part.fileName, fileSize: part.buffer.length,
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
        const safePartName = part.instruction.partName.replace(/[^a-zA-Z0-9\-_ ]/g, '_');
        const partStorageKey = `smart-upload/${sessionId}/parts/${safePartName}.pdf`;
        await uploadFile(partStorageKey, part.buffer, {
          contentType: 'application/pdf',
          metadata: { sessionId, instrument: part.instruction.instrument, partName: part.instruction.partName, section: part.instruction.section, originalUploadId: sessionId },
        });
        newParsedParts.push({
          partName: part.instruction.partName, instrument: part.instruction.instrument,
          section: part.instruction.section, transposition: part.instruction.transposition,
          partNumber: part.instruction.partNumber, storageKey: partStorageKey,
          fileName: part.fileName, fileSize: part.buffer.length,
          pageCount: part.pageCount, pageRange: part.instruction.pageRange,
        });
      }
      updateData.parsedParts = newParsedParts;
      logger.info('Re-split PDF in second pass', { sessionId, newPartsCount: newParsedParts.length });
    }
  }

  // Auto-approve if legacy mode
  const routingDecision = smartSession.routingDecision as string;
  if (verificationConfidence >= llmConfig.autoApproveThreshold && routingDecision === 'auto_parse_second_pass' && updateData.parseStatus === 'PARSED') {
    updateData.autoApproved = true;
    logger.info('Session auto-approved after second pass (legacy threshold)', { sessionId, verificationConfidence });
  }

  await prisma.smartUploadSession.update({ where: { uploadSessionId: sessionId }, data: updateData });

  // Trigger fully-autonomous auto-commit if configured
  if (
    llmConfig.enableFullyAutonomousMode &&
    verificationConfidence >= llmConfig.autonomousApprovalThreshold &&
    updateData.parseStatus === 'PARSED'
  ) {
    logger.info('Autonomous mode: queueing auto-commit after second pass', { sessionId, verificationConfidence });
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
      const correctedCuttingInstructions = secondPassResult.cuttingInstructions;

      await progress('verification', 70, 'Verification complete with parts');
      await handleSecondPassResult(
        sessionId, smartSession, updateData, secondPassResult, verificationConfidence,
        secondPassRaw, correctedCuttingInstructions, originalPdfBuffer, parsedParts, llmConfig
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
      const correctedCuttingInstructions = secondPassResult.cuttingInstructions;

      await progress('verification', 70, 'Fallback verification complete');
      await handleSecondPassResult(
        sessionId, smartSession, updateData, secondPassResult, verificationConfidence,
        secondPassRaw, correctedCuttingInstructions, originalPdfBuffer, parsedParts, llmConfig
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

let smartUploadWorker: ReturnType<typeof createWorker> | null = null;

/**
 * Start the smart upload worker
 */
export function startSmartUploadWorker(): void {
  const config = {
    priority: 10,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    concurrency: 2,
  };

  smartUploadWorker = createWorker({
    queueName: 'SMART_UPLOAD',
    concurrency: config.concurrency,
    processor: async (job: Job) => {
      if (job.name === 'smartupload.secondPass') {
        await processSecondPass(job as Job<SmartUploadSecondPassJobData>);
      } else {
        throw new Error(`Unknown job type: ${job.name}`);
      }
    },
  });

  logger.info('Smart upload worker started', { concurrency: config.concurrency });
}

/**
 * Stop the smart upload worker
 */
export async function stopSmartUploadWorker(): Promise<void> {
  if (smartUploadWorker) {
    await smartUploadWorker.close();
    smartUploadWorker = null;
    logger.info('Smart upload worker stopped');
  }
}

/**
 * Check if smart upload worker is running
 */
export function isSmartUploadWorkerRunning(): boolean {
  return smartUploadWorker !== null;
}



export { processSecondPass };
