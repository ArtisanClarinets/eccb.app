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
 * - Best-effort cleanup of pdfjs loadingTask / document / pages
 * - Structured logs with performance metrics
 *
 * IMPORTANT: Extraction logic is preserved:
 * - HEADER_HEIGHT_FRACTION = 0.20
 * - MIN_TEXT_CHARS = 10
 * - MAX_FULL_TEXT_CHARS = 500
 * - hasTextLayer threshold remains 0.6 (unchanged)
 *
 * Notes:
 * - This file intentionally stays API-compatible with current callers.
 * - Additional result fields are additive only.
 * - It remains Node/server-only due to fs + pdfjs asset loading.
 */

import { createRequire } from 'module';
import * as fs from 'fs';
import * as nodePath from 'path';
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
  /** Total page count from the PDF document */
  totalPages: number;
  /** True if at least 60% of processed pages have meaningful text */
  hasTextLayer: boolean;
  /** Fraction of processed pages with text */
  textLayerCoverage: number;

  // Additive diagnostics — safe for existing callers to ignore
  /** Number of pages actually processed (important when early-stop is used) */
  processedPages?: number;
  /** Number of processed pages that had meaningful text */
  pagesWithText?: number;
  /** True if any processed page had meaningful text */
  hasAnyText?: boolean;
  /** Conservative signal for downstream fallback policy */
  ocrRecommended?: boolean;
}

/** Options for PDF text extraction */
export interface PdfTextExtractionOptions {
  /** Maximum pages to process (default: all pages) */
  maxPages?: number;
  /** Early stop if meaningful text is found on this many consecutive pages (default: 0 = process all) */
  earlyStopConsecutivePages?: number;
  /** Minimum chars to consider as "meaningful" for early-stop (default: MIN_TEXT_CHARS = 10) */
  minMeaningfulChars?: number;
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
/** Strong text-layer threshold (unchanged semantics) */
const TEXT_LAYER_THRESHOLD = 0.6;

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

// =============================================================================
// Minimal pdfjs runtime types
// =============================================================================

interface PdfJsTextItemLike {
  str?: string;
  transform?: number[];
}

interface PdfJsTextContentLike {
  items: ReadonlyArray<unknown>;
}

interface PdfJsViewportLike {
  height: number;
}

interface PdfJsPageLike {
  getViewport(params: { scale: number }): PdfJsViewportLike;
  getTextContent(): Promise<PdfJsTextContentLike>;
  cleanup?(): void | Promise<void>;
}

interface PdfJsDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPageLike>;
  cleanup?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

interface PdfJsLoadingTaskLike<TDocument> {
  promise: Promise<TDocument>;
  destroy?(): void | Promise<void>;
  onPassword?: unknown;
}

// =============================================================================
// pdfjs asset resolution
// =============================================================================

// Resolve pdfjs-dist robustly from the installed package location first.
// Fall back to process.cwd()-relative node_modules to preserve current behavior.
const require = createRequire(import.meta.url);

function resolvePdfJsDistDir(): string {
  try {
    const pdfJsEntry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    return nodePath.resolve(nodePath.dirname(pdfJsEntry), '..', '..');
  } catch {
    return nodePath.join(process.cwd(), 'node_modules', 'pdfjs-dist');
  }
}

const PDFJS_DIST_DIR = resolvePdfJsDistDir();
const CMAP_DIR = nodePath.join(PDFJS_DIST_DIR, 'cmaps');
const FONTS_DIR = nodePath.join(PDFJS_DIST_DIR, 'standard_fonts');

// ---------------------------------------------------------------------------
// Node.js filesystem-backed CMap and standard font data factories.
// Mirrors the same behavior needed in pdf-renderer.ts.
// Without these, pdfjs falls back to DOM-based font loading which fails on
// the server and produces garbled glyphs in CIDFont sheet-music PDFs.
// ---------------------------------------------------------------------------
class NodeFsCMapReaderFactory {
  fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const bcmapPath = nodePath.join(CMAP_DIR, `${name}.bcmap`);
    const cmapPath = nodePath.join(CMAP_DIR, name);

    if (fs.existsSync(bcmapPath)) {
      return Promise.resolve({
        cMapData: new Uint8Array(fs.readFileSync(bcmapPath)),
        isCompressed: true,
      });
    }

    if (fs.existsSync(cmapPath)) {
      return Promise.resolve({
        cMapData: new Uint8Array(fs.readFileSync(cmapPath)),
        isCompressed: false,
      });
    }

    return Promise.reject(new Error(`CMap not found: ${name}`));
  }
}

class NodeFsStandardFontDataFactory {
  fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    const fontPath = nodePath.join(FONTS_DIR, filename);

    if (fs.existsSync(fontPath)) {
      return Promise.resolve(new Uint8Array(fs.readFileSync(fontPath)));
    }

    return Promise.reject(new Error(`Standard font not found: ${filename}`));
  }
}

