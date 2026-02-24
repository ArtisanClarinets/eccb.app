/**
 * OCR Fallback Service
 *
 * This module provides fallback metadata extraction when PDF rendering fails
 * or when the PDF is image-based (scanned sheet music).
 *
 * Note: True sheet music OCR is complex and out of scope for this MVP.
 * This module provides basic filename-based fallback extraction.
 */

import { logger } from '@/lib/logger';

export interface OCRMetadata {
  title: string;
  composer?: string;
  confidence: number;
  isImageScanned: boolean;
  needsManualReview: boolean;
}

/**
 * Check if PDF appears to be scanned/image-based (not searchable text)
 *
 * For MVP, we assume the PDF is not image-based since we're rendering it.
 * In a production system, this would use pdfjs text extraction to detect
 * if the PDF contains no selectable text.
 */
export async function isImageBasedPdf(_pdfBuffer: Buffer | string): Promise<boolean> {
  // Placeholder - in production, this would use pdfjs text extraction
  // to determine if the PDF contains extractable text or is purely image-based
  return false;
}

/**
 * Generate fallback metadata when standard extraction fails.
 * Uses filename parsing and provides a low confidence score to indicate
 * that manual review is required.
 */
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

    // Check if first part is just a number (like "01" or "1") - skip it entirely
    if (/^\d+$/.test(firstPart)) {
      // First part is just a track/sequence number, use second part as title
      title = secondPart;
      // Don't try to extract composer from the remaining title -
      // the second dash is likely part of the title (e.g., "March - Stars and Stripes")
    } else if (
      // Check if first part looks like a composer name (not starting with digits, capitalized, not too long)
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

/**
 * Parse score metadata from common filename patterns.
 * Returns structured metadata if recognized patterns are found.
 */
export function parseFilenameMetadata(filename: string): Partial<OCRMetadata> {
  const cleanName = filename.replace(/\.pdf$/i, '').trim();
  const result: Partial<OCRMetadata> = {};

  // Pattern: "Part 1 - Flute" or "Flute Part 1"
  const partMatch = cleanName.match(/(?:Part\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*Part)/i);
  if (partMatch) {
    // This appears to be a part - extract instrument if present
    const instrumentMatch = cleanName.match(/(?:Flute|Oboe|Clarinet|Saxophone|Trumpet|Trombone|Horn|Tuba|Percussion|Violin|Viola|Cello|Bass)/i);
    if (instrumentMatch) {
      result.title = cleanName;
      result.confidence = 30;
    }
  }

  // Pattern: "Conductor Score" or "Full Score"
  if (/conductor|full\s*score|score/i.test(cleanName)) {
    result.title = cleanName;
    result.confidence = 35;
  }

  return result;
}