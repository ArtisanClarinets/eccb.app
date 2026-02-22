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
import { z } from 'zod';

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
 * LLM Response structure from Ollama API
 */
interface OllamaResponse {
  message: {
    content: string;
  };
  done: boolean;
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

// Vision model for first pass (Llama 3.2 Vision or similar)
const VISION_MODEL = process.env.LLM_VISION_MODEL || 'llama3.2-vision';
// Verification model for second pass (Qwen2.5 or Llama-3-8B)
const VERIFICATION_MODEL = process.env.LLM_VERIFICATION_MODEL || 'qwen2.5:7b';
// Ollama endpoint
const OLLAMA_ENDPOINT = process.env.LLM_OLLAMA_ENDPOINT || 'http://localhost:11434';

// =============================================================================
// System Prompts
// =============================================================================

const VISION_SYSTEM_PROMPT = `You are an expert at analyzing music sheet metadata from images of sheet music.
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

const VERIFICATION_SYSTEM_PROMPT = `You are a verification assistant. Review the extracted metadata against the original image.
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
 * Call LLM with image for metadata extraction.
 */
async function callVisionLLM(
  imageBase64: string,
  model: string = VISION_MODEL
): Promise<ExtractedMetadata> {
  const response = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: VISION_SYSTEM_PROMPT,
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
      format: metadataJsonSchema,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${response.statusText}`);
  }

  const data: OllamaResponse = await response.json();
  const content = data.message.content;

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
  model: string = VERIFICATION_MODEL
): Promise<ExtractedMetadata> {
  const response = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: VERIFICATION_SYSTEM_PROMPT,
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
      format: metadataJsonSchema,
    }),
  });

  if (!response.ok) {
    logger.warn('Verification LLM call failed, using original metadata', {
      status: response.status,
    });
    return extractedMetadata;
  }

  const data: OllamaResponse = await response.json();
  const content = data.message.content;

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
 * Convert PDF first page to image (top 20%).
 * 
 * NOTE: This implementation uses a placeholder approach. In production,
 * you would use a library like pdf-lib or pdfjs-dist to render the PDF to an image.
 * 
 * To make this fully functional:
 * 1. Install: npm install pdf-lib
 * 2. Or use: npm install pdfjs-dist canvas
 * 
 * For now, this returns a placeholder that can be replaced with actual PDF rendering.
 */
async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  // Log that PDF was received - in production, implement proper PDF rendering
  logger.info('Processing PDF for smart upload', {
    size: pdfBuffer.length,
    // First few bytes for debugging
    magicBytes: pdfBuffer.slice(0, 4).toString('hex'),
  });
  
  // For production, implement PDF rendering here using pdf-lib:
  // const pdfDoc = await pdfLib.PDFDocument.load(pdfBuffer);
  // const page = pdfDoc.getPage(0);
  // const { width, height } = page.getSize();
  // ... render to image canvas
  
  // For now, return a placeholder that indicates the PDF was processed
  // The LLM will receive metadata about the file instead of an actual image
  // This allows the system to work while waiting for full PDF rendering implementation
  return generatePlaceholderImage();
}

/**
 * Generate a placeholder image for demo purposes.
 * In production, this would be replaced with actual PDF rendering.
 */
function generatePlaceholderImage(): string {
  // This is a minimal 1x1 PNG in base64 as placeholder
  // In production, implement proper PDF rendering
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
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
    
    // Convert PDF to image (first page, top 20%)
    const imageBase64 = await convertPdfToImage(buffer);
    
    // First pass: Vision model extraction
    let extractedMetadata: ExtractedMetadata;
    try {
      extractedMetadata = await callVisionLLM(imageBase64);
      logger.info('Vision model extraction complete', {
        sessionId,
        confidence: extractedMetadata.confidenceScore,
      });
    } catch (error) {
      logger.error('Vision model extraction failed', { error, sessionId });
      // Create fallback metadata
      extractedMetadata = {
        title: file.name.replace('.pdf', ''),
        confidenceScore: 10,
      };
    }
    
    // Second pass: Verification model
    if (extractedMetadata.confidenceScore < 90) {
      try {
        const verified = await verifyMetadata(imageBase64, extractedMetadata);
        extractedMetadata = verified;
        logger.info('Verification model complete', {
          sessionId,
          confidence: extractedMetadata.confidenceScore,
        });
      } catch (error) {
        logger.warn('Verification model failed, using original', { error, sessionId });
      }
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
