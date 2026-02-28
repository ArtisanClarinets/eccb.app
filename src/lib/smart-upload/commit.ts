/**
 * Smart Upload Commit Service
 *
 * Shared library ingestion transaction extracted from the approve route.
 * Called by both the manual review API (`/api/admin/uploads/review/[id]/approve`)
 * and the autonomous auto-commit worker when confidence is sufficiently high.
 *
 * Hardened for:
 *  - Idempotent commits (safe to retry after crash/restart)
 *  - Arranger support
 *  - Normalized metadata preference
 *  - Canonical instrument family resolution
 *  - Provenance write-back to session
 */

import { prisma } from '@/lib/db';
import { deleteFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';
import type { MusicDifficulty, FileType } from '@prisma/client';
import type { ExtractedMetadata, ParsedPartRecord } from '@/types/smart-upload';
import { normalizeExtractedMetadata, normalizePersonName } from './metadata-normalizer';
import { getSectionForLabel } from './canonical-instruments';

// =============================================================================
// Types
// =============================================================================

export interface CommitOverrides {
  title?: string;
  composer?: string;
  arranger?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  difficulty?: string;
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
}

export interface CommitResult {
  musicPieceId: string;
  musicPieceTitle: string;
  musicFileId: string;
  sessionId: string;
  partsCommitted: number;
  /** True when commit was idempotent (piece already existed). */
  wasIdempotent: boolean;
}

// =============================================================================
// Person Resolution Helper
// =============================================================================

/**
 * Find or create a Person record from a full name string.
 * Normalizes the name first, then splits intelligently.
 */
async function findOrCreatePerson(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rawName: string
): Promise<string | null> {
  const normalized = normalizePersonName(rawName);
  if (!normalized) return null;

  // Check for existing person by fullName first
  const existing = await tx.person.findFirst({ where: { fullName: normalized } });
  if (existing) return existing.id;

  // Split name: assume "First [Middle...] Last" pattern
  const parts = normalized.split(' ').filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

  const created = await tx.person.create({
    data: { firstName, lastName, fullName: normalized },
  });
  return created.id;
}

// =============================================================================
// Core Commit Function
// =============================================================================

/**
 * Commit a SmartUploadSession to the music library.
 *
 * Wraps the full Prisma transaction: create MusicPiece → MusicFile → MusicPart
 * records, marks the session as APPROVED, then cleans up temp files.
 *
 * **Idempotent:** If a prior commit attempt already created the piece (detectable
 * via `originalUploadId` on MusicFile), the function returns the existing IDs
 * without duplicating data.
 *
 * @param sessionId  The `uploadSessionId` of the SmartUploadSession.
 * @param overrides  Optional field overrides (typically from the review form or
 *                   adjudicator output). Falls back to extractedMetadata values.
 * @param approvedBy Optional user ID for audit trail. When called from the
 *                   worker use a sentinel like 'system:auto-commit'.
 */
export async function commitSmartUploadSessionToLibrary(
  sessionId: string,
  overrides: CommitOverrides = {},
  approvedBy = 'system:auto-commit'
): Promise<CommitResult> {
  // 1. Load session
  const uploadSession = await prisma.smartUploadSession.findUnique({
    where: { uploadSessionId: sessionId },
  });

  if (!uploadSession) {
    throw new Error(`SmartUploadSession not found: ${sessionId}`);
  }

  // ── Idempotency check ────────────────────────────────────────────
  // If this session was already committed, return existing data instead of failing.
  const existingImportedFile = await prisma.musicFile.findFirst({
    where: { originalUploadId: sessionId },
    select: { id: true, pieceId: true, piece: { select: { id: true, title: true } } },
  });

  if (existingImportedFile) {
    logger.info('Commit idempotency: session already committed', { sessionId });

    // Count existing parts for this piece
    const partsCount = await prisma.musicPart.count({
      where: { pieceId: existingImportedFile.pieceId },
    });

    return {
      musicPieceId: existingImportedFile.piece.id,
      musicPieceTitle: existingImportedFile.piece.title,
      musicFileId: existingImportedFile.id,
      sessionId,
      partsCommitted: partsCount,
      wasIdempotent: true,
    };
  }

  // ── Status eligibility ────────────────────────────────────────────
  const isAutonomousCommit = approvedBy.startsWith('system:');
  const allowedStatuses = new Set(
    isAutonomousCommit
      ? ['PENDING_REVIEW', 'APPROVED']
      : ['PENDING_REVIEW']
  );

  if (!allowedStatuses.has(uploadSession.status)) {
    throw new Error(
      `Session ${sessionId} is not commit-eligible (status: ${uploadSession.status})`
    );
  }

  // ── Prepare metadata ─────────────────────────────────────────────
  const extractedMetadata = uploadSession.extractedMetadata as ExtractedMetadata | null;
  const parsedParts = (uploadSession.parsedParts as ParsedPartRecord[] | null) || [];
  const hasPreSplitParts = parsedParts.length > 0;
  const cuttingInstructions = uploadSession.cuttingInstructions as ExtractedMetadata['cuttingInstructions'] | null;

  // Normalize metadata using the normalizer pipeline when we have extracted data
  const normalized = extractedMetadata
    ? normalizeExtractedMetadata(sessionId, extractedMetadata, cuttingInstructions ?? undefined)
    : null;

  // Resolve final values: overrides → normalized → raw → fallback
  const title =
    overrides.title?.trim() ||
    normalized?.title.normalized ||
    extractedMetadata?.title?.trim() ||
    uploadSession.fileName;

  const finalMusicFileKeys: string[] = [];

  // 2. Transaction
  const txResult = await prisma.$transaction(async (tx) => {
    // 2a. Composer
    const composerName = (overrides.composer ?? normalized?.composer.normalized ?? extractedMetadata?.composer ?? '').trim();
    const composerId = await findOrCreatePerson(tx, composerName);

    // 2b. Arranger
    const arrangerName = (overrides.arranger ?? normalized?.arranger.normalized ?? extractedMetadata?.arranger ?? '').trim();
    const arrangerId = await findOrCreatePerson(tx, arrangerName);

    // 2c. Publisher
    let publisherId: string | null = null;
    const publisherName = (
      overrides.publisher ??
      normalized?.publisher.normalized ??
      extractedMetadata?.publisher ??
      ''
    ).trim();
    if (publisherName) {
      let publisher = await tx.publisher.findUnique({ where: { name: publisherName } });
      if (!publisher) {
        publisher = await tx.publisher.create({ data: { name: publisherName } });
      }
      publisherId = publisher.id;
    }

    // 2d. MusicPiece
    const musicPiece = await tx.musicPiece.create({
      data: {
        title,
        composerId,
        arrangerId,
        publisherId,
        difficulty: ((overrides.difficulty ?? null) as MusicDifficulty | null),
        confidenceScore: extractedMetadata?.confidenceScore ?? null,
        source: 'SMART_UPLOAD',
        notes: `Imported via Smart Upload on ${new Date().toISOString()}`,
        ensembleType: overrides.ensembleType ?? normalized?.ensembleType.normalized ?? extractedMetadata?.ensembleType ?? null,
        keySignature: overrides.keySignature ?? extractedMetadata?.keySignature ?? null,
        timeSignature: overrides.timeSignature ?? extractedMetadata?.timeSignature ?? null,
        tempo: overrides.tempo ?? extractedMetadata?.tempo ?? null,
      },
    });

    // 2e. MusicFile (original upload)
    const fileType = ((extractedMetadata?.fileType ?? 'FULL_SCORE') as FileType);
    const musicFile = await tx.musicFile.create({
      data: {
        pieceId: musicPiece.id,
        fileName: uploadSession.fileName,
        fileType,
        fileSize: uploadSession.fileSize,
        mimeType: uploadSession.mimeType,
        storageKey: uploadSession.storageKey,
        uploadedBy: approvedBy,
        extractedMetadata: JSON.stringify(extractedMetadata),
        source: 'SMART_UPLOAD',
        originalUploadId: uploadSession.uploadSessionId,
      },
    });
    finalMusicFileKeys.push(uploadSession.storageKey);

    // 2f. MusicParts
    let partsCommitted = 0;

    if (hasPreSplitParts && parsedParts.length > 0) {
      for (const part of parsedParts) {
        const instrumentName = part.instrument?.trim() || 'Unknown';
        const family = getSectionForLabel(instrumentName);

        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family, sortOrder: 999 },
          });
        }

        const partFile = await tx.musicFile.create({
          data: {
            pieceId: musicPiece.id,
            fileName: part.fileName,
            fileType: 'PART' as FileType,
            fileSize: part.fileSize,
            mimeType: 'application/pdf',
            storageKey: part.storageKey,
            uploadedBy: approvedBy,
            source: 'SMART_UPLOAD',
            originalUploadId: uploadSession.uploadSessionId,
            partLabel: part.partName ?? null,
            instrumentName: part.instrument ?? null,
            section: part.section ?? null,
            partNumber: part.partNumber ?? null,
            pageCount: part.pageCount ?? null,
          },
        });
        finalMusicFileKeys.push(part.storageKey);

        await tx.musicPart.create({
          data: {
            pieceId: musicPiece.id,
            instrumentId: instrument.id,
            partName: part.partName,
            fileId: partFile.id,
            section: part.section ?? null,
            partNumber: part.partNumber ?? null,
            partLabel: part.partName ?? null,
            transposition: part.transposition ?? null,
            pageCount: part.pageCount ?? null,
            storageKey: part.storageKey ?? null,
          },
        });
        partsCommitted++;
      }
    } else if (
      extractedMetadata?.isMultiPart &&
      Array.isArray(extractedMetadata.parts) &&
      extractedMetadata.parts.length > 0
    ) {
      for (const part of extractedMetadata.parts) {
        const instrumentName = part.instrument?.trim();
        if (!instrumentName) continue;
        const family = getSectionForLabel(instrumentName);

        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family, sortOrder: 999 },
          });
        }
        await tx.musicPart.create({
          data: {
            pieceId: musicPiece.id,
            instrumentId: instrument.id,
            partName: part.partName || part.instrument,
            fileId: musicFile.id,
          },
        });
        partsCommitted++;
      }
    } else {
      // Single instrument from override or extractedMetadata
      const instrumentName = (
        overrides.instrument?.trim() ??
        extractedMetadata?.instrument?.trim() ??
        ''
      );
      if (instrumentName) {
        const family = getSectionForLabel(instrumentName);
        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family, sortOrder: 999 },
          });
        }
        await tx.musicPart.create({
          data: {
            pieceId: musicPiece.id,
            instrumentId: instrument.id,
            partName: overrides.partNumber ?? instrumentName,
            fileId: musicFile.id,
          },
        });
        partsCommitted++;
      }
    }

    // 2g. Mark session approved
    await tx.smartUploadSession.update({
      where: { uploadSessionId: sessionId },
      data: { status: 'APPROVED', reviewedBy: approvedBy, reviewedAt: new Date() },
    });

    return { musicPiece, musicFile, partsCommitted };
  });

  // 3. Cleanup orphaned temp files (best-effort, non-fatal)
  const tempFiles = (uploadSession.tempFiles as string[] | null) ?? [];
  const toDelete = tempFiles.filter((key) => !finalMusicFileKeys.includes(key));
  for (const key of toDelete) {
    try {
      await deleteFile(key);
    } catch (err) {
      logger.warn('Auto-commit: failed to delete temp file', { sessionId, key, err });
    }
  }

  logger.info('Smart upload committed to library', {
    sessionId,
    approvedBy,
    title,
    pieceId: txResult.musicPiece.id,
    partsCommitted: txResult.partsCommitted,
  });

  return {
    musicPieceId: txResult.musicPiece.id,
    musicPieceTitle: txResult.musicPiece.title,
    musicFileId: txResult.musicFile.id,
    sessionId,
    partsCommitted: txResult.partsCommitted,
    wasIdempotent: false,
  };
}
