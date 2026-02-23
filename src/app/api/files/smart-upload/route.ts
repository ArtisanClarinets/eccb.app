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

// =============================================================================
// Types
// =============================================================================

/**
 * Extracted metadata from LLM vision model analysis
 */
interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{
    instrument: string;
    partName: string;
  }>;
}

/**
 * JSON Schema for structured LLM output
 */
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
  },
  required: ['title', 'confidenceScore'],
};

// =============================================================================
// Constants
// =============================================================================

const ALLOWED_MIME_TYPE = 'application/pdf';
const MAX_FILE_SIZE = env.MAX_FILE_SIZE;

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

  // Resolve effective endpoint based on provider
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

  return {
    provider,
    // Env vars take precedence for model selection
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
  };
}

// =============================================================================
// Default System Prompts (overridable via DB settings)
// =============================================================================

const DEFAULT_VISION_SYSTEM_PROMPT = `You are an expert at analyzing music sheet metadata from images of sheet music.
Your task is to extract metadata from the first page of a music score.

Extract the following information:
- Title: The name of the piece
- Composer: The composer's name (if legible)
- Publisher: The publisher's name (if visible)
- Instrument: The primary instrument or ensemble type
- PartNumber: The part number if it's a multi-part score
- fileType: FULL_SCORE, CONDUCTOR_SCORE, PART, or CONDENSED_SCORE
- isMultiPart: Whether multiple parts are on a single page
- parts: Array of instrument/part information

IMPORTANT INSTRUCTIONS:
1. Evaluate legibility - if text is unclear or ambiguous, set confidenceScore below 80
2. For composer: if you cannot definitively read the name, set confidence below 80
3. For instrument: if ambiguous, set confidence below 80
4. Handle these special cases:
   - Multiple parts on single page: "1st & 2nd Eb Clarinet" → separate MusicPart records
   - Medley arrangements: Multiple song titles should be captured
   - Condensed Score vs Full Score: Distinguish between them
5. Output confidence below 80 when composer or instrument are ambiguous
6. confidenceScore must be between 1-100

Return valid JSON only.`;

const DEFAULT_VERIFICATION_SYSTEM_PROMPT = `You are a verification assistant. Review the extracted metadata against the original image.
Check for:
1. Typos in title or composer name
2. Misclassification of file type (FULL_SCORE vs PART vs CONDUCTOR_SCORE vs CONDENSED_SCORE)
3. Incorrect instrument identification
4. Missing parts that are visible on the page

Return the corrected JSON with improved confidenceScore.
If you find errors, explain them in a "corrections" field.
If no errors, set "corrections" to null.

Return valid JSON only.`;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a storage key for a smart upload file.
 */
function generateStorageKey(sessionId: string, extension: string): string {
  return `smart-upload/${sessionId}/original${extension}`;
}

/**
 * Get file extension from filename.
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '.pdf';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Build the Authorization / API key header for the configured provider.
 */
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

/**
 * Build the chat API endpoint URL for the configured provider.
 */
function buildChatEndpoint(config: LLMConfig): string {
  const base = config.ollamaEndpoint.replace(/\/$/, '');
  switch (config.provider) {
    case 'ollama':
      return `${base}/api/chat`;
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages';
    default:
      // OpenAI-compatible: openai, openrouter, gemini (via proxy), custom
      return `${base}/chat/completions`;
  }
}

/**
 * Call LLM with image for metadata extraction.
 */
async function callVisionLLM(
  imageBase64: string,
  config: LLMConfig,
): Promise<ExtractedMetadata> {
  const systemPrompt =
    config.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT;

  const endpoint = buildChatEndpoint(config);
  const authHeaders = buildAuthHeaders(config);

  // Build request body - format parameter is Ollama-only
  const requestBody: Record<string, unknown> = {
    model: config.visionModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
          {
            type: 'text',
            text: 'Extract the metadata from this music sheet. Return JSON.',
          },
        ],
      },
    ],
    stream: false,
  };

  // Only include 'format' for Ollama (structured output)
  if (config.provider === 'ollama') {
    requestBody.format = metadataJsonSchema;
  }

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

  const data = await response.json() as { message?: { content: string }; choices?: Array<{ message: { content: string } }> };
  // Support both Ollama format and OpenAI-compatible format
  const content = data.message?.content ?? data.choices?.[0]?.message?.content ?? '';

  try {
    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]) as ExtractedMetadata;
  } catch (error) {
    logger.error('Failed to parse LLM response as JSON', { content, error });
    throw new Error('Invalid JSON in LLM response');
  }
}

/**
 * Verify extracted metadata using a smaller model.
 */
async function verifyMetadata(
  imageBase64: string,
  extractedMetadata: ExtractedMetadata,
  config: LLMConfig,
): Promise<ExtractedMetadata> {
  const systemPrompt =
    config.verificationSystemPrompt || DEFAULT_VERIFICATION_SYSTEM_PROMPT;

  const endpoint = buildChatEndpoint(config);
  const authHeaders = buildAuthHeaders(config);

  // Build request body - format parameter is Ollama-only
  const requestBody: Record<string, unknown> = {
    model: config.verificationModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
          {
            type: 'text',
            text: `Verify and correct this extracted metadata:\n${JSON.stringify(extractedMetadata, null, 2)}`,
          },
        ],
      },
    ],
    stream: false,
  };

  // Only include 'format' for Ollama (structured output)
  if (config.provider === 'ollama') {
    requestBody.format = metadataJsonSchema;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    logger.warn('Verification LLM call failed, using original metadata', {
      status: response.status,
    });
    return extractedMetadata;
  }

  const data = await response.json() as { message?: { content: string }; choices?: Array<{ message: { content: string } }> };
  const content = data.message?.content ?? data.choices?.[0]?.message?.content ?? '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return extractedMetadata;
    }
    const verified = JSON.parse(jsonMatch[0]) as ExtractedMetadata;
    // Use verified metadata but keep original if verification failed
    return verified;
  } catch {
    return extractedMetadata;
  }
}

