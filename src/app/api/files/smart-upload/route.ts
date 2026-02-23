import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { uploadFile, validateFileMagicBytes } from '@/lib/services/storage';
import { applyRateLimit } from '@/lib/rate-limit';
import { validateCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { MUSIC_UPLOAD } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import { generateOCRFallback } from '@/lib/services/ocr-fallback';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import type {
  CuttingInstruction,
  ExtractedMetadata,
  ParsedPartRecord,
  RoutingDecision,
  ParseStatus,
  SecondPassStatus,
} from '@/types/smart-upload';

// =============================================================================
// Constants
// =============================================================================

const ALLOWED_MIME_TYPE = 'application/pdf';
const MAX_FILE_SIZE = env.MAX_FILE_SIZE;
const MAX_PDF_PAGES_FOR_LLM = 50;

// =============================================================================
// Token Bucket Rate Limiter
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
// JSON Schema for structured LLM output
// =============================================================================

const metadataJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    composer: { type: 'string' },
    publisher: { type: 'string' },
    instrument: { type: 'string' },
    partNumber: { type: 'string' },
    confidenceScore: { type: 'number', minimum: 1, maximum: 100 },
    fileType: {
      type: 'string',
      enum: ['FULL_SCORE', 'CONDUCTOR_SCORE', 'PART', 'CONDENSED_SCORE'],
    },
    isMultiPart: { type: 'boolean' },
    ensembleType: { type: 'string' },
    keySignature: { type: 'string' },
    timeSignature: { type: 'string' },
    tempo: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          instrument: { type: 'string' },
          partName: { type: 'string' },
        },
      },
    },
    cuttingInstructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          instrument: { type: 'string' },
          partName: { type: 'string' },
          section: {
            type: 'string',
            enum: ['Woodwinds', 'Brass', 'Percussion', 'Strings', 'Keyboard', 'Vocals', 'Other', 'Score'],
          },
          transposition: {
            type: 'string',
            enum: ['Bb', 'Eb', 'F', 'C', 'D', 'G', 'A'],
          },
          partNumber: { type: 'number' },
          pageRange: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
        },
        required: ['instrument', 'partName', 'section', 'transposition', 'partNumber', 'pageRange'],
      },
    },
  },
  required: ['title', 'confidenceScore'],
};

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
// Default System Prompt - Updated for ALL pages analysis
// =============================================================================

const DEFAULT_VISION_SYSTEM_PROMPT = `You are an expert at analyzing music sheet metadata from images of sheet music.
Your task is to analyze EVERY PAGE of the PDF and extract complete metadata AND cutting instructions.

## CRITICAL RULES:
1. You MUST analyze ALL pages provided - do not just look at the first page
2. For multi-part scores, identify each part's instrument, name, and page range
3. Extract cuttingInstructions for each part with: instrument, partName, section, transposition, partNumber, pageRange
4. Page ranges are 0-indexed (first page is page 0)

## Extract the following information:
- Title: The name of the piece
- Composer: The composer's name (if legible)
- Publisher: The publisher's name (if visible)
- Instrument: The primary instrument or ensemble type
- PartNumber: The part number if it's a multi-part score
- fileType: FULL_SCORE, CONDUCTOR_SCORE, PART, or CONDENSED_SCORE
- isMultiPart: Whether multiple parts are included
- ensembleType: Type of ensemble (concert band, jazz band, orchestra, etc.)
- keySignature: Key signature if visible
- timeSignature: Time signature if visible
- tempo: Tempo marking if visible
- parts: Array of instrument/part information
- cuttingInstructions: Array of cutting instructions for each part

## cuttingInstructions schema:
{
  "instrument": "Clarinet",
  "partName": "1st Clarinet",
  "section": "Woodwinds",
  "transposition": "Bb",
  "partNumber": 1,
  "pageRange": [0, 2]
}

## IMPORTANT INSTRUCTIONS:
1. Evaluate legibility - if text is unclear or ambiguous, set confidenceScore below 80
2. For composer: if you cannot definitively read the name, set confidence below 80
3. For instrument: if ambiguous, set confidence below 80
4. Handle these special cases:
   - Multiple parts on single page: "1st & 2nd Eb Clarinet" → separate parts with correct page ranges
   - Medley arrangements: Multiple song titles should be captured
   - Condensed Score vs Full Score: Distinguish between them
5. For pageRange: Determine which pages contain each part. If a part spans pages 0-2, use [0, 2]
6. Output confidence below 80 when composer or instrument are ambiguous
7. confidenceScore must be between 1-100

Return valid JSON only.`;

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

