import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { deleteFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { MusicDifficulty, FileType } from '@prisma/client';
import type { ParsedPartRecord } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

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
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
}

// =============================================================================
// Validation Schema
// =============================================================================

const approveSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  composer: z.string().optional(),
  publisher: z.string().optional(),
  instrument: z.string().optional(),
  partNumber: z.string().optional(),
  difficulty: z.string().optional(),
  ensembleType: z.string().optional(),
  keySignature: z.string().optional(),
  timeSignature: z.string().optional(),
  tempo: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Guess the instrument family based on the instrument name.
 * Returns a best-guess family or 'Other' if no match found.
 */
function guessInstrumentFamily(instrumentName: string): string {
  const name = instrumentName.toLowerCase();
  
  // Woodwinds
  if (/(flute|piccolo|oboe|clarinet|bassoon|saxophone|sax)/i.test(name)) {
    return 'Woodwinds';
  }
  
  // Brass
  if (/(trumpet|trombone|horn|tuba|euphonium|cornet|flugelhorn)/i.test(name)) {
    return 'Brass';
  }
  
  // Strings
  if (/(violin|viola|cello|bass|harp|guitar)/i.test(name)) {
    return 'Strings';
  }
  
  // Percussion
  if (/(drum|timpani|percussion|marimba|xylophone|cymbal|triangle)/i.test(name)) {
    return 'Percussion';
  }
  
  // Keyboard
  if (/(piano|keyboard|organ|celeste)/i.test(name)) {
    return 'Keyboard';
  }
  
  // Vocals
  if (/(voice|vocal|soprano|alto|tenor|baritone|bass choir|chorus)/i.test(name)) {
    return 'Vocals';
  }
  
  return 'Other';
}

