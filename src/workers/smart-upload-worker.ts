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
import { loadLLMConfig, runtimeToAdapterConfig } from '@/lib/llm/config-loader';
import type { LLMRuntimeConfig } from '@/lib/llm/config-loader';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import { createWorker } from '@/lib/jobs/queue';
import { logger } from '@/lib/logger';
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
// Verification System Prompt
// =============================================================================

const _DEFAULT_VERIFICATION_SYSTEM_PROMPT = `You are a verification assistant. Review the extracted metadata against the original images.
Check for:
1. Typos in title or composer name
2. Misclassification of file type (FULL_SCORE vs PART vs CONDUCTOR_SCORE vs CONDENSED_SCORE)
3. Incorrect instrument identification
4. Missing parts that are visible in the pages
5. Incorrect page ranges in cuttingInstructions
6. Wrong section or transposition assignments

Return the corrected JSON with improved confidenceScore.
If you find errors, explain them in a "corrections" field.
If no errors, set "corrections" to null.

Return valid JSON only.`;

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
 */
async function callVerificationLLM(
  pageImages: string[],
  cfg: LLMRuntimeConfig,
  prompt: string,
): Promise<ExtractedMetadata> {
  await llmRateLimiter.consume();
  llmRateLimiter.setLimit(cfg.rateLimit);

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
    maxTokens: 4096,
    temperature: 0.1,
  });

  return parseVerificationResponse(response.content);
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
// Main Job Processor
// =============================================================================

