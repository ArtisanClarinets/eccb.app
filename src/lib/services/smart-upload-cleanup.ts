import { prisma } from '@/lib/db';
import { deleteFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';

/**
 * Delete all temporary files associated with a SmartUploadSession.
 * Safe to call on reject OR on re-processing.
 *
 * Does NOT delete:
 *   - The original upload file (storageKey on SmartUploadSession)
 *   - Any MusicFile storageKeys that have already been committed to the DB
 *
 * @param sessionId - The uploadSessionId of the SmartUploadSession
 */
export async function cleanupSmartUploadTempFiles(
  sessionId: string
): Promise<void> {
  // Step 1: Fetch the SmartUploadSession by uploadSessionId
  const session = await prisma.smartUploadSession.findUnique({
    where: { uploadSessionId: sessionId },
  });

  if (!session) {
    logger.warn('SmartUploadSession not found for cleanup', { sessionId });
    return;
  }

  // Step 2: Parse tempFiles JSON array from the session
  const tempFiles = (session.tempFiles as string[]) || [];

  if (tempFiles.length === 0) {
    logger.info('No temp files to clean up', { sessionId });
    return;
  }

  // Step 3: Parse parsedParts JSON array from the session
  const parsedParts = (session.parsedParts as Array<{ storageKey?: string }>) || [];

  // Step 4: Get storageKeys from parsedParts (these are the split part files)
  const committedStorageKeys = new Set<string>();

  // Also include the original upload file storageKey
  if (session.storageKey) {
    committedStorageKeys.add(session.storageKey);
  }

  // Step 5: Query MusicFile table to find any storageKeys that have been
  // committed to the DB
  for (const part of parsedParts) {
    if (part.storageKey) {
      // Check if this storageKey exists in any MusicFile record
      const existingFile = await prisma.musicFile.findFirst({
        where: { storageKey: part.storageKey },
        select: { storageKey: true },
      });

      if (existingFile) {
        committedStorageKeys.add(part.storageKey);
      }
    }
  }

  // Also check MusicPart table for any committed storageKeys
  const partStorageKeys = parsedParts
    .filter((p) => p.storageKey)
    .map((p) => p.storageKey as string);

  if (partStorageKeys.length > 0) {
    const committedParts = await prisma.musicPart.findMany({
      where: { storageKey: { in: partStorageKeys } },
      select: { storageKey: true },
    });

    for (const part of committedParts) {
      if (part.storageKey) {
        committedStorageKeys.add(part.storageKey);
      }
    }
  }

  // Step 6: Determine which tempFiles are NOT in any committed MusicFile record
  const filesToDelete = tempFiles.filter(
    (fileKey) => !committedStorageKeys.has(fileKey)
  );

  if (filesToDelete.length === 0) {
    logger.info('All temp files are committed, nothing to delete', {
      sessionId,
      tempFilesCount: tempFiles.length,
    });
    return;
  }

  // Step 7: Delete those files using deleteFile from storage service
  let deletedCount = 0;
  let failedCount = 0;

  for (const fileKey of filesToDelete) {
    try {
      await deleteFile(fileKey);
      deletedCount++;
      logger.info('Deleted temp file', { sessionId, fileKey });
    } catch (error) {
      failedCount++;
      logger.error('Failed to delete temp file', { sessionId, fileKey, error });
    }
  }

  // Step 8: Update SmartUploadSession.tempFiles to empty array
  await prisma.smartUploadSession.update({
    where: { uploadSessionId: sessionId },
    data: { tempFiles: [] },
  });

  // Step 9: Log all deletions
  logger.info('Smart upload temp files cleanup complete', {
    sessionId,
    totalTempFiles: tempFiles.length,
    deletedCount,
    failedCount,
    skippedCount: committedStorageKeys.size,
  });
}