/**
 * Convert PDF first page to image for LLM analysis.
 * Uses the pdf-renderer service to render the PDF to a base64 image.
 */
async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  logger.info('Processing PDF for smart upload', {
    size: pdfBuffer.length,
    magicBytes: pdfBuffer.slice(0, 4).toString('hex'),
  });

  try {
    // Render PDF first page to image using our PDF renderer service
    const imageBase64 = await renderPdfToImage(pdfBuffer, {
      pageIndex: 0,
      quality: 85,
      maxWidth: 1920,
      format: 'png',
    });

    logger.info('PDF successfully rendered to image', {
      imageSize: imageBase64.length,
    });

    return imageBase64;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('PDF rendering failed, using fallback', { error: err.message });

    // Return a placeholder if rendering fails
    return generatePlaceholderImage();
  }
}

/**
 * Generate a placeholder image when PDF rendering fails.
 * This is a 100x100 light gray PNG that signals to the LLM
 * that the PDF could not be rendered properly.
 */
function generatePlaceholderImage(): string {
  // Light gray 100x100 PNG in base64
  return 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';
}

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await applyRateLimit(request, 'smart-upload');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Validate CSRF
  const csrfResult = validateCSRF(request);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: 'CSRF validation failed', reason: csrfResult.reason },
      { status: 403 }
    );
  }

  // Check authentication
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check upload permission
  const hasPermission = await checkUserPermission(session.user.id, MUSIC_UPLOAD);
  if (!hasPermission) {
    logger.warn('Smart upload denied: missing permission', { userId: session.user.id });
    return NextResponse.json({ error: 'Forbidden: Music upload permission required' }, { status: 403 });
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    
    const file = formData.get('file') as File | null;
    
    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }
    
    // Validate MIME type (strict enforcement)
    if (file.type !== ALLOWED_MIME_TYPE) {
      return NextResponse.json(
        { error: `Invalid file type. Only PDF files are allowed` },
        { status: 400 }
      );
    }
    
    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Validate file content using magic bytes (PDF: %PDF)
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
    
    // Generate session ID
    const sessionId = crypto.randomUUID();
    
    // Load LLM config from DB settings (with env var fallback)
    const llmConfig = await loadLLMConfig();
    
    // Convert PDF to image (first page, top 20%)
    const imageBase64 = await convertPdfToImage(buffer);
    
    // First pass: Vision model extraction
    let extractedMetadata: ExtractedMetadata;
    try {
      extractedMetadata = await callVisionLLM(imageBase64, llmConfig);
      logger.info('Vision model extraction complete', {
        sessionId,
        confidence: extractedMetadata.confidenceScore,
        provider: llmConfig.provider,
        model: llmConfig.visionModel,
      });
    } catch (error) {
      logger.error('Vision model extraction failed', { error, sessionId });
      // Use OCR fallback for better metadata
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

    // Second pass: Verification model (if enabled and confidence is reasonable)
    // Don't verify garbage metadata (confidence < 30)
    if (
      llmConfig.twoPassEnabled &&
      extractedMetadata.confidenceScore >= 30 &&
      extractedMetadata.confidenceScore < llmConfig.confidenceThreshold
    ) {
      try {
        const verified = await verifyMetadata(imageBase64, extractedMetadata, llmConfig);
        extractedMetadata = verified;
        logger.info('Verification model complete', {
          sessionId,
          confidence: extractedMetadata.confidenceScore,
          model: llmConfig.verificationModel,
        });
      } catch (error) {
        logger.warn('Verification model failed, using original', { error, sessionId });
      }
    } else if (extractedMetadata.confidenceScore < 30) {
      logger.warn('Metadata confidence too low to verify', {
        sessionId,
        score: extractedMetadata.confidenceScore,
      });
    }
    
    // Store file in blob storage
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
    
    // Save to SmartUploadSession table
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
      },
    });
    
    logger.info('Smart upload session created', {
      sessionId: smartUploadSession.uploadSessionId,
      userId: session.user.id,
      confidenceScore: extractedMetadata.confidenceScore,
    });
    
    return NextResponse.json({
      success: true,
      session: {
        id: smartUploadSession.uploadSessionId,
        fileName: smartUploadSession.fileName,
        confidenceScore: smartUploadSession.confidenceScore,
        status: smartUploadSession.status,
        createdAt: smartUploadSession.createdAt,
      },
      extractedMetadata,
      message: 'Upload successful. Please review the extracted metadata before committing to the music library.',
    });
  } catch (error) {
    logger.error('Smart upload failed', { error, userId: session?.user?.id });
    
    return NextResponse.json(
      { error: 'Smart upload failed' },
      { status: 500 }
    );
  }
}

// =============================================================================
// OPTIONS handler for CORS
// =============================================================================

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
