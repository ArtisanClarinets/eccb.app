/**
 * Smart Upload File Upload API Route
 *
 * Upload files to an existing Smart Upload batch.
 * - POST /api/music/smart-upload/[batchId]/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import {
  getBatch,
  addItemToBatch,
  updateBatchStatus,
} from '@/lib/services/smart-upload/smart-upload.service';
import { uploadFile, validateFileMagicBytes } from '@/lib/services/storage';
import { MUSIC_SMART_UPLOAD } from '@/lib/auth/permission-constants';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { addJob } from '@/lib/jobs/queue';
import { SMART_UPLOAD_JOBS, type SmartUploadExtractTextPayload } from '@/lib/jobs/definitions';
import { SmartUploadStatus, SmartUploadStep } from '@prisma/client';

// =============================================================================
// Constants
// =============================================================================

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',
] as const;

const MAX_FILE_SIZE = env.MAX_FILE_SIZE || 50 * 1024 * 1024; // 50MB default
const MAX_FILES_PER_BATCH = env.SMART_UPLOAD_MAX_FILES || 20;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate file content using magic bytes
 */
function validateFileContent(buffer: Buffer, declaredMimeType: string): { valid: boolean; detectedType?: string } {
  // PDF validation
  if (declaredMimeType === 'application/pdf') {
    const isPdf = validateFileMagicBytes(buffer, 'application/pdf');
    if (!isPdf) {
      return { valid: false };
    }
    return { valid: true, detectedType: 'application/pdf' };
  }

  // MP3 validation
  if (declaredMimeType === 'audio/mpeg' || declaredMimeType === 'audio/mp3') {
    const isMp3 = buffer.length >= 2 && (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || // ID3
      (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)
    );
    if (!isMp3) {
      return { valid: false };
    }
    return { valid: true, detectedType: 'audio/mpeg' };
  }

  // WAV validation
  if (declaredMimeType === 'audio/wav' || declaredMimeType === 'audio/x-wav') {
    const isWav = buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45;
    if (!isWav) {
      return { valid: false };
    }
    return { valid: true, detectedType: 'audio/wav' };
  }

  // For other types, accept as-is
  return { valid: true, detectedType: declaredMimeType };
}

/**
 * Generate a storage key for a smart upload file
 */
function generateStorageKey(batchId: string, itemId: string, filename: string): string {
  const ext = filename.split('.').pop() || '';
  return `smart-upload/${batchId}/${itemId}.${ext}`;
}

// =============================================================================
// POST /api/music/smart-upload/[batchId]/upload
// Upload files to an existing batch
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  // Apply rate limiting
  const rateLimitResponse = await applyRateLimit(request, 'upload');
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

  // Check feature flag
  if (!env.SMART_UPLOAD_ENABLED) {
    return NextResponse.json(
      { error: 'Feature not available', code: 'FEATURE_DISABLED' },
      { status: 403 }
    );
  }

  // Check permission
  const hasPermission = await checkUserPermission(session.user.id, MUSIC_SMART_UPLOAD);
  if (!hasPermission) {
    return NextResponse.json(
      { error: 'Forbidden: Smart Upload permission required' },
      { status: 403 }
    );
  }

  try {
    const { batchId } = await params;

    // Check if batch exists and user owns it
    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (batch.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden: Not the batch owner' }, { status: 403 });
    }

    // Check batch status
    const allowedStatuses: SmartUploadStatus[] = [SmartUploadStatus.CREATED, SmartUploadStatus.UPLOADING];
    if (!allowedStatuses.includes(batch.status)) {
      return NextResponse.json(
        { error: 'Batch is not in uploadable state', code: 'INVALID_BATCH_STATUS' },
        { status: 400 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Check max files per batch
    const currentCount = await prisma.smartUploadItem.count({ where: { batchId } });
    if (currentCount + files.length > MAX_FILES_PER_BATCH) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_PER_BATCH} files per batch exceeded` },
        { status: 400 }
      );
    }

    // Update batch to UPLOADING if still CREATED
    if (batch.status === SmartUploadStatus.CREATED) {
      await updateBatchStatus(batchId, SmartUploadStatus.UPLOADING);
    }

    const results: Array<{
      itemId: string;
      fileName: string;
      success: boolean;
      error?: string;
    }> = [];

    // Process each file
    for (const file of files) {
      try {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          results.push({
            itemId: '',
            fileName: file.name,
            success: false,
            error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          });
          continue;
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
          results.push({
            itemId: '',
            fileName: file.name,
            success: false,
            error: `Invalid file type: ${file.type}`,
          });
          continue;
        }

        // Read file content
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate file content using magic bytes
        const contentValidation = validateFileContent(buffer, file.type);
        if (!contentValidation.valid) {
          results.push({
            itemId: '',
            fileName: file.name,
            success: false,
            error: 'File content does not match declared type',
          });
          continue;
        }

        // Generate IDs and storage key
        const itemId = crypto.randomUUID();
        const storageKey = generateStorageKey(batchId, itemId, file.name);

        // Upload to storage
        await uploadFile(storageKey, buffer, {
          contentType: contentValidation.detectedType || file.type,
          metadata: {
            originalFilename: file.name,
            uploadedBy: session.user.id,
            batchId,
          },
        });

        // Create item in database
        const item = await addItemToBatch(batchId, {
          fileName: file.name,
          fileSize: file.size,
          mimeType: contentValidation.detectedType || file.type,
          storageKey,
        });

        // Update item status to VALIDATED (after UPLOADING)
        await prisma.smartUploadItem.update({
          where: { id: item.id },
          data: { currentStep: SmartUploadStep.VALIDATED },
        });

        // Enqueue text extraction job for PDFs
        if (file.type === 'application/pdf') {
          const extractionPayload: SmartUploadExtractTextPayload = {
            batchId,
            itemId: item.id,
            storageKey,
          };

          await addJob(SMART_UPLOAD_JOBS.EXTRACT_TEXT, extractionPayload);

          logger.info('Enqueued text extraction job', {
            batchId,
            itemId: item.id,
          });
        }

        results.push({
          itemId: item.id,
          fileName: file.name,
          success: true,
        });

        logger.info('File uploaded to Smart Upload batch', {
          userId: session.user.id,
          batchId,
          itemId: item.id,
          filename: file.name,
          size: file.size,
        });
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
        logger.error('Failed to upload file to batch', {
          error: fileError,
          batchId,
          filename: file.name,
        });

        results.push({
          itemId: '',
          fileName: file.name,
          success: false,
          error: errorMessage,
        });
      }
    }

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

    // Update batch counts
    if (successCount > 0) {
      await prisma.smartUploadBatch.update({
        where: { id: batchId },
        data: {
          status: SmartUploadStatus.PROCESSING,
        },
      });
    }

    // Return results
    return NextResponse.json({
      items: results.filter(r => r.success).map(r => ({
        id: r.itemId,
        fileName: r.fileName,
      })),
      errors: results.filter(r => !r.success).map(r => ({
        fileName: r.fileName,
        error: r.error,
      })),
      summary: {
        total: files.length,
        succeeded: successCount,
        failed: errorCount,
      },
    });
  } catch (error) {
    logger.error('Failed to process Smart Upload batch upload', {
      error,
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: 'Failed to process upload' },
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