// =============================================================================
// POST /api/admin/uploads/review/[id]/approve - Approve and create MusicPiece/MusicPart
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - require music:create permission
    await requirePermission('music:create');

    const { id } = await params;

    // Parse request body
    const body = await request.json();
    const validatedData = approveSchema.parse(body);

    // Find the session
    const uploadSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: id },
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    if (uploadSession.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        { error: 'Session is not pending review' },
        { status: 400 }
      );
    }

    // Get the extracted metadata
    const extractedMetadata = uploadSession.extractedMetadata as ExtractedMetadata | null;

    // Get pre-split parts if available
    const parsedParts = (uploadSession.parsedParts as ParsedPartRecord[] | null) || [];
    const hasPreSplitParts = parsedParts.length > 0;

    // Collect storageKeys from final MusicFiles for cleanup tracking
    const finalMusicFileKeys: string[] = [];

    // -----------------------------------------------------------------
    // Pre-transaction: Get pre-split parts (no longer splitting at approval time)
    // -----------------------------------------------------------------
    if (hasPreSplitParts) {
      logger.info('Using pre-split parts from parsedParts', {
        sessionId: id,
        partsCount: parsedParts.length,
      });
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create Person (composer) if provided
      let composerId: string | null = null;
      const composerName = validatedData.composer?.trim();
      if (composerName) {
        // Split into first and last name
        const nameParts = composerName.split(' ');
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
        const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

        // Try to find existing composer
        let composer = await tx.person.findFirst({
          where: {
            fullName: composerName,
          },
        });

        // Create if not found
        if (!composer) {
          composer = await tx.person.create({
            data: {
              firstName,
              lastName,
              fullName: composerName,
            },
          });
          logger.info('Created new composer', { composerId: composer.id, name: composerName });
        }

        composerId = composer.id;
      }

      // 2. Find or create Publisher if provided
      let publisherId: string | null = null;
      const publisherName = validatedData.publisher?.trim();
      if (publisherName) {
        let publisher = await tx.publisher.findUnique({
          where: { name: publisherName },
        });

        if (!publisher) {
          publisher = await tx.publisher.create({
            data: { name: publisherName },
          });
          logger.info('Created new publisher', { publisherId: publisher.id, name: publisherName });
        }

        publisherId = publisher.id;
      }

      // 3. Create MusicPiece record with new fields from extractedMetadata
      const musicPiece = await tx.musicPiece.create({
        data: {
          title: validatedData.title,
          composerId,
          publisherId,
          difficulty: (validatedData.difficulty as MusicDifficulty) || null,
          confidenceScore: extractedMetadata?.confidenceScore || null,
          source: 'SMART_UPLOAD',
          notes: `Imported via Smart Upload on ${new Date().toISOString()}`,
          // New fields from extractedMetadata or form
          ensembleType: validatedData.ensembleType || extractedMetadata?.ensembleType || null,
          keySignature: validatedData.keySignature || extractedMetadata?.keySignature || null,
          timeSignature: validatedData.timeSignature || extractedMetadata?.timeSignature || null,
          tempo: validatedData.tempo || extractedMetadata?.tempo || null,
        },
      });

      logger.info('Created music piece', { pieceId: musicPiece.id, title: musicPiece.title });

      // 4. Create MusicFile record (always create the original full file)
      const fileType = (extractedMetadata?.fileType || 'FULL_SCORE') as FileType;
      const musicFile = await tx.musicFile.create({
        data: {
          pieceId: musicPiece.id,
          fileName: uploadSession.fileName,
          fileType,
          fileSize: uploadSession.fileSize,
          mimeType: uploadSession.mimeType,
          storageKey: uploadSession.storageKey,
          uploadedBy: session.user.id,
          extractedMetadata: JSON.stringify(extractedMetadata),
          source: 'SMART_UPLOAD',
          originalUploadId: uploadSession.uploadSessionId,
        },
      });

      // Track the original upload key - don't delete it
      finalMusicFileKeys.push(uploadSession.storageKey);

      logger.info('Created music file (original)', { fileId: musicFile.id, storageKey: musicFile.storageKey });

      // 5. Create MusicPart records based on pre-split parts or fallback
      if (hasPreSplitParts && parsedParts.length > 0) {
        // Use pre-split parts from parsedParts
        for (const part of parsedParts) {
          const instrumentName = part.instrument?.trim() || 'Unknown';

          let instrument = await tx.instrument.findFirst({
            where: { name: { contains: instrumentName } },
          });
          if (!instrument) {
            instrument = await tx.instrument.create({
              data: {
                name: instrumentName,
                family: guessInstrumentFamily(instrumentName),
                sortOrder: 999,
              },
            });
          }

          // Create a MusicFile for this pre-split part with all new fields
          const partFile = await tx.musicFile.create({
            data: {
              pieceId: musicPiece.id,
              fileName: part.fileName,
              fileType: 'PART' as FileType,
              fileSize: part.fileSize,
              mimeType: 'application/pdf',
              storageKey: part.storageKey,
              uploadedBy: session.user.id,
              source: 'SMART_UPLOAD',
              originalUploadId: uploadSession.uploadSessionId,
              // New fields for split parts
              partLabel: part.partName || null,
              instrumentName: part.instrument || null,
              section: part.section || null,
              partNumber: part.partNumber || null,
              pageCount: part.pageCount || null,
            },
          });

          // Track this storageKey - don't delete it
          finalMusicFileKeys.push(part.storageKey);

          // Create MusicPart with all fields
          await tx.musicPart.create({
            data: {
              pieceId: musicPiece.id,
              instrumentId: instrument.id,
              partName: part.partName,
              fileId: partFile.id,
              // New fields from parsedParts
              section: part.section || null,
              partNumber: part.partNumber || null,
              partLabel: part.partName || null,
              transposition: part.transposition || null,
              pageCount: part.pageCount || null,
              storageKey: part.storageKey || null,
            },
          });
        }

        logger.info('Created music parts from pre-split parts', {
          pieceId: musicPiece.id,
          partsCount: parsedParts.length,
        });
      } else if (extractedMetadata?.isMultiPart && Array.isArray(extractedMetadata.parts) && extractedMetadata.parts.length > 0) {
        // Multi-part metadata but no pre-split parts - link all parts to original file
        for (const part of extractedMetadata.parts) {
          // Find or create instrument
          const instrumentName = part.instrument?.trim();
          if (!instrumentName) continue;

          let instrument = await tx.instrument.findFirst({
            where: {
              name: {
                contains: instrumentName,
              },
            },
          });

          if (!instrument) {
            // Create a generic instrument entry
            instrument = await tx.instrument.create({
              data: {
                name: instrumentName,
                family: guessInstrumentFamily(instrumentName),
                sortOrder: 999,
              },
            });
            logger.info('Created new instrument', { instrumentId: instrument.id, name: instrumentName });
          }

          // Create music part linked to the original MusicFile
          await tx.musicPart.create({
            data: {
              pieceId: musicPiece.id,
              instrumentId: instrument.id,
              partName: part.partName || part.instrument,
              fileId: musicFile.id,
            },
          });
        }

        logger.info('Created music parts (no split)', { pieceId: musicPiece.id, partsCount: extractedMetadata.parts.length });
      } else if (validatedData.instrument?.trim()) {
        // Single part/instrument specified in override
        const instrumentName = validatedData.instrument.trim();
        let instrument = await tx.instrument.findFirst({
          where: {
            name: {
              contains: instrumentName,
            },
          },
        });

        if (!instrument) {
          instrument = await tx.instrument.create({
            data: {
              name: instrumentName,
              family: guessInstrumentFamily(instrumentName),
              sortOrder: 999,
            },
          });
        }

        await tx.musicPart.create({
          data: {
            pieceId: musicPiece.id,
            instrumentId: instrument.id,
            partName: validatedData.partNumber || instrumentName,
            fileId: musicFile.id,
          },
        });

        logger.info('Created single music part', { pieceId: musicPiece.id, instrument: instrumentName });
      }

      // 6. Update the session status
      const updatedSession = await tx.smartUploadSession.update({
        where: { uploadSessionId: id },
        data: {
          status: 'APPROVED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        },
      });

      return { musicPiece, musicFile, updatedSession };
    });

    // -----------------------------------------------------------------
    // Post-transaction: Cleanup temp files that are no longer needed
    // Only delete temp files that are in tempFiles but NOT in the final MusicFile storageKeys
    // Do NOT delete the original upload file or any part files that were committed
    // -----------------------------------------------------------------
    const tempFiles = (uploadSession.tempFiles as string[] | null) || [];
    if (tempFiles.length > 0) {
      const filesToDelete = tempFiles.filter(
        (tempKey) => !finalMusicFileKeys.includes(tempKey)
      );

      if (filesToDelete.length > 0) {
        logger.info('Cleaning up temp files after approval', {
          sessionId: id,
          filesToDelete: filesToDelete.length,
        });

        for (const tempKey of filesToDelete) {
          try {
            await deleteFile(tempKey);
            logger.info('Deleted temp file', { sessionId: id, tempKey });
          } catch (deleteError) {
            // Log but don't fail - temp file cleanup is best-effort
            logger.warn('Failed to delete temp file', {
              sessionId: id,
              tempKey,
              error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            });
          }
        }
      }
    }

    logger.info('Smart upload approved and imported', {
      sessionId: id,
      userId: session.user.id,
      pieceId: result.musicPiece.id,
      title: validatedData.title,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: result.updatedSession.uploadSessionId,
        status: result.updatedSession.status,
        reviewedAt: result.updatedSession.reviewedAt,
      },
      musicPiece: {
        id: result.musicPiece.id,
        title: result.musicPiece.title,
      },
      musicFile: {
        id: result.musicFile.id,
        fileName: result.musicFile.fileName,
      },
      message: `Successfully approved and imported "${validatedData.title}" to music library.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to approve upload session', { error });
    return NextResponse.json(
      { error: 'Failed to approve upload session' },
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
