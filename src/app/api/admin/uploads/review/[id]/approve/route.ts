import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { downloadFile, uploadFile } from '@/lib/services/storage';
import { splitPdfByPageRanges } from '@/lib/services/pdf-splitter';
import { analyzePdfParts } from '@/lib/services/pdf-part-detector';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { MusicDifficulty, FileType } from '@prisma/client';
import type { DownloadResult } from '@/lib/services/storage';

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

    // -----------------------------------------------------------------
    // Pre-transaction: PDF splitting (outside DB transaction because
    // storage uploads cannot participate in a DB transaction).
    // -----------------------------------------------------------------
    interface SplitResult {
      partName: string;
      instrument: string;
      storageKey: string;
      fileSize: number;
      fileName: string;
    }

    let splitResults: SplitResult[] = [];

    if (extractedMetadata?.isMultiPart && Array.isArray(extractedMetadata.parts) && extractedMetadata.parts.length > 1) {
      try {
        // Download original PDF
        let pdfBuffer: Buffer;
        const downloadResult = await downloadFile(uploadSession.storageKey);
        if (typeof downloadResult === 'string') {
          const res = await fetch(downloadResult);
          if (!res.ok) throw new Error(`Storage download failed: ${res.status}`);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        } else {
          const chunks: Buffer[] = [];
          for await (const chunk of (downloadResult as DownloadResult).stream) {
            const c = chunk as Buffer | string;
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          }
          pdfBuffer = Buffer.concat(chunks);
        }

        // Analyze PDF structure to determine page ranges
        const partAnalysis = await analyzePdfParts(pdfBuffer, extractedMetadata);

        if (partAnalysis.isMultiPart && partAnalysis.estimatedParts.length > 0) {
          const pageRanges = partAnalysis.estimatedParts.map((p) => ({
            start: p.pageRange[0],
            end: p.pageRange[1],
            name: p.partName,
          }));

          const splitParts = await splitPdfByPageRanges(pdfBuffer, pageRanges);

          // Upload each split part to storage
          for (let i = 0; i < splitParts.length; i++) {
            const splitPart = splitParts[i];
            const analysedPart = partAnalysis.estimatedParts[i];
            const partStorageKey = uploadSession.storageKey.replace(
              /\/original(\.pdf)?$/i,
              `/part-${String(i + 1).padStart(2, '0')}-${analysedPart.instrumentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
            );

            await uploadFile(partStorageKey, splitPart.buffer, {
              contentType: 'application/pdf',
              metadata: {
                originalUploadId: uploadSession.uploadSessionId,
                partName: splitPart.name,
                instrument: analysedPart.instrumentName,
              },
            });

            splitResults.push({
              partName: splitPart.name,
              instrument: analysedPart.instrumentName,
              storageKey: partStorageKey,
              fileSize: splitPart.buffer.length,
              fileName: `${uploadSession.fileName.replace(/\.pdf$/i, '')} - ${splitPart.name}.pdf`,
            });
          }

          logger.info('PDF split complete', {
            sessionId: id,
            partsCreated: splitResults.length,
          });
        }
      } catch (splitError) {
        const err = splitError instanceof Error ? splitError : new Error(String(splitError));
        logger.warn('PDF splitting failed, falling back to single file', { error: err.message });
        splitResults = []; // Fall back to single-file mode
      }
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

      // 3. Create MusicPiece record
      const musicPiece = await tx.musicPiece.create({
        data: {
          title: validatedData.title,
          composerId,
          publisherId,
          difficulty: (validatedData.difficulty as MusicDifficulty) || null,
          confidenceScore: extractedMetadata?.confidenceScore || null,
          source: 'SMART_UPLOAD',
          notes: `Imported via Smart Upload on ${new Date().toISOString()}`,
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

      logger.info('Created music file (original)', { fileId: musicFile.id, storageKey: musicFile.storageKey });

      // 5. Create MusicPart records
      //    – If we successfully split the PDF, each part gets its own MusicFile.
      //    – Otherwise fall back to linking all parts to the original MusicFile.
      if (splitResults.length > 0) {
        // Multi-part with separate PDF files per part
        for (const sr of splitResults) {
          const instrumentName = sr.instrument?.trim() || 'Unknown';

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

          // Create a dedicated MusicFile for this split part
          const partFile = await tx.musicFile.create({
            data: {
              pieceId: musicPiece.id,
              fileName: sr.fileName,
              fileType: 'PART' as FileType,
              fileSize: sr.fileSize,
              mimeType: 'application/pdf',
              storageKey: sr.storageKey,
              uploadedBy: session.user.id,
              source: 'SMART_UPLOAD',
              originalUploadId: uploadSession.uploadSessionId,
            },
          });

          await tx.musicPart.create({
            data: {
              pieceId: musicPiece.id,
              instrumentId: instrument.id,
              partName: sr.partName,
              fileId: partFile.id,
            },
          });
        }

        logger.info('Created split music parts', {
          pieceId: musicPiece.id,
          partsCount: splitResults.length,
        });
      } else if (extractedMetadata?.isMultiPart && Array.isArray(extractedMetadata.parts) && extractedMetadata.parts.length > 0) {
        // Multi-part metadata but splitting was skipped/failed – link all parts to original file
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
                sortOrder: 999, // Default sort order for auto-created instruments
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
