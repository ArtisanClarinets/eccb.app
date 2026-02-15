import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { generateSignedUrl as generateLocalSignedUrl } from '@/lib/signed-url';

// =============================================================================
// Types
// =============================================================================

export interface FileMetadata {
  contentType: string;
  size: number;
  lastModified?: Date;
  etag?: string;
}

export interface UploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
}

export interface DownloadResult {
  stream: NodeJS.ReadableStream;
  metadata: FileMetadata;
}

// =============================================================================
// S3 Client (lazy initialization)
// =============================================================================

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;
  
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 configuration is incomplete. Check S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY');
  }
  
  _s3Client = new S3Client({
    region: env.S3_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  
  return _s3Client;
}

// =============================================================================
// Path Validation (Security)
// =============================================================================

/**
 * Validates and resolves a storage key to prevent path traversal attacks.
 * Only used for LOCAL storage driver.
 * 
 * @param key - The storage key to validate
 * @returns The resolved absolute path within the storage directory
 * @throws Error if path traversal is detected
 */
function validateAndResolvePath(key: string): string {
  // Reject null bytes
  if (key.includes('\0')) {
    throw new Error('Invalid key: null bytes not allowed');
  }
  
  // Reject absolute paths
  if (path.isAbsolute(key)) {
    throw new Error('Invalid key: absolute paths not allowed');
  }
  
  // Reject path traversal segments
  const normalizedKey = path.normalize(key);
  if (normalizedKey.startsWith('..') || normalizedKey.includes(path.sep + '..')) {
    throw new Error('Invalid key: path traversal not allowed');
  }
  
  // Check for encoded traversal attempts
  const decodedKey = decodeURIComponent(key);
  if (decodedKey.includes('..')) {
    throw new Error('Invalid key: encoded path traversal not allowed');
  }
  
  // Resolve the full path
  const storagePath = path.resolve(env.LOCAL_STORAGE_PATH);
  const fullPath = path.resolve(storagePath, key);
  
  // Ensure resolved path is within storage directory
  if (!fullPath.startsWith(storagePath + path.sep) && fullPath !== storagePath) {
    throw new Error('Invalid key: path must resolve within storage directory');
  }
  
  return fullPath;
}

// =============================================================================
// Storage Directory Initialization
// =============================================================================

let storageInitialized = false;

/**
 * Ensures the local storage directory exists.
 * Called once on first storage operation.
 */
async function ensureStorageDirectory(): Promise<void> {
  if (storageInitialized) return;
  
  const storagePath = path.resolve(env.LOCAL_STORAGE_PATH);
  
  try {
    await fs.mkdir(storagePath, { recursive: true });
    storageInitialized = true;
    logger.info(`Storage directory initialized: ${storagePath}`);
  } catch (error) {
    logger.error('Failed to create storage directory', { error, path: storagePath });
    throw error;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Upload a file to storage.
 * For LOCAL storage: writes atomically using temp file + rename
 * For S3 storage: uploads to S3 bucket
 * 
 * @param key - Storage key (path) for the file
 * @param file - File content as Buffer or ReadableStream
 * @param options - Upload options including content type
 * @returns The storage key
 */
export async function uploadFile(
  key: string,
  file: Buffer | NodeJS.ReadableStream,
  options: UploadOptions
): Promise<string> {
  if (env.STORAGE_DRIVER === 'S3') {
    return uploadToS3(key, file, options);
  }
  
  return uploadToLocal(key, file, options);
}

async function uploadToS3(
  key: string,
  file: Buffer | NodeJS.ReadableStream,
  options: UploadOptions
): Promise<string> {
  const client = getS3Client();
  
  const body = Buffer.isBuffer(file) ? file : await streamToBuffer(file as NodeJS.ReadableStream);
  
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: options.contentType,
      Metadata: options.metadata,
    })
  );
  
  logger.info('File uploaded to S3', { key, size: body.length });
  return key;
}

