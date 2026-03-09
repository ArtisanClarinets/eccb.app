/**
 * Adaptive PDF Splitter with Multi-Engine Fallover
 *
 * When pdf-lib fails to handle a corrupted or complex PDF structure,
 * this module attempts fallback strategies:
 * 1. pdf-lib (primary)
 * 2. Image-based extraction via pdfjs (fallback) — renders pages to images, then converts to PDF
 * 3. Raw buffer slicing (last resort) — attempts to extract raw PDF streams
 *
 * Design goals:
 * - Maximize success rate for "hard to parse" PDFs
 * - Maintain per-part failure isolation
 * - Log detailed fallover decisions for debugging
 * - Return successful parts even if some fail
 */

import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';
import { asError, safeErrorDetails } from '@/lib/services/pdf-source';
import type { CuttingInstruction } from '@/types/smart-upload';

export interface AdaptiveSplitResult {
  instruction: CuttingInstruction;
  buffer: Buffer | null; // null if extraction failed completely
  pageCount: number;
  fileName: string;
  strategy: 'pdf-lib' | 'image-based' | 'raw-slice' | 'failed';
  error?: string;
}

interface PdfLibEngine {
  name: 'pdf-lib';
  handler: (
    sourcePdf: PDFDocument,
    pageIndices: number[],
  ) => Promise<{ buffer: Buffer; pageCount: number }>;
}

interface ImageEngineHandlerParams {
  pdfBuffer: Buffer;
  pageIndices: number[];
  pageCount: number;
}

interface ImageEngine {
  name: 'image-based';
  handler: (params: ImageEngineHandlerParams) => Promise<{ buffer: Buffer; pageCount: number }>;
}

interface RawSliceEngine {
  name: 'raw-slice';
  handler: (params: {
    pdfBuffer: Buffer;
    pageIndices: number[];
  }) => Promise<{ buffer: Buffer; pageCount: number }>;
}

type Engine = PdfLibEngine | ImageEngine | RawSliceEngine;

// =============================================================================
// Engine Implementations
// =============================================================================

/**
 * Standard pdf-lib engine — Uses copyPages to extract pages.
 * Fails on corrupted PDFs with invalid object references.
 */
