import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/guards';
import { requirePermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { FileType, MusicDifficulty } from '@prisma/client';

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

const bulkApproveSchema = z.object({
  sessionIds: z.array(z.string()).min(1, 'At least one session ID is required'),
});

// =============================================================================
// Helpers
// =============================================================================

function guessInstrumentFamily(name: string): string {
  const n = name.toLowerCase();
  if (/(flute|piccolo|oboe|clarinet|bassoon|saxophone|sax)/.test(n)) return 'Woodwinds';
  if (/(trumpet|trombone|horn|tuba|euphonium|cornet|flugelhorn)/.test(n)) return 'Brass';
  if (/(violin|viola|cello|bass|harp|guitar)/.test(n)) return 'Strings';
  if (/(drum|timpani|percussion|marimba|xylophone|cymbal|triangle)/.test(n)) return 'Percussion';
  if (/(piano|keyboard|organ|celeste)/.test(n)) return 'Keyboard';
  if (/(voice|vocal|soprano|alto|tenor|baritone|choir|chorus)/.test(n)) return 'Vocals';
  return 'Other';
}

// =============================================================================
// POST /api/admin/uploads/review/bulk-approve
//
// Approves multiple upload sessions at once.  For each session, creates
// the full MusicPiece / MusicFile / MusicPart records using the LLM-extracted
// metadata.  Sessions with insufficient metadata are skipped and reported back.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    await requirePermission('music:create');

    // Parse body
    const body = await request.json();
    const { sessionIds } = bulkApproveSchema.parse(body);

    // Load all pending sessions
    const uploadSessions = await prisma.smartUploadSession.findMany({
      where: {
        uploadSessionId: { in: sessionIds },
        status: 'PENDING_REVIEW',
      },
    });

    if (uploadSessions.length === 0) {
      return NextResponse.json(
        { error: 'No pending sessions found for the provided IDs' },
        { status: 400 }
      );
    }

    const approved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const now = new Date();

    for (const uploadSession of uploadSessions) {
      const extractedMetadata = uploadSession.extractedMetadata as ExtractedMetadata | null;

      // Skip sessions with no usable title
      if (!extractedMetadata?.title?.trim()) {
        skipped.push({
          id: uploadSession.uploadSessionId,
          reason: 'No title in extracted metadata — please review manually',
        });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          // 1. Find or create composer Person
          let composerId: string | null = null;
          const composerName = extractedMetadata.composer?.trim();
          if (composerName) {
            const nameParts = composerName.split(' ');
            const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
            const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
            let composer = await tx.person.findFirst({ where: { fullName: composerName } });
            if (!composer) {
              composer = await tx.person.create({
                data: { firstName, lastName, fullName: composerName },
              });
            }
            composerId = composer.id;
          }

          // 2. Find or create Publisher
          let publisherId: string | null = null;
          const publisherName = extractedMetadata.publisher?.trim();
          if (publisherName) {
            let publisher = await tx.publisher.findUnique({ where: { name: publisherName } });
            if (!publisher) {
              publisher = await tx.publisher.create({ data: { name: publisherName } });
            }
            publisherId = publisher.id;
          }

          // 3. Create MusicPiece
          const musicPiece = await tx.musicPiece.create({
            data: {
              title: extractedMetadata.title,
              composerId,
              publisherId,
              difficulty: null as MusicDifficulty | null,
              confidenceScore: extractedMetadata.confidenceScore ?? null,
              source: 'SMART_UPLOAD',
              notes: `Bulk imported via Smart Upload on ${now.toISOString()}`,
            },
          });

          // 4. Create MusicFile (original)
          const fileType = (extractedMetadata.fileType ?? 'FULL_SCORE') as FileType;
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

          // 5. Create MusicPart records (all linked to single file in bulk mode)
          if (
            extractedMetadata.isMultiPart &&
            Array.isArray(extractedMetadata.parts) &&
            extractedMetadata.parts.length > 0
          ) {
            for (const part of extractedMetadata.parts) {
              const instrumentName = part.instrument?.trim();
              if (!instrumentName) continue;
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
              await tx.musicPart.create({
                data: {
                  pieceId: musicPiece.id,
                  instrumentId: instrument.id,
                  partName: part.partName || part.instrument,
                  fileId: musicFile.id,
                },
              });
            }
          } else if (extractedMetadata.instrument?.trim()) {
            const instrumentName = extractedMetadata.instrument.trim();
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
            await tx.musicPart.create({
              data: {
                pieceId: musicPiece.id,
                instrumentId: instrument.id,
                partName: extractedMetadata.partNumber || instrumentName,
                fileId: musicFile.id,
              },
            });
          }

          // 6. Mark session as APPROVED
          await tx.smartUploadSession.update({
            where: { uploadSessionId: uploadSession.uploadSessionId },
            data: {
              status: 'APPROVED',
              reviewedBy: session.user.id,
              reviewedAt: now,
            },
          });
        });

        approved.push(uploadSession.uploadSessionId);
        logger.info('Bulk approve: session approved', {
          sessionId: uploadSession.uploadSessionId,
          userId: session.user.id,
          title: extractedMetadata.title,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Bulk approve: failed to approve session', {
          sessionId: uploadSession.uploadSessionId,
          error: error.message,
        });
        skipped.push({
          id: uploadSession.uploadSessionId,
          reason: `Import error: ${error.message}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      approved: approved.length,
      skipped: skipped.length,
      approvedIds: approved,
      skippedDetails: skipped,
      message: `Approved ${approved.length} upload(s).${skipped.length > 0 ? ` Skipped ${skipped.length} (see skippedDetails).` : ''}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.error('Failed to bulk approve upload sessions', { error });
    return NextResponse.json(
      { error: 'Failed to bulk approve upload sessions' },
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