// =============================================================================
// Utilities
// =============================================================================

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function buildEmptyResult(
  overrides: Partial<PdfTextExtractionResult> = {}
): PdfTextExtractionResult {
  return {
    pageHeaders: [],
    totalPages: 0,
    hasTextLayer: false,
    textLayerCoverage: 0,
    processedPages: 0,
    pagesWithText: 0,
    hasAnyText: false,
    ocrRecommended: true,
    ...overrides,
  };
}

function isTextContentItem(item: unknown): item is PdfJsTextItemLike {
  return !!item && typeof item === 'object' && 'str' in item;
}

/**
 * Normalize text extracted from PDF to remove control characters and collapse whitespace.
 * This is intentionally conservative so downstream parsing behavior stays stable.
 */
export function normalizePdfText(text: string): string {
  if (!text) return '';

  const withoutControlChars = Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    const isControlChar = (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    return isControlChar ? ' ' : char;
  }).join('');

  return withoutControlChars
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function extractHeaderTextFromItems(items: ReadonlyArray<unknown>, pageHeight: number): string {
  let headerText = '';

  for (const item of items) {
    if (!isTextContentItem(item) || typeof item.str !== 'string') continue;

    const text = item.str.trim();
    if (!text) continue;

    // Primary path: use transform[5] y-coordinate to determine whether the text
    // appears in the header band near the top of the page.
    if (Array.isArray(item.transform) && typeof item.transform[5] === 'number') {
      const yPos = item.transform[5];
      const distFromTop = pageHeight - yPos;

      // Preserve existing effective header region behavior (+50 slack)
      if (distFromTop <= pageHeight * HEADER_HEIGHT_FRACTION + 50) {
        headerText += `${text} `;
      }
      continue;
    }

    // Fallback path when transform is absent.
    // Keep previous heuristic behavior for compatibility.
    if (headerText.length < pageHeight * HEADER_HEIGHT_FRACTION) {
      headerText += `${text} `;
    }
  }

  return headerText;
}

function extractFullTextFromItems(items: ReadonlyArray<unknown>): string {
  const allTextParts: string[] = [];

  for (const item of items) {
    if (!isTextContentItem(item) || typeof item.str !== 'string') continue;

    const text = item.str.trim();
    if (!text) continue;

    allTextParts.push(text);
  }

  return allTextParts.join(' ').slice(0, MAX_FULL_TEXT_CHARS);
}

function createLoadingTask(pdfBuffer: Buffer): PdfJsLoadingTaskLike<PdfJsDocumentLike> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    // Supply filesystem-backed factories so pdfjs can decode CIDFonts and
    // standard font fallbacks without DOM or network access. Without these,
    // sheet music PDFs with CMap-encoded notation fonts produce garbled text.
    CMapReaderFactory: NodeFsCMapReaderFactory,
    StandardFontDataFactory: NodeFsStandardFontDataFactory,
    cMapPacked: true,
    useSystemFonts: false,
    isEvalSupported: false,
  } as unknown as PdfGetDocumentParams) as unknown as PdfJsLoadingTaskLike<PdfJsDocumentLike>;

  // Mirror pdf-renderer.ts behavior: attempt empty-password access for encrypted PDFs
  // that are viewable but protected by usage restrictions.
  if (loadingTask && typeof loadingTask === 'object' && 'onPassword' in loadingTask) {
    (
      loadingTask as {
        onPassword?: (updatePassword: (password: string) => void, reason: number) => void;
      }
    ).onPassword = (updatePassword) => {
      updatePassword('');
    };
  }

  return loadingTask;
}

async function cleanupPdfPage(page: PdfJsPageLike | undefined): Promise<void> {
  if (!page || typeof page.cleanup !== 'function') return;

  try {
    await page.cleanup();
  } catch {
    // best-effort cleanup only
  }
}