function generateStorageKey(sessionId: string, extension: string): string {
  return `smart-upload/${sessionId}/original${extension}`;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '.pdf';
  return filename.slice(lastDot).toLowerCase();
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

async function callVisionLLM(
  pageImages: string[],
  config: LLMConfig,
): Promise<ExtractedMetadata> {
  const systemPrompt = config.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT;
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
    text: `Extract metadata from ALL ${pageImages.length} pages of this music score. Return JSON with title, composer, confidenceScore, fileType, isMultiPart, ensembleType, keySignature, timeSignature, tempo, parts, and cuttingInstructions.`,
  });

  const requestBody: Record<string, unknown> = {
    model: config.visionModel,
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
    ...config.visionModelParams,
  };

  if (config.provider === 'ollama') {
    requestBody.format = metadataJsonSchema;
  }

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



function generatePlaceholderImage(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';
}

function determineRoutingDecision(
  confidence: number,
  config: LLMConfig,
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
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, 'smart-upload');
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

  const hasPermission = await checkUserPermission(session.user.id, MUSIC_UPLOAD);
  if (!hasPermission) {
    logger.warn('Smart upload denied: missing permission', { userId: session.user.id });
    return NextResponse.json({ error: 'Forbidden: Music upload permission required' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    if (file.type !== ALLOWED_MIME_TYPE) {
      return NextResponse.json(
        { error: `Invalid file type. Only PDF files are allowed` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const isValidPdf = validateFileMagicBytes(buffer, 'application/pdf');
    if (!isValidPdf) {
      logger.warn('Smart upload rejected: invalid PDF magic bytes', {
        userId: session.user.id,
        filename: file.name,
      });
      return NextResponse.json(
        { error: 'File content does not match PDF format' },
        { status: 400 }
      );
    }

    logger.info('Processing smart upload', {
      userId: session.user.id,
      filename: file.name,
      size: file.size,
    });

    const sessionId = crypto.randomUUID();
    const llmConfig = await loadLLMConfig();

    const pageImages = await convertAllPdfPagesToImages(buffer);

    let extractedMetadata: ExtractedMetadata;
    try {
      extractedMetadata = await callVisionLLM(pageImages, llmConfig);
      logger.info('Vision model extraction complete', {
        sessionId,
        confidence: extractedMetadata.confidenceScore,
        provider: llmConfig.provider,
        model: llmConfig.visionModel,
        pagesProcessed: pageImages.length,
      });
    } catch (error) {
      logger.error('Vision model extraction failed', { error, sessionId });
      const ocrFallback = generateOCRFallback(file.name);
      extractedMetadata = {
        title: ocrFallback.title,
        composer: ocrFallback.composer,
        confidenceScore: ocrFallback.confidence,
      };
      logger.warn('Using OCR fallback metadata', {
        sessionId,
        title: extractedMetadata.title,
        confidence: extractedMetadata.confidenceScore,
      });
    }

    const { decision: routingDecision, autoApproved } = determineRoutingDecision(
      extractedMetadata.confidenceScore,
      llmConfig
    );

    let parseStatus: ParseStatus = 'NOT_PARSED';
    let secondPassStatus: SecondPassStatus = 'NOT_NEEDED';
    let parsedParts: ParsedPartRecord[] = [];
    const cuttingInstructions: CuttingInstruction[] = extractedMetadata.cuttingInstructions ?? [];
    const tempFiles: string[] = [];

    if (routingDecision === 'auto_parse_auto_approve' || routingDecision === 'auto_parse_second_pass') {
      if (cuttingInstructions.length > 0) {
        try {
          const baseName = file.name.replace(/\.pdf$/i, '');
          const splitResults = await splitPdfByCuttingInstructions(
            buffer,
            baseName,
            cuttingInstructions
          );

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

            parsedParts.push({
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

          parseStatus = 'PARSED';
          logger.info('PDF split into parts', {
            sessionId,
            partsCount: parsedParts.length,
          });
        } catch (splitErr) {
          logger.error('PDF splitting failed', { error: splitErr, sessionId });
          parseStatus = 'PARSE_FAILED';
          parsedParts = [];
        }
      } else {
        logger.info('No cutting instructions found, skipping split', { sessionId });
      }
    }

    if (routingDecision === 'auto_parse_second_pass' || routingDecision === 'no_parse_second_pass') {
      secondPassStatus = 'QUEUED';
    } else if (routingDecision === 'auto_parse_auto_approve') {
      secondPassStatus = 'NOT_NEEDED';
    }

    const extension = getExtension(file.name);
    const storageKey = generateStorageKey(sessionId, extension);

    await uploadFile(storageKey, buffer, {
      contentType: 'application/pdf',
      metadata: {
        originalFilename: file.name,
        uploadedBy: session.user.id,
        sessionId,
      },
    });

    const smartUploadSession = await prisma.smartUploadSession.create({
      data: {
        uploadSessionId: sessionId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf',
        storageKey,
        extractedMetadata: JSON.parse(JSON.stringify(extractedMetadata)),
        confidenceScore: extractedMetadata.confidenceScore,
        status: 'PENDING_REVIEW',
        uploadedBy: session.user.id,
        parseStatus,
        secondPassStatus,
        autoApproved,
        routingDecision,
        parsedParts: parsedParts.length > 0 ? JSON.parse(JSON.stringify(parsedParts)) : undefined,
        cuttingInstructions: cuttingInstructions.length > 0 ? JSON.parse(JSON.stringify(cuttingInstructions)) : undefined,
        tempFiles: tempFiles.length > 0 ? JSON.parse(JSON.stringify(tempFiles)) : undefined,
      },
    });

    logger.info('Smart upload session created', {
      sessionId: smartUploadSession.uploadSessionId,
      userId: session.user.id,
      confidenceScore: extractedMetadata.confidenceScore,
      routingDecision,
      parseStatus,
      secondPassStatus,
    });

    if (secondPassStatus === 'QUEUED') {
      void fetch(new URL('/api/admin/uploads/second-pass', request.url).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(err => {
        logger.error('Failed to trigger second pass', { error: err, sessionId });
      });
    }

    return NextResponse.json({
      success: true,
      session: {
        id: smartUploadSession.uploadSessionId,
        fileName: smartUploadSession.fileName,
        confidenceScore: smartUploadSession.confidenceScore,
        status: smartUploadSession.status,
        createdAt: smartUploadSession.createdAt,
        parseStatus,
        secondPassStatus,
        autoApproved,
        routingDecision,
      },
      extractedMetadata,
      cuttingInstructions,
      parsedParts,
      message: getUploadMessage(routingDecision, parseStatus, parsedParts.length),
    });
  } catch (error) {
    logger.error('Smart upload failed', { error, userId: session?.user?.id });

    return NextResponse.json(
      { error: 'Smart upload failed' },
      { status: 500 }
    );
  }
}

function getUploadMessage(
  routingDecision: RoutingDecision,
  parseStatus: ParseStatus,
  partsCount: number,
): string {
  switch (routingDecision) {
    case 'auto_parse_auto_approve':
      return `Upload successful. High confidence (${partsCount} parts detected) - ready for review.`;
    case 'auto_parse_second_pass':
      return `Upload successful. Parts split - second pass verification running in background.`;
    case 'no_parse_second_pass':
      return 'Upload successful. Low confidence - sent to second pass analysis before splitting.';
    default:
      return 'Upload successful. Please review the extracted metadata before committing to the music library.';
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
