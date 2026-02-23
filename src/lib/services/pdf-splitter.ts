/**
 * PDF Splitter Service
 *
 * Splits a multi-part PDF into individual part PDFs based on page ranges.
 * Uses pdf-lib for PDF manipulation.
 */

import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

export interface PageRange {
  start: number; // 0-indexed start page
  end: number; // 0-indexed end page (inclusive)
  name: string; // Name for the split part
}

export interface SplitPart {
  name: string;
  buffer: Buffer;
  pageCount: number;
}

/**
 * Split PDF into separate files by page ranges.
 *
 * @param pdfBuffer - The original PDF as a Buffer
 * @param pageRanges - Array of page ranges with names for each part
 * @returns Array of split parts with names and buffers
 */
export async function splitPdfByPageRanges(
  pdfBuffer: Buffer,
  pageRanges: PageRange[]
): Promise<SplitPart[]> {
  // If no ranges provided, return the original as single part
  if (pageRanges.length === 0) {
    logger.info('No page ranges provided, returning original PDF as single part');
    return [
      {
        name: 'unsplit.pdf',
        buffer: pdfBuffer,
        pageCount: 0, // Will be determined if needed
      },
    ];
  }

  try {
    const sourcePdf = await PDFDocument.load(pdfBuffer);
    const totalPages = sourcePdf.getPageCount();
    const results: SplitPart[] = [];

    logger.info('Starting PDF split', {
      totalPages,
      partsToExtract: pageRanges.length,
    });

    for (const range of pageRanges) {
      // Validate and adjust page range
      const validStart = Math.max(0, Math.min(range.start, totalPages - 1));
      const validEnd = Math.max(validStart, Math.min(range.end, totalPages - 1));

      if (validStart > validEnd) {
        logger.warn('Invalid page range, skipping', {
          name: range.name,
          start: range.start,
          end: range.end,
        });
        continue;
      }

      // Create page indices array (0-indexed)
      const pageIndices: number[] = [];
      for (let i = validStart; i <= validEnd; i++) {
        pageIndices.push(i);
      }

      if (pageIndices.length === 0) {
        logger.warn('No valid pages for part', {
          name: range.name,
          range,
        });
        continue;
      }

      try {
        // Create new PDF for this part
        const newPdf = await PDFDocument.create();

        // Copy pages from source to new PDF
        const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);

        // Add all copied pages to the new PDF
        copiedPages.forEach((page) => newPdf.addPage(page));

        // Save to buffer
        const pdfBytes = await newPdf.save();
        const buffer = Buffer.from(pdfBytes);

        results.push({
          name: range.name,
          buffer,
          pageCount: copiedPages.length,
        });

        logger.info('Split part created', {
          partName: range.name,
          pages: pageIndices.length,
          pageIndexRange: `${validStart}-${validEnd}`,
        });
      } catch (partError) {
        const err = partError instanceof Error ? partError : new Error(String(partError));
        logger.error('Failed to create split part', err, {
          name: range.name,
          range,
        });
        // Continue with other parts even if one fails
      }
    }

    if (results.length === 0) {
      logger.warn('No parts were successfully split, returning original');
      return [
        {
          name: 'unsplit.pdf',
          buffer: pdfBuffer,
          pageCount: totalPages,
        },
      ];
    }

    logger.info('PDF split complete', {
      partsCreated: results.length,
      totalPagesProcessed: results.reduce((sum, part) => sum + part.pageCount, 0),
    });

    return results;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to split PDF', err);
    throw new Error(`Failed to split PDF: ${err.message}`);
  }
}

/**
 * Validate that a PDF buffer is valid before splitting.
 */
export async function validatePdfBuffer(pdfBuffer: Buffer): Promise<{
  valid: boolean;
  pageCount?: number;
  error?: string;
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return {
      valid: true,
      pageCount: pdfDoc.getPageCount(),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      valid: false,
      error: err.message,
    };
  }
}

/**
 * Get basic PDF metadata without full parsing.
 */
export async function getPdfMetadata(
  pdfBuffer: Buffer
): Promise<{
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    return {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to get PDF metadata', err);
    return {
      pageCount: 0,
    };
  }
}