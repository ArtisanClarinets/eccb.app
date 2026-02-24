import { logger } from '@/lib/logger';
import { OCRMetadata } from '@/lib/services/ocr-fallback';

export function generateOCRFallback(filename: string): OCRMetadata {
  // Remove .pdf extension and clean up filename
  let title = filename.replace(/\.pdf$/i, '').trim();

  // Try to extract common patterns from filenames
  // Pattern: "Composer - Title" or "Title - Composer"
  const dashMatch = title.match(/^(.+?)\s*-\s*(.+)$/);
  let composer: string | undefined;

  if (dashMatch) {
    // Assume first part is composer if it looks like a name (capitalized, not too long, not just a number)
    const firstPart = dashMatch[1].trim();
    const secondPart = dashMatch[2].trim();

    // Check if first part looks like a composer name (not starting with digits, capitalized, not too long)
    if (
      !/^\d/.test(firstPart) &&
      firstPart.length < 30 &&
      /^[A-Z]/.test(firstPart)
    ) {
      composer = firstPart;
      title = secondPart;
    } else if (
      !/^\d/.test(secondPart) &&
      secondPart.length < 30 &&
      /^[A-Z]/.test(secondPart)
    ) {
      composer = secondPart;
      title = firstPart;
    }
  }

  // Clean up common artifacts from filenames
  title = title
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\d+[\s._-]+/, '') // Remove leading numbers like "01-", "1. "
    .trim();

  const result: OCRMetadata = {
    title,
    confidence: 25, // Very low - needs manual review
    isImageScanned: true,
    needsManualReview: true,
  };

  if (composer) {
    result.composer = composer;
    result.confidence = 35; // Slightly higher if we extracted composer from filename
  }

  logger.info('Generated OCR fallback metadata', {
    filename,
    title: result.title,
    composer: result.composer,
    confidence: result.confidence,
  });

  return result;
}