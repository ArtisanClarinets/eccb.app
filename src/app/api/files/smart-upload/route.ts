import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { uploadFile, validateFileMagicBytes } from '@/lib/services/storage';
import { applyRateLimit } from '@/lib/rate-limit';
import { validateCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { MUSIC_UPLOAD } from '@/lib/auth/permission-constants';
import { queueSmartUploadProcess } from '@/lib/jobs/smart-upload';
import { loadSmartUploadRuntimeConfig } from '@/lib/llm/config-loader';
import type {
  RoutingDecision,
  ParseStatus,
  SecondPassStatus,
} from '@/types/smart-upload';

// =============================================================================
// Constants (defaults — overridden by DB config at runtime)
// =============================================================================

const DEFAULT_ALLOWED_MIME_TYPES = ['application/pdf'];
const DEFAULT_MAX_FILE_SIZE_MB = 50;

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

function getUploadMessage(
  routingDecision: RoutingDecision,
  _parseStatus: ParseStatus,
  _partsCount: number
): string {
  switch (routingDecision) {
    case 'auto_parse_auto_approve':
      return 'Upload successful. High confidence - processing in background.';
    case 'auto_parse_second_pass':
      return 'Upload successful. Processing in background - second pass verification queued.';
    case 'no_parse_second_pass':
      return 'Upload successful. Low confidence - sent to second pass analysis before splitting.';
    default:
      return 'Upload successful. Processing in background - please review the extracted metadata before committing to the music library.';
  }
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
    // Load DB-configured limits (fall back to defaults if DB unavailable)
    let maxFileSizeMb = DEFAULT_MAX_FILE_SIZE_MB;
    const allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES;
    try {
      const cfg = await loadSmartUploadRuntimeConfig();
      maxFileSizeMb = cfg.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB;
      // allowedMimeTypes is not yet on LLMRuntimeConfig; use default
    } catch {
      logger.warn('Could not load smart upload config from DB; using defaults for upload limits');
    }
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > maxFileSizeBytes) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxFileSizeMb}MB` },
        { status: 400 }
      );
    }

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}` },
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
    const extension = getExtension(file.name);
    const storageKey = generateStorageKey(sessionId, extension);

    // Upload file to storage
    await uploadFile(storageKey, buffer, {
      contentType: 'application/pdf',
      metadata: {
        originalFilename: file.name,
        uploadedBy: session.user.id,
        sessionId,
      },
    });

    // Create smart upload session in pending state
    // The worker will update this with actual metadata
    const smartUploadSession = await prisma.smartUploadSession.create({
      data: {
        uploadSessionId: sessionId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf',
        storageKey,
        extractedMetadata: {
          title: file.name.replace(/\.pdf$/i, ''),
          confidenceScore: 0,
        },
        confidenceScore: 0,
        status: 'PENDING_REVIEW',
        uploadedBy: session.user.id,
        parseStatus: 'NOT_PARSED' as ParseStatus,
        secondPassStatus: 'NOT_NEEDED' as SecondPassStatus,
        autoApproved: false,
      },
    });

    logger.info('Smart upload session created, queueing for processing', {
      sessionId: smartUploadSession.uploadSessionId,
      userId: session.user.id,
    });

    // Queue the smart upload for background processing
    void queueSmartUploadProcess(smartUploadSession.uploadSessionId, smartUploadSession.id)
      .catch((err: Error) => {
        logger.error('Failed to queue smart upload', { error: err.message, sessionId });
      });

    return NextResponse.json({
      success: true,
      session: {
        id: smartUploadSession.uploadSessionId,
        fileName: smartUploadSession.fileName,
        confidenceScore: smartUploadSession.confidenceScore,
        status: smartUploadSession.status,
        createdAt: smartUploadSession.createdAt,
        parseStatus: smartUploadSession.parseStatus,
        secondPassStatus: smartUploadSession.secondPassStatus,
        autoApproved: smartUploadSession.autoApproved,
        routingDecision: 'auto_parse_second_pass' as RoutingDecision,
      },
      message: getUploadMessage('auto_parse_second_pass', 'NOT_PARSED', 0),
      note: 'File is being processed in the background. Check status endpoint for progress.',
    });
  } catch (error) {
    logger.error('Smart upload failed', { error, userId: session?.user?.id });

    return NextResponse.json(
      { error: 'Smart upload failed' },
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
