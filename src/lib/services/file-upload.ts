import { mkdir, rename, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join, resolve } from 'path';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'profiles');
const PUBLIC_PATH = '/uploads/profiles';
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

let ensureUploadDirPromise: Promise<void> | null = null;

/**
 * Ensure upload directory exists.
 * Uses a shared promise to avoid duplicate mkdir work under concurrency.
 */
async function ensureUploadDir(): Promise<void> {
  if (!ensureUploadDirPromise) {
    // mkdir returns Promise<string | undefined>, so cast to void by chaining a
    // resolution handler. We also clear the shared promise when done so
    // subsequent calls can recreate the directory if needed.
    ensureUploadDirPromise = mkdir(UPLOAD_DIR, { recursive: true })
      .then(() => {})
      .finally(() => {
        ensureUploadDirPromise = null;
      });
  }

  await ensureUploadDirPromise;
}

function getFileExtension(mimeType: string): string {
  return ALLOWED_IMAGE_TYPES.get(mimeType) || '.jpg';
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a) {
    return 'image/png';
  }

  if (buffer.length >= 6) {
    const gifHeader = buffer.subarray(0, 6).toString('ascii');
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return 'image/gif';
    }
  }

  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp';
    }
  }

  return null;
}

function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType);
}

function toPublicPhotoPath(fileName: string): string {
  return `${PUBLIC_PATH}/${fileName}`;
}

function resolveUploadPath(fileName: string): string {
  const safeName = basename(fileName);
  const resolved = resolve(UPLOAD_DIR, safeName);
  const uploadRoot = resolve(UPLOAD_DIR);

  if (!resolved.startsWith(`${uploadRoot}${process.platform === 'win32' ? '\\' : '/'}`) && resolved !== uploadRoot) {
    throw new Error('Resolved upload path is outside the upload directory');
  }

  return resolved;
}

/**
 * Save a profile photo and return the public URL path.
 *
 * Notes:
 * - Keeps current storage behavior under /public/uploads/profiles
 * - Verifies both declared MIME type and file signature
 */
export async function saveProfilePhoto(file: File): Promise<string> {
  if (!(file instanceof File)) {
    throw new Error('Invalid upload payload. Expected a File.');
  }

  if (!isAllowedMimeType(file.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
  }

  if (file.size <= 0) {
    throw new Error('File is empty.');
  }

  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error('File size too large. Maximum size is 5MB.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedMimeType = detectImageMimeType(buffer);

  if (!detectedMimeType || !isAllowedMimeType(detectedMimeType)) {
    throw new Error('Invalid image file. Only JPEG, PNG, GIF, and WebP images are allowed.');
  }

  if (detectedMimeType !== file.type) {
    throw new Error('Uploaded file content does not match the declared file type.');
  }

  const extension = getFileExtension(detectedMimeType);
  const fileName = `${nanoid(16)}${extension}`;
  const tempFileName = `${fileName}.tmp`;
  const finalPath = resolveUploadPath(fileName);
  const tempPath = resolveUploadPath(tempFileName);

  await ensureUploadDir();

  try {
    await writeFile(tempPath, buffer);
    await rename(tempPath, finalPath);

    return toPublicPhotoPath(fileName);
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch {
      // best-effort cleanup
    }

    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('file-upload: failed to save profile photo', {
      errorMessage: err.message,
      errorName: err.name,
      fileSize: file.size,
      mimeType: file.type,
    });

    throw new Error('Failed to save profile photo.');
  }
}

/**
 * Delete a profile photo.
 *
 * @param photoPath The public path to the photo (e.g., /uploads/profiles/abc123.jpg)
 */
export async function deleteProfilePhoto(photoPath: string | null): Promise<void> {
  if (!photoPath || typeof photoPath !== 'string') {
    return;
  }

  const expectedPrefix = `${PUBLIC_PATH}/`;
  if (!photoPath.startsWith(expectedPrefix)) {
    return;
  }

  const fileName = basename(photoPath);
  if (!fileName || fileName === '.' || fileName === '..') {
    return;
  }

  const filePath = resolveUploadPath(fileName);

  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn('file-upload: failed to delete profile photo', {
      errorMessage: err.message,
      errorName: err.name,
      photoPath,
      fileName,
    });
    // preserve current non-throwing behavior
  }
}