async function uploadToLocal(
  key: string,
  file: Buffer | NodeJS.ReadableStream,
  options: UploadOptions
): Promise<string> {
  await ensureStorageDirectory();
  
  const fullPath = validateAndResolvePath(key);
  const dir = path.dirname(fullPath);
  
  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });
  
  // Write to temp file first (atomic write)
  const tempPath = `${fullPath}.tmp.${Date.now()}`;
  
  try {
    if (Buffer.isBuffer(file)) {
      await fs.writeFile(tempPath, file);
    } else {
      // Stream to temp file
      const writeStream = createWriteStream(tempPath);
      await pipeline(file as NodeJS.ReadableStream, writeStream);
    }
    
    // Rename temp file to final path (atomic on same filesystem)
    await fs.rename(tempPath, fullPath);
    
    logger.info('File uploaded to local storage', { key, path: fullPath });
    return key;
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Download a file from storage.
 * For LOCAL storage: returns a readable stream
 * For S3 storage: returns a presigned URL (redirect)
 * 
 * @param key - Storage key (path) for the file
 * @returns Download result with stream or URL
 */
export async function downloadFile(key: string): Promise<DownloadResult | string> {
  if (env.STORAGE_DRIVER === 'S3') {
    return getSignedDownloadUrl(key);
  }
  
  return downloadFromLocal(key);
}

async function downloadFromLocal(key: string): Promise<DownloadResult> {
  await ensureStorageDirectory();
  
  const fullPath = validateAndResolvePath(key);
  
  // Check if file exists
  try {
    const stats = await fs.stat(fullPath);
    
    if (!stats.isFile()) {
      throw new Error('Not a file');
    }
    
    const stream = createReadStream(fullPath);
    
    // Detect content type from extension
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = getContentType(ext);
    
    return {
      stream,
      metadata: {
        contentType,
        size: stats.size,
        lastModified: stats.mtime,
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw error;
  }
}

/**
 * Get a presigned download URL for S3 storage.
 * For LOCAL storage, returns the API route URL.
 * 
 * @param key - Storage key (path) for the file
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Presigned URL or API route URL
 */
export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (env.STORAGE_DRIVER === 'S3') {
    const client = getS3Client();
    
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    });
    
    return getSignedUrl(client, command, { expiresIn });
  }
  
  // For local storage, return the API route URL
  // The route will handle auth and stream the file
  return `/api/files/${key}`;
}

/**
 * Generate a secure, time-limited download URL.
 * For S3: generates a presigned URL
 * For LOCAL: generates a signed URL with token validation
 * 
 * @param key - Storage key (path) for the file
 * @param options - Options including expiration time and user ID
 * @returns Secure download URL
 */
export interface SecureUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  userId?: string;
}

export async function generateSecureDownloadUrl(
  key: string,
  options: SecureUrlOptions = {}
): Promise<string> {
  const expiresIn = options.expiresIn || 3600;
  
  if (env.STORAGE_DRIVER === 'S3') {
    const client = getS3Client();
    
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    });
    
    return getSignedUrl(client, command, { expiresIn });
  }
  
  // For local storage, generate a signed URL with token
  return generateLocalSignedUrl(key, {
    expiresIn,
    userId: options.userId,
  });
}

/**
 * Delete a file from storage.
 * 
 * @param key - Storage key (path) for the file
 */
export async function deleteFile(key: string): Promise<void> {
  if (env.STORAGE_DRIVER === 'S3') {
    const client = getS3Client();
    
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
      })
    );
    
    logger.info('File deleted from S3', { key });
    return;
  }
  
  await ensureStorageDirectory();
  
  const fullPath = validateAndResolvePath(key);
  
  try {
    await fs.unlink(fullPath);
    logger.info('File deleted from local storage', { key });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, that's fine
      logger.warn('Attempted to delete non-existent file', { key });
      return;
    }
    throw error;
  }
}

/**
 * Check if a file exists in storage.
 * 
 * @param key - Storage key (path) for the file
 * @returns True if file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  if (env.STORAGE_DRIVER === 'S3') {
    const client = getS3Client();
    
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: key,
        })
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
  
  await ensureStorageDirectory();
  
  const fullPath = validateAndResolvePath(key);
  
  try {
    const stats = await fs.stat(fullPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Get file metadata from storage.
 * 
 * @param key - Storage key (path) for the file
 * @returns File metadata
 */
export async function getFileMetadata(key: string): Promise<FileMetadata> {
  if (env.STORAGE_DRIVER === 'S3') {
    const client = getS3Client();
    
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
      })
    );
    
    return {
      contentType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || 0,
      lastModified: response.LastModified,
      etag: response.ETag,
    };
  }
  
  await ensureStorageDirectory();
  
  const fullPath = validateAndResolvePath(key);
  
  try {
    const stats = await fs.stat(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    
    return {
      contentType: getContentType(ext),
      size: stats.size,
      lastModified: stats.mtime,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw error;
  }
}

/**
 * Get file URL (for display/download).
 * This returns a URL that can be used to access the file.
 * 
 * @param key - Storage key (path) for the file
 * @returns URL to access the file
 */
export async function getFileUrl(key: string): Promise<string> {
  return getSignedDownloadUrl(key);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a readable stream to a buffer.
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  
  return Buffer.concat(chunks);
}

/**
 * Get content type from file extension.
 */
function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Validate file content using magic bytes.
 * Returns the detected content type or null if invalid.
 */
export function validateFileMagicBytes(buffer: Buffer, expectedType: string): boolean {
  // PDF: starts with %PDF
  if (expectedType === 'application/pdf') {
    return buffer.length >= 4 && 
           buffer[0] === 0x25 && // %
           buffer[1] === 0x50 && // P
           buffer[2] === 0x44 && // D
           buffer[3] === 0x46;   // F
  }
  
  // Add more magic byte validations as needed
  
  return true;
}
