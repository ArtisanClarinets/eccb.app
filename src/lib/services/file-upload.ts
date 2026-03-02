import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { nanoid } from 'nanoid';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'profiles');
const PUBLIC_PATH = '/uploads/profiles';

/**
 * Ensure upload directory exists
 */
async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Save a profile photo and return the public URL path
 * @param file The image file to upload
 * @returns The public URL path to the uploaded image
 */
export async function saveProfilePhoto(file: File): Promise<string> {
  // Validate file
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File size too large. Maximum size is 5MB.');
  }

  // Generate unique filename
  const ext = getFileExtension(file.type);
  const filename = `${nanoid(16)}${ext}`;

  // Ensure directory exists
  await ensureUploadDir();

  // Save file
  const buffer = await file.arrayBuffer();
  await writeFile(join(UPLOAD_DIR, filename), Buffer.from(buffer));

  // Return relative public path
  return `${PUBLIC_PATH}/${filename}`;
}

/**
 * Delete a profile photo
 * @param photoPath The public path to the photo (e.g., /uploads/profiles/abc123.jpg)
 */
export async function deleteProfilePhoto(photoPath: string | null): Promise<void> {
  if (!photoPath || !photoPath.startsWith(PUBLIC_PATH)) {
    return;
  }

  try {
    const filename = photoPath.replace(PUBLIC_PATH + '/', '');
    const filePath = join(UPLOAD_DIR, filename);
    
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    console.error('Error deleting profile photo:', error);
    // Don't throw - continue even if deletion fails
  }
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.jpg';
}
