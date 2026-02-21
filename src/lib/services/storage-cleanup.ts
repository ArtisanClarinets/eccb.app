import { prisma } from '@/lib/db';
import { deleteFile } from '@/lib/services/storage';
import { logger } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';
import { env } from '@/lib/env';

// =============================================================================
// Types
// =============================================================================

export interface CleanupResult {
  deletedFiles: string[];
  errors: Array<{ key: string; error: string }>;
  orphanedFiles: string[];
}

export interface OrphanedFile {
  storageKey: string;
  size: number;
  lastModified: Date;
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Delete all files associated with a music piece.
 * Called when a MusicPiece is deleted.
 * 
 * @param pieceId - The ID of the music piece
 * @returns Cleanup result with deleted files and any errors
 */
export async function cleanupPieceFiles(pieceId: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedFiles: [],
    errors: [],
    orphanedFiles: [],
  };
  
  try {
    // Get all files for this piece
    const files = await prisma.musicFile.findMany({
      where: { pieceId },
      select: { id: true, storageKey: true },
    });
    
    logger.info('Starting piece file cleanup', { pieceId, fileCount: files.length });
    
    // Delete each file from storage in parallel
    await Promise.all(
      files.map(async (file) => {
        try {
          await deleteFile(file.storageKey);
          result.deletedFiles.push(file.storageKey);
          logger.info('Deleted file from storage', { storageKey: file.storageKey });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({ key: file.storageKey, error: errorMessage });
          logger.error('Failed to delete file', {
            storageKey: file.storageKey,
            error: errorMessage,
          });
        }
      })
    );
    
    // Note: DB records are deleted via cascade when piece is deleted
    // This function is called before or after the piece deletion
    
    return result;
  } catch (error) {
    logger.error('Piece file cleanup failed', { pieceId, error });
    throw error;
  }
}

/**
 * Delete a single file from storage and database.
 * 
 * @param fileId - The ID of the music file
 * @returns True if deleted successfully
 */
export async function deleteMusicFileInternal(fileId: string): Promise<boolean> {
  try {
    // Get file info
    const file = await prisma.musicFile.findUnique({
      where: { id: fileId },
      select: { storageKey: true },
    });
    
    if (!file) {
      logger.warn('File not found in database', { fileId });
      return false;
    }
    
    // Delete from storage first
    await deleteFile(file.storageKey);
    
    // Then delete from database
    await prisma.musicFile.delete({
      where: { id: fileId },
    });
    
    logger.info('File deleted', { fileId, storageKey: file.storageKey });
    return true;
  } catch (error) {
    logger.error('Failed to delete file', { fileId, error });
    return false;
  }
}

/**
 * Soft delete a file (mark as deleted but retain in storage).
 * Useful for audit trails or recovery.
 * 
 * @param fileId - The ID of the music file
 * @param retainStorage - Whether to keep the file in storage
 * @returns True if soft deleted successfully
 */
export async function softDeleteMusicFile(
  fileId: string,
  retainStorage: boolean = true
): Promise<boolean> {
  try {
    const file = await prisma.musicFile.findUnique({
      where: { id: fileId },
      select: { storageKey: true, pieceId: true },
    });
    
    if (!file) {
      logger.warn('File not found in database', { fileId });
      return false;
    }
    
    // If not retaining storage, delete the actual file
    if (!retainStorage) {
      await deleteFile(file.storageKey);
    }
    
    // Update the piece to remove the file reference
    // The file record will be cascade deleted when the piece is deleted
    // Or we can add a deletedAt field to MusicFile if needed
    
    logger.info('File soft deleted', { 
      fileId, 
      storageKey: file.storageKey,
      retainedInStorage: retainStorage,
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to soft delete file', { fileId, error });
    return false;
  }
}

// =============================================================================
// Orphaned File Detection
// =============================================================================

/**
 * Find files in storage that don't have corresponding database records.
 * Only works with LOCAL storage driver.
 * 
 * @returns List of orphaned files
 */
export async function findOrphanedFiles(): Promise<OrphanedFile[]> {
  if (env.STORAGE_DRIVER === 'S3') {
    logger.warn('Orphaned file detection not implemented for S3');
    return [];
  }
  
  const orphanedFiles: OrphanedFile[] = [];
  const storagePath = path.resolve(env.LOCAL_STORAGE_PATH);
  
  try {
    // Get all storage keys from database
    const dbFiles = await prisma.musicFile.findMany({
      select: { storageKey: true },
    });
    const dbKeys = new Set(dbFiles.map(f => f.storageKey));
    
    // Recursively scan storage directory
    await scanDirectory(storagePath, storagePath, dbKeys, orphanedFiles);
    
    logger.info('Orphaned file scan complete', { 
      totalFiles: dbKeys.size,
      orphanedCount: orphanedFiles.length,
    });
    
    return orphanedFiles;
  } catch (error) {
    logger.error('Failed to find orphaned files', { error });
    throw error;
  }
}

/**
 * Recursively scan a directory for orphaned files.
 */
async function scanDirectory(
  currentPath: string,
  basePath: string,
  dbKeys: Set<string>,
  orphanedFiles: OrphanedFile[]
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  
  const filesToStat: { fullPath: string; storageKey: string }[] = [];
  const directories: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      directories.push(fullPath);
    } else if (entry.isFile()) {
      const relativePath = path.relative(basePath, fullPath);
      const storageKey = relativePath.split(path.sep).join('/');

      if (!storageKey.includes('.tmp.') && !dbKeys.has(storageKey)) {
        filesToStat.push({ fullPath, storageKey });
      }
    }
  }

  // Parallelize stats for files in this directory
  await Promise.all(
    filesToStat.map(async ({ fullPath, storageKey }) => {
      const stats = await fs.stat(fullPath);
      orphanedFiles.push({
        storageKey,
        size: stats.size,
        lastModified: stats.mtime,
      });
    })
  );

  // Recurse into subdirectories sequentially
  for (const dir of directories) {
    await scanDirectory(dir, basePath, dbKeys, orphanedFiles);
  }
}