async function cleanupPdfResources(
  pdfDocument: PdfJsDocumentLike | undefined,
  loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined
): Promise<void> {
  try {
    if (pdfDocument && typeof pdfDocument.cleanup === 'function') {
      await pdfDocument.cleanup();
    }
  } catch {
    // best-effort cleanup only
  }

  try {
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      await pdfDocument.destroy();
    }
  } catch {
    // best-effort cleanup only
  }

  try {
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      await loadingTask.destroy();
    }
  } catch {
    // best-effort cleanup only
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
 * @param options - Extraction options including maxPages and early-stop
 */
export async function extractPdfPageHeaders(
  pdfBuffer: Buffer,
  options?: PdfTextExtractionOptions
): Promise<PdfTextExtractionResult> {
  const startMs = nowMs();

  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    logger.warn('pdf-text-extractor: received empty or invalid PDF buffer', {
      bufferType: Buffer.isBuffer(pdfBuffer) ? 'buffer' : typeof pdfBuffer,
      sizeBytes: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : 0,
    });

    return buildEmptyResult();
  }

  const normalizedMaxPages = normalizePositiveInteger(options?.maxPages);
  const normalizedEarlyStop = normalizePositiveInteger(options?.earlyStopConsecutivePages) ?? 0;
  const normalizedMinMeaningfulChars =
    normalizePositiveInteger(options?.minMeaningfulChars) ?? MIN_TEXT_CHARS;

  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    loadingTask = createLoadingTask(pdfBuffer);
    pdfDocument = await loadingTask.promise;

    const totalPages = normalizePositiveInteger(pdfDocument.numPages) ?? 0;
    const pagesToProcess = normalizedMaxPages
      ? Math.min(totalPages, normalizedMaxPages)
      : totalPages;

    if (pagesToProcess <= 0) {
      logger.warn('pdf-text-extractor: PDF contains no readable pages', {
        totalPages,
        requestedMaxPages: normalizedMaxPages,
      });

      return buildEmptyResult({ totalPages });
    }

    const pageHeaders: PageHeader[] = [];
    let pagesWithText = 0;
    let consecutiveTextPages = 0;
    let earlyStopped = false;

    for (let pageIndex = 0; pageIndex < pagesToProcess; pageIndex += 1) {
      // Early stop check: if we have enough consecutive pages with meaningful text
      if (normalizedEarlyStop > 0 && consecutiveTextPages >= normalizedEarlyStop) {
        earlyStopped = true;

        logger.info('pdf-text-extractor: early stop triggered', {
          pageIndex,
          consecutiveTextPages,
          earlyStopThreshold: normalizedEarlyStop,
          pagesProcessed: pageHeaders.length,
          requestedPages: pagesToProcess,
          totalPages,
        });

        break;
      }

      const pageStartMs = nowMs();
      let page: PdfJsPageLike | undefined;

      try {
        page = await pdfDocument.getPage(pageIndex + 1); // pdfjs is 1-indexed
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = typeof viewport?.height === 'number' ? viewport.height : 0;

        const textContent = await page.getTextContent();

        const normalizedFullText = normalizePdfText(
          extractFullTextFromItems(textContent.items)
        );
        const normalizedHeaderText = normalizePdfText(
          extractHeaderTextFromItems(textContent.items, pageHeight)
        );
        const hasText = normalizedFullText.length >= normalizedMinMeaningfulChars;

        if (hasText) {
          pagesWithText += 1;
          consecutiveTextPages += 1;
        } else {
          consecutiveTextPages = 0;
        }

        pageHeaders.push({
          pageIndex,
          headerText: normalizedHeaderText,
          fullText: normalizedFullText,
          hasText,
        });

        logger.debug('pdf-text-extractor: extracted page text', {
          pageIndex,
          hasText,
          headerChars: normalizedHeaderText.length,
          fullTextChars: normalizedFullText.length,
          durationMs: Math.round(nowMs() - pageStartMs),
        });
      } catch (err) {
        const error = asError(err);

        // Keep return shape stable and reset the early-stop streak
        consecutiveTextPages = 0;
        pageHeaders.push({
          pageIndex,
          headerText: '',
          fullText: '',
          hasText: false,
        });

        logger.warn('pdf-text-extractor: failed to extract text from page', {
          pageIndex,
          errorMessage: error.message,
          errorName: error.name,
        });
      } finally {
        await cleanupPdfPage(page);
      }
    }

    const processedPages = pageHeaders.length;

    // IMPORTANT:
    // Coverage must be computed over pages actually processed, not the originally
    // requested probe count. Otherwise early-stop under-reports coverage and can
    // incorrectly force OCR/LLM fallback downstream.
    const textLayerCoverage = processedPages > 0 ? pagesWithText / processedPages : 0;
    const hasTextLayer = textLayerCoverage >= TEXT_LAYER_THRESHOLD;
    const hasAnyText = pagesWithText > 0;

    logger.info('PDF text extraction complete', {
      totalPages,
      requestedPages: pagesToProcess,
      processedPages,
      pagesWithText,
      textLayerCoverage: `${Math.round(textLayerCoverage * 100)}%`,
      hasAnyText,
      hasTextLayer,
      ocrRecommended: !hasTextLayer,
      earlyStopped,
      earlyStopConsecutivePages: normalizedEarlyStop,
      durationMs: Math.round(nowMs() - startMs),
    });

    return {
      pageHeaders,
      totalPages,
      hasTextLayer,
      textLayerCoverage,
      processedPages,
      pagesWithText,
      hasAnyText,
      ocrRecommended: !hasTextLayer,
    };
  } catch (err) {
    const error = asError(err);

    logger.error('pdf-text-extractor: failed to load or process PDF', error, {
      durationMs: Math.round(nowMs() - startMs),
    });

    // Keep stable return shape
    return buildEmptyResult();
  } finally {
    await cleanupPdfResources(pdfDocument, loadingTask);
  }
}
