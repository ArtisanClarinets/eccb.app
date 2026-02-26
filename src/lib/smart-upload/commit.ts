/**
 * Smart Upload Commit Service
 *
 * Shared library ingestion transaction extracted from the approve route.
 * Called by both the manual review API (`/api/admin/uploads/review/[id]/approve`)
 * and the autonomous auto-commit worker when confidence is sufficiently high.
 */

import { prisma } from '@/lib/db';
import { deleteFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';
import type { MusicDifficulty, FileType } from '@prisma/client';
import type { ParsedPartRecord } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

export interface CommitOverrides {
  title?: string;
  composer?: string;
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
}

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{ instrument: string; partName: string }>;
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
}

// =============================================================================
// Instrument Family Helper
// =============================================================================

function guessInstrumentFamily(instrumentName: string): string {
  const name = instrumentName.toLowerCase();
  if (/(flute|piccolo|oboe|clarinet|bassoon|saxophone|sax)/.test(name)) return 'Woodwinds';
  if (/(trumpet|trombone|horn|tuba|euphonium|cornet|flugelhorn)/.test(name)) return 'Brass';
  if (/(violin|viola|cello|bass|harp|guitar)/.test(name)) return 'Strings';
  if (/(drum|timpani|percussion|marimba|xylophone|cymbal|triangle)/.test(name)) return 'Percussion';
  if (/(piano|keyboard|organ|celeste)/.test(name)) return 'Keyboard';
  if (/(voice|vocal|soprano|alto|tenor|baritone|bass choir|chorus)/.test(name)) return 'Vocals';
  return 'Other';
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

  if (uploadSession.status !== 'PENDING_REVIEW') {
    throw new Error(`Session ${sessionId} is not PENDING_REVIEW (status: ${uploadSession.status})`);
  }

  const extractedMetadata = uploadSession.extractedMetadata as ExtractedMetadata | null;
  const parsedParts = (uploadSession.parsedParts as ParsedPartRecord[] | null) || [];
  const hasPreSplitParts = parsedParts.length > 0;

  // Resolve title
  const title =
    overrides.title?.trim() ||
    extractedMetadata?.title?.trim() ||
    uploadSession.fileName;

  const finalMusicFileKeys: string[] = [];

  // 2. Transaction
  const txResult = await prisma.$transaction(async (tx) => {
    // 2a. Composer
    let composerId: string | null = null;
    const composerName = (overrides.composer ?? extractedMetadata?.composer ?? '').trim();
    if (composerName) {
      const nameParts = composerName.split(' ');
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

      let composer = await tx.person.findFirst({ where: { fullName: composerName } });
      if (!composer) {
        composer = await tx.person.create({ data: { firstName, lastName, fullName: composerName } });
      }
      composerId = composer.id;
    }

    // 2b. Publisher
    let publisherId: string | null = null;
    const publisherName = (overrides.publisher ?? extractedMetadata?.publisher ?? '').trim();
    if (publisherName) {
      let publisher = await tx.publisher.findUnique({ where: { name: publisherName } });
      if (!publisher) {
        publisher = await tx.publisher.create({ data: { name: publisherName } });
      }
      publisherId = publisher.id;
    }

    // 2c. MusicPiece
    const musicPiece = await tx.musicPiece.create({
      data: {
        title,
        composerId,
        publisherId,
        difficulty: ((overrides.difficulty ?? null) as MusicDifficulty | null),
        confidenceScore: extractedMetadata?.confidenceScore ?? null,
        source: 'SMART_UPLOAD',
        notes: `Imported via Smart Upload on ${new Date().toISOString()}`,
        ensembleType: overrides.ensembleType ?? extractedMetadata?.ensembleType ?? null,
        keySignature: overrides.keySignature ?? extractedMetadata?.keySignature ?? null,
        timeSignature: overrides.timeSignature ?? extractedMetadata?.timeSignature ?? null,
        tempo: overrides.tempo ?? extractedMetadata?.tempo ?? null,
      },
    });

    // 2d. MusicFile (original upload)
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

    // 2e. MusicParts
    let partsCommitted = 0;

    if (hasPreSplitParts && parsedParts.length > 0) {
      for (const part of parsedParts) {
        const instrumentName = part.instrument?.trim() || 'Unknown';
        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family: guessInstrumentFamily(instrumentName), sortOrder: 999 },
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

        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family: guessInstrumentFamily(instrumentName), sortOrder: 999 },
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
        let instrument = await tx.instrument.findFirst({ where: { name: { contains: instrumentName } } });
        if (!instrument) {
          instrument = await tx.instrument.create({
            data: { name: instrumentName, family: guessInstrumentFamily(instrumentName), sortOrder: 999 },
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

    // 2f. Mark session approved
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
  };
}