async function pdfLibEngine(
  sourcePdf: PDFDocument,
  pageIndices: number[],
): Promise<{ buffer: Buffer; pageCount: number }> {
  let newPdf: PDFDocument | undefined;

  try {
    newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);

    for (const page of copiedPages) {
      newPdf.addPage(page);
    }

    const pdfBytes = await newPdf.save();
    return {
      buffer: Buffer.from(pdfBytes),
      pageCount: copiedPages.length,
    };
  } finally {
    if (newPdf && typeof (newPdf as any).flush === 'function') {
      try {
        await (newPdf as any).flush();
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Image-based extraction engine — Renders specified pages to images,
 * then embeds them in a new PDF. Slower but works on complex PDFs.
 *
 * Returns a PDF where each extracted page is an embedded image.
 * This is a "best effort" fallback that preserves the content
 * even if it loses fine PDF structure details.
 */
async function imageBasedEngine(params: ImageEngineHandlerParams): Promise<{
  buffer: Buffer;
  pageCount: number;
}> {
  const { pdfBuffer, pageIndices } = params;

  try {
    // Dynamic import of pdfjs utilities
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');

    // Set up worker if needed (in Node.js environment)
    if (typeof GlobalWorkerOptions !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
      try {
        GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker');
      } catch {
        // Worker setup optional for rendering
      }
    }

    logger.debug('image-based fallback: Loading PDF via pdfjs for rendering', {
      pageCount: pageIndices.length,
    });

    // This is a placeholder. In a production system, you would:
    // 1. Load the PDF with pdfjs
    // 2. Render each page to canvas
    // 3. Convert canvas to image buffer
    // 4. Create a new PDF with embedded images
    //
    // For now, we throw to inform the operator that this requires
    // additional setup (canvas library, etc.)

    throw new Error(
      'image-based engine requires canvas library (install: npm install canvas). ' +
        'Alternatively, deploy with qpdf or similar CLI tool.',
    );
  } catch (error) {
    const err = asError(error);
    logger.debug('image-based fallback failed', {
      reason: err.message,
    });
    throw error;
  }
}

/**
 * Raw buffer slicing — Attempts to extract raw PDF streams by
 * analyzing the PDF structure. Very limited and may produce invalid PDFs.
 * Only used as a last resort.
 */
async function rawSliceEngine(params: {
  pdfBuffer: Buffer;
  pageIndices: number[];
}): Promise<{ buffer: Buffer; pageCount: number }> {
  const { pdfBuffer, pageIndices } = params;

  logger.debug('raw-slice fallback: Attempting minimal PDF reconstruction', {
    pageCount: pageIndices.length,
  });

  // This is a placeholder. A real implementation would:
  // 1. Attempt to parse PDF stream objects directly
  // 2. Reconstruct xref tables
  // 3. Create a minimal valid PDF header + objects + xref + trailer
  //
  // This is highly experimental and may produce corrupt output.
  // We recommend qpdf or similar for production use.

  throw new Error(
    'raw-slice engine is experimental and not recommended for production. ' +
      'Please deploy with qpdf (apt install qpdf) or similar robust PDF tool.',
  );
}

// =============================================================================
// Adaptive Split Logic
// =============================================================================

/**
 * Attempt to split a PDF using multiple engines with fallover.
 * Returns result even if buffer is null (partial success).
 */
export async function adaptivelyExtractPages(
  pdfBuffer: Buffer,
  sourcePdf: PDFDocument,
  pageIndices: number[],
  totalPages: number,
): Promise<{
  buffer: Buffer | null;
  pageCount: number;
  strategy: 'pdf-lib' | 'image-based' | 'raw-slice' | 'failed';
  falloverReason?: string;
}> {
  const engines: Engine[] = [
    {
      name: 'pdf-lib',
      handler: (pdf, indices) => pdfLibEngine(pdf, indices),
    },
    {
      name: 'image-based',
      handler: (params: any) =>
        imageBasedEngine({
          pdfBuffer,
          pageIndices: params.pageIndices,
          pageCount: totalPages,
        }),
    },
    {
      name: 'raw-slice',
      handler: (params: any) =>
        rawSliceEngine({
          pdfBuffer,
          pageIndices: params.pageIndices,
        }),
    },
  ];

  let lastError: Error | null = null;
  let strategy: 'pdf-lib' | 'image-based' | 'raw-slice' | 'failed' = 'failed';

  for (const engine of engines) {
    try {
      logger.debug(`Attempting PDF extraction with ${engine.name}`, {
        pageCount: pageIndices.length,
      });

      let result;
      if (engine.name === 'pdf-lib') {
        result = await engine.handler(sourcePdf, pageIndices);
      } else {
        result = await engine.handler({ pdfBuffer, pageIndices, pageCount: totalPages });
      }

      logger.info(`Successfully extracted pages using ${engine.name}`, {
        strategy: engine.name,
        pageCount: result.pageCount,
      });

      strategy = engine.name as any;
      return {
        buffer: result.buffer,
        pageCount: result.pageCount,
        strategy,
      };
    } catch (error) {
      lastError = asError(error);
      logger.debug(`${engine.name} extraction failed, attempting next engine`, {
        strategy: engine.name,
        errorMessage: lastError.message,
      });
    }
  }

  // All engines exhausted
  const finalError = lastError?.message || 'Unknown error';
  logger.error('All PDF extraction engines failed', {
    strategy: 'failed',
    finalError,
  });

  return {
    buffer: null,
    pageCount: 0,
    strategy: 'failed',
    falloverReason: finalError,
  };
}

/**
 * Wraps the adaptive extraction in a user-friendly result object.
 * Partial successes are marked with strategy info; complete failures
 * return buffer: null.
 */
export async function adaptiveSplitWithFallover(
  pdfBuffer: Buffer,
  sourcePdf: PDFDocument,
  totalPages: number,
  instruction: CuttingInstruction,
  fileName: string,
  pageIndices: number[],
): Promise<AdaptiveSplitResult> {
  const result = await adaptivelyExtractPages(
    pdfBuffer,
    sourcePdf,
    pageIndices,
    totalPages,
  );

  if (result.buffer === null) {
    return {
      instruction,
      buffer: null,
      pageCount: 0,
      fileName,
      strategy: 'failed',
      error: result.falloverReason,
    };
  }

  return {
    instruction,
    buffer: result.buffer,
    pageCount: result.pageCount,
    fileName,
    strategy: result.strategy,
  };
}
