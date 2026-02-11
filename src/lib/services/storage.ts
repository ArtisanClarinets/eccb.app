import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { env } from '@/lib/env';

// S3 Client configuration (only if S3 driver is used or needed)
const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

/**
 * Ensures the local storage directory exists
 */
async function ensureLocalDir(key: string) {
  const fullPath = path.join(env.LOCAL_STORAGE_PATH, key);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  return fullPath;
}

export async function uploadFile(
  file: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (env.STORAGE_DRIVER === 'S3') {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType,
      })
    );
  } else {
    const fullPath = await ensureLocalDir(key);
    await fs.writeFile(fullPath, file);
  }

  return key;
}

export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (env.STORAGE_DRIVER === 'S3') {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } else {
    // For local storage, we point to a custom API route that serves the file
    // The route will handle auth and stream the file from disk
    return `/api/storage/download?key=${encodeURIComponent(key)}`;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (env.STORAGE_DRIVER === 'S3') {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
      })
    );
  } else {
    const fullPath = path.join(env.LOCAL_STORAGE_PATH, key);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as any).code !== 'ENOENT') throw error;
    }
  }
}

export async function getFileUrl(key: string): Promise<string> {
  if (env.STORAGE_DRIVER === 'S3') {
    // If we have a public URL configured, use that for public files
    // But since these are music files, we usually want signed URLs
    return await getSignedDownloadUrl(key);
  }
  
  return await getSignedDownloadUrl(key);
}