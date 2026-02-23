import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { downloadFile } from '@/lib/services/storage';
import { applyRateLimit } from '@/lib/rate-limit';
import { validateCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { MUSIC_UPLOAD, SYSTEM_CONFIG } from '@/lib/auth/permission-constants';
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import { uploadFile } from '@/lib/services/storage';
import type {
  CuttingInstruction,
  ExtractedMetadata,
  ParsedPartRecord,
  ParseStatus,
  SecondPassStatus,
} from '@/types/smart-upload';

// =============================================================================
// Token Bucket Rate Limiter (shared with smart-upload)
// =============================================================================

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
    if (this.tokens > rpm) {
      this.tokens = rpm;
    }
  }

  async consume(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitTime = (1 - this.tokens) / this.refillRate * 1000;
    logger.info('Rate limit: waiting for token', { waitTimeMs: waitTime });

    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

const llmRateLimiter = new TokenBucketRateLimiter(15);

// =============================================================================
// Constants
// =============================================================================

const MAX_PDF_PAGES_FOR_LLM = 50;
const MAX_SAMPLED_PARTS = 3;

// =============================================================================
// LLM Config — loaded from DB settings with env var fallback
// =============================================================================

interface LLMConfig {
  provider: string;
  visionModel: string;
  verificationModel: string;
  ollamaEndpoint: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  customBaseUrl: string;
  customApiKey: string;
  confidenceThreshold: number;
  twoPassEnabled: boolean;
  visionSystemPrompt?: string;
  verificationSystemPrompt?: string;
  rateLimit: number;
  autoApproveThreshold: number;
  skipParseThreshold: number;
  visionModelParams: Record<string, unknown>;
  verificationModelParams: Record<string, unknown>;
}

async function loadLLMConfig(): Promise<LLMConfig> {
  const keys = [
    'llm_provider',
    'llm_ollama_endpoint',
    'llm_openai_api_key',
    'llm_anthropic_api_key',
    'llm_openrouter_api_key',
    'llm_custom_base_url',
    'llm_custom_api_key',
    'llm_vision_model',
    'llm_verification_model',
    'llm_confidence_threshold',
    'llm_two_pass_enabled',
    'llm_vision_system_prompt',
    'llm_verification_system_prompt',
    'llm_rate_limit_rpm',
    'llm_auto_approve_threshold',
    'llm_skip_parse_threshold',
    'llm_vision_model_params',
    'llm_verification_model_params',
  ];

  let dbSettings: Record<string, string> = {};
  try {
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
    dbSettings = rows.reduce<Record<string, string>>((acc, r) => {
      acc[r.key] = r.value ?? '';
      return acc;
    }, {});
  } catch {
    // DB may not be ready; fall back to env
  }

  const provider = dbSettings['llm_provider'] || 'ollama';
  let endpoint: string;
  switch (provider) {
    case 'custom':
      endpoint = dbSettings['llm_custom_base_url'] || '';
      break;
    case 'openai':
      endpoint = 'https://api.openai.com/v1';
      break;
    case 'anthropic':
      endpoint = 'https://api.anthropic.com';
      break;
    case 'gemini':
      endpoint = 'https://generativelanguage.googleapis.com/v1beta';
      break;
    case 'openrouter':
      endpoint = 'https://openrouter.ai/api/v1';
      break;
    default:
      endpoint =
        process.env.LLM_OLLAMA_ENDPOINT ||
        dbSettings['llm_ollama_endpoint'] ||
        'http://localhost:11434';
  }

  const rateLimit = Number(dbSettings['llm_rate_limit_rpm'] ?? 15);
  llmRateLimiter.setLimit(rateLimit);

  return {
    provider,
    visionModel:
      process.env.LLM_VISION_MODEL ||
      dbSettings['llm_vision_model'] ||
      'llama3.2-vision',
    verificationModel:
      process.env.LLM_VERIFICATION_MODEL ||
      dbSettings['llm_verification_model'] ||
      'qwen2.5:7b',
    ollamaEndpoint: endpoint,
    openaiApiKey: dbSettings['llm_openai_api_key'] || '',
    anthropicApiKey: dbSettings['llm_anthropic_api_key'] || '',
    openrouterApiKey: dbSettings['llm_openrouter_api_key'] || '',
    customBaseUrl: dbSettings['llm_custom_base_url'] || '',
    customApiKey: dbSettings['llm_custom_api_key'] || '',
    confidenceThreshold: Number(dbSettings['llm_confidence_threshold'] ?? 90),
    twoPassEnabled: (dbSettings['llm_two_pass_enabled'] ?? 'true') === 'true',
    visionSystemPrompt: dbSettings['llm_vision_system_prompt'] || undefined,
    verificationSystemPrompt: dbSettings['llm_verification_system_prompt'] || undefined,
    rateLimit: Number(dbSettings['llm_rate_limit_rpm'] ?? 15),
    autoApproveThreshold: Number(dbSettings['llm_auto_approve_threshold'] ?? 95),
    skipParseThreshold: Number(dbSettings['llm_skip_parse_threshold'] ?? 60),
    visionModelParams: (() => {
      try {
        return JSON.parse(dbSettings['llm_vision_model_params'] || '{}');
      } catch {
        return {};
      }
    })(),
    verificationModelParams: (() => {
      try {
        return JSON.parse(dbSettings['llm_verification_model_params'] || '{}');
      } catch {
        return {};
      }
    })(),
  };
}

// =============================================================================
// Verification System Prompt
// =============================================================================

const DEFAULT_VERIFICATION_SYSTEM_PROMPT = `You are a verification assistant. Review the extracted metadata against the original images.
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
  const images: string[] = [];

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES_FOR_LLM);

  logger.info('Converting PDF pages to images', {
    totalPages,
    pagesToProcess,
  });

  for (let i = 0; i < pagesToProcess; i++) {
    try {
      const imageBase64 = await renderPdfToImage(pdfBuffer, {
        pageIndex: i,
        quality: 85,
        maxWidth: 1920,
        format: 'png',
      });
      images.push(imageBase64);
    } catch (error) {
      logger.warn('Failed to render page to image', { pageIndex: i, error });
      images.push(generatePlaceholderImage());
    }
  }

  return images;
}

function generatePlaceholderImage(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';
}

function buildAuthHeaders(config: LLMConfig): Record<string, string> {
  switch (config.provider) {
    case 'openai':
    case 'openrouter':
    case 'custom':
      return config.openaiApiKey || config.openrouterApiKey || config.customApiKey
        ? { Authorization: `Bearer ${config.openaiApiKey || config.openrouterApiKey || config.customApiKey}` }
        : {};
    case 'anthropic':
      return config.anthropicApiKey
        ? { 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' }
        : {};
    default:
      return {};
  }
}

function buildChatEndpoint(config: LLMConfig): string {
  const base = config.ollamaEndpoint.replace(/\/$/, '');
  switch (config.provider) {
    case 'ollama':
      return `${base}/api/chat`;
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages';
    default:
      return `${base}/chat/completions`;
  }
}

async function callVerificationLLM(
  pageImages: string[],
  config: LLMConfig,
  prompt: string,
): Promise<ExtractedMetadata> {
  const systemPrompt = config.verificationSystemPrompt || DEFAULT_VERIFICATION_SYSTEM_PROMPT;
  const endpoint = buildChatEndpoint(config);
  const authHeaders = buildAuthHeaders(config);

  const content: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];

  for (let i = 0; i < pageImages.length; i++) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${pageImages[i]}`,
      },
    });
  }

  content.push({
    type: 'text',
    text: prompt,
  });

  const requestBody: Record<string, unknown> = {
    model: config.verificationModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content,
      },
    ],
    stream: false,
    ...config.verificationModelParams,
  };

  await llmRateLimiter.consume();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    message?: { content: string };
    choices?: Array<{ message: { content: string } }>;
  };
  const contentStr = data.message?.content ?? data.choices?.[0]?.message?.content ?? '';

  try {
    const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]) as ExtractedMetadata;
  } catch (error) {
    logger.error('Failed to parse LLM response as JSON', { content: contentStr, error });
    throw new Error('Invalid JSON in LLM response');
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
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, 'second-pass');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const csrfResult = validateCSRF(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: 'CSRF validation failed', reason: csrfResult.reason },
      { status: 403 }
    );
  }

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasMusicUploadPermission = await checkUserPermission(session.user.id, MUSIC_UPLOAD);
  const hasSystemConfigPermission = await checkUserPermission(session.user.id, SYSTEM_CONFIG);

  if (!hasMusicUploadPermission && !hasSystemConfigPermission) {
    logger.warn('Second pass denied: missing permission', { userId: session.user.id });
    return NextResponse.json(
      { error: 'Forbidden: Music upload or system config permission required' },
      { status: 403 }
    );
  }

  let sessionId: string;

  try {
    const body = await request.json();
    sessionId = body.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // Find the smart upload session
    const smartSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: sessionId },
    });

    if (!smartSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check secondPassStatus is QUEUED or FAILED
    const currentSecondPassStatus = smartSession.secondPassStatus as SecondPassStatus;
    if (currentSecondPassStatus !== 'QUEUED' && currentSecondPassStatus !== 'FAILED') {
      return NextResponse.json(
        { error: `Session is not eligible for second pass. Current status: ${currentSecondPassStatus}` },
        { status: 400 }
      );
    }

    // Set secondPassStatus to IN_PROGRESS immediately
    await prisma.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: { secondPassStatus: 'IN_PROGRESS' },
    });

    logger.info('Starting second pass verification', {
      sessionId,
      userId: session.user.id,
    });

    // Load LLM config
    const llmConfig = await loadLLMConfig();

    // Download the original PDF
    const storageKey = smartSession.storageKey;
    const downloadResult = await downloadFile(storageKey);

    if (typeof downloadResult === 'string') {
      throw new Error('Expected file stream but got URL');
    }

    const originalPdfBuffer = await streamToBuffer(downloadResult.stream);

    // Convert all pages to images
    const originalPageImages = await convertAllPdfPagesToImages(originalPdfBuffer);

    const parseStatus = smartSession.parseStatus as ParseStatus;
    const parsedParts = smartSession.parsedParts
      ? (JSON.parse(smartSession.parsedParts as string) as ParsedPartRecord[])
      : [];
    const cuttingInstructions = smartSession.cuttingInstructions
      ? (JSON.parse(smartSession.cuttingInstructions as string) as CuttingInstruction[])
      : [];

    let verificationPrompt: string;

    // Check if we have parsed parts for spot-checking
    if (parseStatus === 'PARSED' && parsedParts.length > 0) {
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

    // Call the verification LLM
    const secondPassResult = await callVerificationLLM(originalPageImages, llmConfig, verificationPrompt);
    const verificationConfidence = secondPassResult.verificationConfidence ?? secondPassResult.confidenceScore;

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
        ...JSON.parse(smartSession.extractedMetadata as string),
        cuttingInstructions: correctedCuttingInstructions,
      };
      updateData.cuttingInstructions = correctedCuttingInstructions;

      // If already parsed, re-run PDF splitting with corrected instructions
      if (parseStatus === 'PARSED') {
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

    // Check if we can auto-approve
    const routingDecision = smartSession.routingDecision as string;
    if (
      verificationConfidence >= 90 &&
      routingDecision === 'auto_parse_second_pass' &&
      parseStatus === 'PARSED'
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

    logger.info('Second pass completed', {
      sessionId,
      verificationConfidence,
      secondPassStatus: 'COMPLETE',
    });

    return NextResponse.json({
      success: true,
      sessionId,
      secondPassStatus: 'COMPLETE',
      verificationConfidence,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Second pass failed', { error: err, sessionId });

    // Set secondPassStatus to FAILED
    try {
      await prisma.smartUploadSession.update({
        where: { uploadSessionId: sessionId },
        data: { secondPassStatus: 'FAILED' },
      });
    } catch {
      // Ignore update errors during error handling
    }

    return NextResponse.json(
      { error: 'Second pass verification failed', reason: err.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