async function processSecondPass(job: Job<SmartUploadSecondPassJobData>): Promise<void> {
  const { sessionId } = job.data;

  await job.updateProgress(5);

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

  await job.updateProgress(10);

  // Set secondPassStatus to IN_PROGRESS immediately
  await prisma.smartUploadSession.update({
    where: { uploadSessionId: sessionId },
    data: { secondPassStatus: 'IN_PROGRESS' },
  });

  await job.updateProgress(15);

  try {
    // Load LLM config
    const llmConfig = await loadLLMConfig();

    // Download the original PDF
    const storageKey = smartSession.storageKey;
    const downloadResult = await downloadFile(storageKey);

    if (typeof downloadResult === 'string') {
      throw new Error('Expected file stream but got URL');
    }

    const originalPdfBuffer = await streamToBuffer(downloadResult.stream);
    await job.updateProgress(25);

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
    await job.updateProgress(35);

    // FIX: Treat fields as JSON directly, NOT strings (Bug #2 fix)
    const metadata = smartSession.extractedMetadata as ExtractedMetadata | null;
    if (!metadata) {
      throw new Error('Missing extracted metadata');
    }

    const parsedParts = smartSession.parsedParts as ParsedPartRecord[] | null;
    const cuttingInstructions = smartSession.cuttingInstructions as CuttingInstruction[] | null;

    let verificationPrompt: string;

    await job.updateProgress(40);

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

      // Build verification prompt with original pages and sampled parts
      let promptContent = `You are verifying the extracted metadata against the original score and sampled parts.\n\n`;
      promptContent += `## ORIGINAL SCORE (ALL PAGES)\n`;
      promptContent += `Analyze all ${originalPageImages.length} pages of the original score above.\n\n`;

      // Download and convert each sampled part to images
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

            // Add part page images to content
            for (let i = 0; i < partPageImages.length; i++) {
              promptContent += `[Part "${part.partName}" - Page ${i}]\n`;
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

      promptContent += `\n\nReview the original score and sampled parts above. Verify that:
1. The cuttingInstructions accurately reflect the page ranges for each part
2. Each part's instrument, section, and transposition are correct
3. No parts are missing from the cuttingInstructions

Return the corrected JSON with an improved confidenceScore in a "verificationConfidence" field (0-100).
Include a "corrections" field explaining any changes made, or null if no corrections were needed.`;

      verificationPrompt = promptContent;
    } else {
      // No parts parsed yet - re-run full vision extraction as second opinion
      verificationPrompt = `Extract metadata from ALL ${originalPageImages.length} pages of this music score.
This is a second-pass verification - please review carefully and provide any corrections.

Return JSON with title, composer, confidenceScore, fileType, isMultiPart, ensembleType, keySignature, timeSignature, tempo, parts, and cuttingInstructions.
Include a "verificationConfidence" field (0-100) indicating your confidence in this extraction.
Include a "corrections" field explaining any corrections made from the first pass, or null if no corrections were needed.`;
    }

    await job.updateProgress(50);

    // Call the verification LLM
    const secondPassResult = await callVerificationLLM(originalPageImages, llmConfig, verificationPrompt);
    const verificationConfidence = secondPassResult.verificationConfidence ?? secondPassResult.confidenceScore;

    await job.updateProgress(70);

    // Parse the second pass response
    const secondPassRaw = JSON.stringify(secondPassResult);

    // Check if cutting instructions were corrected
    const correctedCuttingInstructions = secondPassResult.cuttingInstructions;

    // Update session with second pass results
    const updateData: Record<string, unknown> = {
      secondPassResult: secondPassResult,
      secondPassRaw: secondPassRaw,
      secondPassStatus: 'COMPLETE',
    };

    // If corrections were made to cutting instructions, update them
    if (correctedCuttingInstructions && correctedCuttingInstructions.length > 0) {
      updateData.extractedMetadata = {
        ...metadata,
        cuttingInstructions: correctedCuttingInstructions,
      };
      updateData.cuttingInstructions = correctedCuttingInstructions;

      // FIX: If not yet parsed (parseStatus !== 'PARSED'), do initial split (Bug #3 fix)
      if (smartSession.parseStatus !== 'PARSED') {
        logger.info('Initial PDF split with corrected instructions', {
          sessionId,
          partsCount: correctedCuttingInstructions.length,
        });

        const baseName = smartSession.fileName.replace(/\.pdf$/i, '');
        const splitResults = await splitPdfByCuttingInstructions(
          originalPdfBuffer,
          baseName,
          correctedCuttingInstructions
        );

        const newParsedParts: ParsedPartRecord[] = [];
        const tempFiles: string[] = [];

        for (const part of splitResults) {
          const safePartName = part.instruction.partName.replace(/[^a-zA-Z0-9\-_ ]/g, '_');
          const partStorageKey = `smart-upload/${sessionId}/parts/${safePartName}.pdf`;

          await uploadFile(partStorageKey, part.buffer, {
            contentType: 'application/pdf',
            metadata: {
              sessionId,
              instrument: part.instruction.instrument,
              partName: part.instruction.partName,
              section: part.instruction.section,
              originalUploadId: sessionId,
            },
          });

          tempFiles.push(partStorageKey);

          newParsedParts.push({
            partName: part.instruction.partName,
            instrument: part.instruction.instrument,
            section: part.instruction.section,
            transposition: part.instruction.transposition,
            partNumber: part.instruction.partNumber,
            storageKey: partStorageKey,
            fileName: part.fileName,
            fileSize: part.buffer.length,
            pageCount: part.pageCount,
            pageRange: part.instruction.pageRange,
          });
        }

        updateData.parsedParts = newParsedParts;
        updateData.tempFiles = tempFiles;
        updateData.parseStatus = 'PARSED';

        logger.info('PDF split completed', {
          sessionId,
          partsCount: newParsedParts.length,
        });
      } else if (parsedParts && parsedParts.length > 0) {
        // Already parsed, re-run PDF splitting with corrected instructions
        logger.info('Re-running PDF split with corrected instructions', {
          sessionId,
          originalPartsCount: parsedParts.length,
          newPartsCount: correctedCuttingInstructions.length,
        });

        const baseName = smartSession.fileName.replace(/\.pdf$/i, '');
        const splitResults = await splitPdfByCuttingInstructions(
          originalPdfBuffer,
          baseName,
          correctedCuttingInstructions
        );

        const newParsedParts: ParsedPartRecord[] = [];

        for (const part of splitResults) {
          const safePartName = part.instruction.partName.replace(/[^a-zA-Z0-9\-_ ]/g, '_');
          const partStorageKey = `smart-upload/${sessionId}/parts/${safePartName}.pdf`;

          await uploadFile(partStorageKey, part.buffer, {
            contentType: 'application/pdf',
            metadata: {
              sessionId,
              instrument: part.instruction.instrument,
              partName: part.instruction.partName,
              section: part.instruction.section,
              originalUploadId: sessionId,
            },
          });

          newParsedParts.push({
            partName: part.instruction.partName,
            instrument: part.instruction.instrument,
            section: part.instruction.section,
            transposition: part.instruction.transposition,
            partNumber: part.instruction.partNumber,
            storageKey: partStorageKey,
            fileName: part.fileName,
            fileSize: part.buffer.length,
            pageCount: part.pageCount,
            pageRange: part.instruction.pageRange,
          });
        }

        updateData.parsedParts = newParsedParts;
        logger.info('Re-split PDF with corrected instructions', {
          sessionId,
          newPartsCount: newParsedParts.length,
        });
      }
    }

    await job.updateProgress(85);

    // Check if we can auto-approve
    const routingDecision = smartSession.routingDecision as string;
    if (
      verificationConfidence >= llmConfig.autoApproveThreshold &&
      routingDecision === 'auto_parse_second_pass' &&
      updateData.parseStatus === 'PARSED'
    ) {
      updateData.autoApproved = true;
      logger.info('Session auto-approved after second pass', {
        sessionId,
        verificationConfidence,
      });
    }

    // Update the session
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: updateData,
    });

    await job.updateProgress(100);

    logger.info('Second pass completed', {
      sessionId,
      verificationConfidence,
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