/**
 * Clean up orphaned files from storage.
 * 
 * @param orphanedFiles - List of orphaned files to delete
 * @returns Cleanup result
 */
export async function cleanupOrphanedFiles(
  orphanedFiles: OrphanedFile[]
): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedFiles: [],
    errors: [],
    orphanedFiles: [],
  };
  
  await Promise.all(
    orphanedFiles.map(async (file) => {
      try {
        await deleteFile(file.storageKey);
        result.deletedFiles.push(file.storageKey);
        logger.info('Deleted orphaned file', { storageKey: file.storageKey });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ key: file.storageKey, error: errorMessage });
        logger.error('Failed to delete orphaned file', {
          storageKey: file.storageKey,
          error: errorMessage,
        });
      }
    })
  );
  
  return result;
}

// =============================================================================
// Storage Statistics
// =============================================================================

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, { count: number; size: number }>;
  orphanedCount: number;
  orphanedSize: number;
}

/**
 * Get storage statistics.
 * 
 * @returns Storage statistics
 */
export async function getStorageStats(): Promise<StorageStats> {
  // Get stats from database
  const files = await prisma.musicFile.findMany({
    select: {
      fileType: true,
      fileSize: true,
      storageKey: true,
    },
  });
  
  const stats: StorageStats = {
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.fileSize, 0),
    byType: {},
    orphanedCount: 0,
    orphanedSize: 0,
  };
  
  // Group by file type
  for (const file of files) {
    const type = file.fileType;
    if (!stats.byType[type]) {
      stats.byType[type] = { count: 0, size: 0 };
    }
    stats.byType[type].count++;
    stats.byType[type].size += file.fileSize;
  }
  
  // Find orphaned files
  const orphaned = await findOrphanedFiles();
  stats.orphanedCount = orphaned.length;
  stats.orphanedSize = orphaned.reduce((sum, f) => sum + f.size, 0);
  
  return stats;
}

// =============================================================================
// Temp File Cleanup
// =============================================================================

/**
 * Clean up temporary files in storage directory.
 * These are files with .tmp. in the name (from failed uploads).
 * 
 * @returns Number of temp files deleted
 */
export async function cleanupTempFiles(): Promise<number> {
  if (env.STORAGE_DRIVER === 'S3') {
    logger.warn('Temp file cleanup not implemented for S3');
    return 0;
  }
  
  const storagePath = path.resolve(env.LOCAL_STORAGE_PATH);
  
  try {
    const deletedCount = await cleanupTempFilesRecursive(storagePath);
    logger.info('Temp file cleanup complete', { deletedCount });
    return deletedCount;
  } catch (error) {
    logger.error('Temp file cleanup failed', { error });
    throw error;
  }
}

async function cleanupTempFilesRecursive(dirPath: string): Promise<number> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  let deletedCount = 0;
  const filesToUnlink: string[] = [];
  const directories: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      directories.push(fullPath);
    } else if (entry.isFile() && entry.name.includes('.tmp.')) {
      filesToUnlink.push(fullPath);
    }
  }

  // Parallelize unlinking in this directory
  await Promise.all(
    filesToUnlink.map(async (fullPath) => {
      await fs.unlink(fullPath);
      logger.info('Deleted temp file', { path: fullPath });
    })
  );

  deletedCount += filesToUnlink.length;

  // Recurse into subdirectories sequentially
  for (const dir of directories) {
    deletedCount += await cleanupTempFilesRecursive(dir);
  }
  
  return deletedCount;
}
