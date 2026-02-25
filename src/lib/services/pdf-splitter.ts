/**
 * PDF Splitter Service
 *
 * Splits a multi-part PDF into individual part PDFs based on page ranges.
 * Uses pdf-lib for PDF manipulation.
 */

import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

import type { CuttingInstruction } from '@/types/smart-upload';

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
    // Convert Buffer to Uint8Array for pdf-lib compatibility
    const pdfData = new Uint8Array(pdfBuffer);
    const sourcePdf = await PDFDocument.load(pdfData);
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
    const pdfData = new Uint8Array(pdfBuffer);
    const pdfDoc = await PDFDocument.load(pdfData);
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
    const pdfData = new Uint8Array(pdfBuffer);
    const pdfDoc = await PDFDocument.load(pdfData);

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


/**
 * Sanitize filename by replacing invalid characters
 */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Split PDF by cutting instructions.
 *
 * @param pdfBuffer - The original PDF as a Buffer
 * @param originalBaseName - The original PDF base name (without extension)
 * @param instructions - Array of CuttingInstruction objects
 * @returns Array of split parts with instructions, buffers, page counts, and filenames
 */
export interface SplitPdfOptions {
  pdfBuffer: Buffer;
  instructions: CuttingInstruction[];
  generateFilename?: (partName: string, pageStart: number, pageEnd: number, index: number) => string;
}

export async function splitPdfByCuttingInstructions(
  pdfBuffer: Buffer,
  originalBaseName: string,
  instructions: CuttingInstruction[],
  generateFilename?: (partName: string, pageStart: number, pageEnd: number, index: number) => string
): Promise<Array<{
  instruction: CuttingInstruction;
  buffer: Buffer;
  pageCount: number;
  fileName: string;
}>> {
  if (instructions.length === 0) {
    logger.warn('No cutting instructions provided');
    return [];
  }

  try {
    // Convert Buffer to Uint8Array for pdf-lib compatibility
    const pdfData = new Uint8Array(pdfBuffer);
    const sourcePdf = await PDFDocument.load(pdfData);
    const totalPages = sourcePdf.getPageCount();
    const results: Array<{
      instruction: CuttingInstruction;
      buffer: Buffer;
      pageCount: number;
      fileName: string;
    }> = [];

    const sanitizedBaseName = sanitizeFileName(originalBaseName);

    logger.info('Starting PDF split by cutting instructions', {
      totalPages,
      instructionsCount: instructions.length,
    });

    for (const instruction of instructions) {
      const [startPage, endPage] = instruction.pageRange;

      // Validate and clamp page range
      let clampedStart = startPage;
      let clampedEnd = endPage;

      // Check if page indices are out of bounds
      if (startPage < 0 || startPage >= totalPages || endPage < 0 || endPage >= totalPages) {
        logger.warn('Page range exceeds PDF bounds, clamping to valid range', {
          partName: instruction.partName,
          requestedStart: startPage,
          requestedEnd: endPage,
          totalPages,
        });
        clampedStart = Math.max(0, Math.min(startPage, totalPages - 1));
        clampedEnd = Math.max(clampedStart, Math.min(endPage, totalPages - 1));
      }

      // Create page indices array (0-indexed, inclusive)
      const pageIndices: number[] = [];
      for (let i = clampedStart; i <= clampedEnd; i++) {
        pageIndices.push(i);
      }

      if (pageIndices.length === 0) {
        logger.warn('No valid pages for instruction', {
          partName: instruction.partName,
          pageRange: instruction.pageRange,
        });
        continue;
      }

      try {
        // Create new PDF for this part
        const newPdf = await PDFDocument.create();

        // Copy pages from source to new PDF
        const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);

        // Add all copied pages to the new PDF (multi-page, not split)
        copiedPages.forEach((page) => newPdf.addPage(page));

        // Save to buffer
        const pdfBytes = await newPdf.save();
        const buffer = Buffer.from(pdfBytes);

        // Generate filename
        const fileName = generateFilename
          ? generateFilename(instruction.partName, clampedStart, clampedEnd, results.length)
          : sanitizeFileName(`${sanitizedBaseName} - ${instruction.partName}.pdf`);

        results.push({
          instruction,
          buffer,
          pageCount: copiedPages.length,
          fileName,
        });

        logger.info('Split part created from cutting instruction', {
          partName: instruction.partName,
          pages: copiedPages.length,
          pageIndexRange: `${clampedStart}-${clampedEnd}`,
          fileName,
        });
      } catch (partError) {
        const err = partError instanceof Error ? partError : new Error(String(partError));
        logger.error('Failed to create split part from instruction', err, {
          partName: instruction.partName,
          pageRange: instruction.pageRange,
        });
        // Continue with other instructions
      }
    }

    if (results.length === 0) {
      logger.warn('No parts were successfully split from cutting instructions');
      return [];
    }

    logger.info('PDF split by cutting instructions complete', {
      partsCreated: results.length,
      totalPagesProcessed: results.reduce((sum, part) => sum + part.pageCount, 0),
    });

    return results;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to split PDF by cutting instructions', err);
    throw new Error(`Failed to split PDF: ${err.message}`);
  }
}
