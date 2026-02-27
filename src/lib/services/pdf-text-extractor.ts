/**
 * PDF Text Extractor Service
 *
 * Uses pdfjs-dist (already in the project) to extract text from PDF pages,
 * particularly page headers for deterministic instrument/part identification.
 * Digital PDFs (with embedded text layer) can be segmented without vision OCR.
 *
 * Corp-grade goals:
 * - Never log extracted text contents
 * - Stable return values even when pages fail
 * - Best-effort cleanup of pdfjs loadingTask
 * - Structured logs with performance metrics
 *
 * IMPORTANT: Extraction logic is preserved:
 * - HEADER_HEIGHT_FRACTION = 0.20
 * - MIN_TEXT_CHARS = 10
 * - MAX_FULL_TEXT_CHARS = 500
 * - hasTextLayer threshold remains 0.6 (unchanged)
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

export interface PageHeader {
  /** 0-based page index */
  pageIndex: number;
  /** Text extracted from the top ~20% of the page */
  headerText: string;
  /** Full page text (first N chars) */
  fullText: string;
  /** Whether this page appeared to have meaningful text */
  hasText: boolean;
}

export interface PdfTextExtractionResult {
  /** Per-page header info, in page order */
  pageHeaders: PageHeader[];
  /** Total page count */
  totalPages: number;
  /** True if at least 60% of pages have meaningful text (i.e., not a scanned image PDF) */
  hasTextLayer: boolean;
  /** Fraction of pages with text */
  textLayerCoverage: number;
}

// =============================================================================
// Constants (unchanged)
// =============================================================================

/** Fraction of page height considered "header" */
const HEADER_HEIGHT_FRACTION = 0.20;
/** Minimum characters to consider a page as having a text layer */
const MIN_TEXT_CHARS = 10;
/** Maximum chars to capture from full page (for fallback analysis) */
const MAX_FULL_TEXT_CHARS = 500;

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function nowMs(): number {
   
  const perf = (globalThis as any)?.performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

async function destroyLoadingTask(loadingTask: unknown) {
  try {
     
    const task = loadingTask as any;
    if (task && typeof task.destroy === 'function') {
      await task.destroy();
    }
  } catch {
    // best-effort
  }
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Extract text from the top fraction of each page in a PDF.
 * For scanned (image) PDFs, headerText will be empty or minimal.
 *
 * @param pdfBuffer - Raw PDF bytes
 * @param maxPages  - Maximum number of pages to process (default: all pages)
 */
export async function extractPdfPageHeaders(
  pdfBuffer: Buffer,
  maxPages?: number
): Promise<PdfTextExtractionResult> {
  const start = nowMs();

  const pdfData = new Uint8Array(pdfBuffer);
   
  let loadingTask: any | undefined;
   
  let pdfDocument: any | undefined;

  try {
    loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableWorker: true,
    } as unknown as PdfGetDocumentParams);

    pdfDocument = await loadingTask.promise;

    const totalPages: number = pdfDocument.numPages;
    const pagesToProcess = maxPages ? Math.min(totalPages, maxPages) : totalPages;

    const pageHeaders: PageHeader[] = [];
    let pagesWithText = 0;

    for (let pageIndex = 0; pageIndex < pagesToProcess; pageIndex++) {
      const pageStart = nowMs();

      try {
        const page = await pdfDocument.getPage(pageIndex + 1); // pdfjs is 1-indexed
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;
        const headerCutoff = pageHeight * HEADER_HEIGHT_FRACTION;

        // Get text content
        const textContent = await page.getTextContent();

        let headerText = '';
        const allTextParts: string[] = [];

        for (const item of textContent.items) {
          if (!('str' in item)) continue;
          const textItem = item as { str: string; transform?: number[] };
          const text = textItem.str.trim();
          if (!text) continue;

          allTextParts.push(text);

          // Check if this item is in the header region
          // pdfjs transform[5] is the y coordinate (bottom of text in PDF coords)
          // PDF y-axis is inverted — larger y = higher on page
          if (textItem.transform) {
            const yPos = textItem.transform[5];
            // In PDF coords, top of page = pageHeight, y decreases downward
            const distFromTop = pageHeight - yPos;
            if (distFromTop <= pageHeight * HEADER_HEIGHT_FRACTION + 50) {
              // Include items within header region + small buffer
              headerText += text + ' ';
            }
          } else {
            // No transform data — include first text items as likely headers
            if (headerText.length < headerCutoff) {
              headerText += text + ' ';
            }
          }
        }

        const fullText = allTextParts.join(' ').slice(0, MAX_FULL_TEXT_CHARS);
        const hasText = fullText.length >= MIN_TEXT_CHARS;

        if (hasText) pagesWithText++;

        pageHeaders.push({
          pageIndex,
          headerText: headerText.trim(),
          fullText,
          hasText,
        });

        // Best-effort cleanup per page (pdfjs may expose cleanup())
        try {
          if (typeof page.cleanup === 'function') page.cleanup();
        } catch {
          // ignore
        }

        logger.debug('pdf-text-extractor: extracted page text', {
          pageIndex,
          hasText,
          headerChars: headerText.trim().length,
          fullTextChars: fullText.length,
          durationMs: Math.round(nowMs() - pageStart),
        });
      } catch (err) {
        const e = asError(err);
        logger.warn('pdf-text-extractor: failed to extract text from page', {
          pageIndex,
          errorMessage: e.message,
          errorName: e.name,
        });

        pageHeaders.push({
          pageIndex,
          headerText: '',
          fullText: '',
          hasText: false,
        });
      }
    }

    const textLayerCoverage = pagesToProcess > 0 ? pagesWithText / pagesToProcess : 0;
    const hasTextLayer = textLayerCoverage >= 0.6;

    logger.info('PDF text extraction complete', {
      totalPages,
      pagesToProcess,
      pagesWithText,
      textLayerCoverage: Math.round(textLayerCoverage * 100) + '%',
      hasTextLayer,
      durationMs: Math.round(nowMs() - start),
    });

    return {
      pageHeaders,
      totalPages,
      hasTextLayer,
      textLayerCoverage,
    };
  } catch (err) {
    const e = asError(err);
    logger.error('pdf-text-extractor: failed to load or process PDF', {
      errorMessage: e.message,
      errorName: e.name,
      errorStack: e.stack,
    });

    // Keep stable return shape
    return {
      pageHeaders: [],
      totalPages: 0,
      hasTextLayer: false,
      textLayerCoverage: 0,
    };
  } finally {
    try {
      if (pdfDocument && typeof pdfDocument.cleanup === 'function') {
        await pdfDocument.cleanup();
      }
    } catch {
      // ignore
    }
    await destroyLoadingTask(loadingTask);
  }
}