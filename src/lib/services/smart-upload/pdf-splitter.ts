/**
 * PDF Splitter Service
 *
 * Provides PDF splitting functionality using pdf-lib.
 * Splits multi-part PDFs into individual instrument parts based on a split plan.
 */

import { PDFDocument } from 'pdf-lib';

import { logger } from '@/lib/logger';
import { PdfSplitError } from './smart-upload.types';
import type {
  SplitPlan,
  SplitResult,
  SplitFile,
  PartClassification,
} from './smart-upload.types';
import { computeContentHash } from './content-hash';

// =============================================================================
// Main Split Function
// =============================================================================

/**
 * Split a PDF buffer into multiple parts based on a split plan.
 *
 * @param buffer - Original PDF buffer
 * @param plan - Split plan defining page ranges and instruments
 * @returns SplitResult containing buffers for each split file
 */
export async function splitPdf(buffer: Buffer, plan: SplitPlan): Promise<SplitResult> {
  logger.info('Starting PDF split', {
    planPages: plan.pages.length,
    bufferSize: buffer.length,
  });

  // Load the original PDF
  const originalPdf = await PDFDocument.load(buffer);
  const totalPages = originalPdf.getPageCount();

  logger.debug('Original PDF loaded', { totalPages });

  // Validate the plan
  validateSplitPlan(plan, totalPages);

  // Create a new PDF document for each split part
  const files: SplitFile[] = [];

  for (let i = 0; i < plan.pages.length; i++) {
    const splitPage = plan.pages[i];
    const { start, end, instrument } = splitPage;

    logger.debug('Processing split part', {
      instrument,
      start,
      end,
      pageCount: end - start + 1,
    });

    // Create new PDF with selected pages
    const splitPdf = await PDFDocument.create();
    const pageIndices = [];

    // Page indices are 0-based, plan uses 1-based
    for (let pageNum = start - 1; pageNum <= end - 1; pageNum++) {
      pageIndices.push(pageNum);
    }

    const copiedPages = await splitPdf.copyPages(originalPdf, pageIndices);

    for (const page of copiedPages) {
      splitPdf.addPage(page);
    }

    // Get the pages array for metadata
    const pages = Array.from({ length: end - start + 1 }, (_, idx) => start + idx);

    // Generate storage key
    const pdfBytes = await splitPdf.save();
    const hash = computeContentHash(Buffer.from(pdfBytes));
    const storageKey = generateStorageKey(hash, instrument, i);

    files.push({
      buffer: Buffer.from(pdfBytes),
      instrument,
      pages,
      storageKey,
    });

    logger.info('Split part created', {
      instrument,
      pages: pages.length,
      size: pdfBytes.length,
      storageKey,
    });
  }

  logger.info('PDF split completed', {
    totalParts: files.length,
    totalSize: files.reduce((sum, f) => sum + f.buffer.length, 0),
  });

  return { files };
}

// =============================================================================
// Split Plan Creation
// =============================================================================

/**
 * Create a split plan from LLM classification result.
 *
 * @param classification - Part classification from LLM
 * @returns SplitPlan for PDF splitting
 */
export function createSplitPlanFromClassification(
  classification: PartClassification
): SplitPlan {
  logger.info('Creating split plan from classification', {
    parts: classification.parts.length,
    totalPages: classification.totalPages,
  });

  const pages: { start: number; end: number; instrument: string }[] = [];

  for (const part of classification.parts) {
    if (part.pages.length === 0) {
      logger.warn('Skipping part with no pages', { instrument: part.instrument });
      continue;
    }

    // Sort pages to ensure correct order
    const sortedPages = [...part.pages].sort((a, b) => a - b);
    const start = sortedPages[0];
    const end = sortedPages[sortedPages.length - 1];

    pages.push({
      start,
      end,
      instrument: normalizeInstrumentName(part.instrument),
    });

    logger.debug('Added part to split plan', {
      instrument: part.instrument,
      start,
      end,
      pageCount: sortedPages.length,
    });
  }

  // Sort pages by start page
  pages.sort((a, b) => a.start - b.start);

  return { pages };
}

/**
 * Normalize instrument name for use in filenames and storage keys.
 * Converts to lowercase, removes special characters, replaces spaces with hyphens.
 */
function normalizeInstrumentName(instrument: string): string {
  return instrument
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

// =============================================================================
// Storage Key Generation
// =============================================================================

/**
 * Generate a deterministic storage key for a split file.
 *
 * Format: splits/{hash}/{instrument}-{index}.pdf
 *
 * @param originalKey - Original file storage key (or hash)
 * @param instrument - Instrument name
 * @param index - Index of the split part
 * @returns Storage key for the split file
 */
export function generateStorageKey(
  originalKey: string,
  instrument: string,
  index: number
): string {
  const normalizedInstrument = normalizeInstrumentName(instrument);
  const hash = originalKey.substring(0, 8); // Use first 8 chars of hash
  return `splits/${hash}/${normalizedInstrument}-${index + 1}.pdf`;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a split plan against the PDF's total pages.
 */
function validateSplitPlan(plan: SplitPlan, totalPages: number): void {
  if (!plan.pages || plan.pages.length === 0) {
    throw new PdfSplitError('Split plan must contain at least one page range');
  }

  for (const pageRange of plan.pages) {
    // Validate page range
    if (pageRange.start < 1) {
      throw new PdfSplitError(
        `Invalid page range: start page (${pageRange.start}) must be >= 1`
      );
    }

    if (pageRange.end > totalPages) {
      throw new PdfSplitError(
        `Invalid page range: end page (${pageRange.end}) exceeds total pages (${totalPages})`
      );
    }

    if (pageRange.start > pageRange.end) {
      throw new PdfSplitError(
        `Invalid page range: start (${pageRange.start}) > end (${pageRange.end})`
      );
    }

    // Validate instrument name
    if (!pageRange.instrument || pageRange.instrument.trim() === '') {
      throw new PdfSplitError('Instrument name is required for each page range');
    }
  }

  // Check for overlapping ranges
  const sortedRanges = [...plan.pages].sort((a, b) => a.start - b.start);

  for (let i = 1; i < sortedRanges.length; i++) {
    const prev = sortedRanges[i - 1];
    const curr = sortedRanges[i];

    if (curr.start <= prev.end) {
      throw new PdfSplitError(
        `Overlapping page ranges: ${prev.start}-${prev.end} and ${curr.start}-${curr.end}`
      );
    }
  }

  logger.debug('Split plan validated', {
    ranges: plan.pages.length,
    totalPages,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get page ranges as a human-readable string.
 */
export function formatPageRanges(plan: SplitPlan): string {
  return plan.pages
    .map((p) => `${p.start}-${p.end} (${p.instrument})`)
    .join(', ');
}

/**
 * Estimate the total size of split files before splitting.
 * This is an approximation based on page count ratio.
 */
export function estimateSplitSizes(
  originalSize: number,
  plan: SplitPlan,
  totalPages: number
): number[] {
  return plan.pages.map((pageRange) => {
    const pageCount = pageRange.end - pageRange.start + 1;
    const ratio = pageCount / totalPages;
    // Add some overhead for PDF structure
    return Math.ceil(originalSize * ratio * 1.1);
  });
}
