import { createRequire } from 'module';
import * as fs from 'fs';
import * as nodePath from 'path';
import { pathToFileURL } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { logger } from '@/lib/logger';

// Turbopack compatibility for server-side PDF rendering.
// Allocate an absolute file:// URL for the fake worker, avoiding dynamic
// import issues that cause preview 500s.
const PDFJS_DIR = resolvePdfJsDistDir();
const WORKER_FILE = nodePath.join(PDFJS_DIR, 'legacy', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(WORKER_FILE).href;

// ---------------------------------------------------------------------------
// Server-side (Node.js) pdfjs configuration.
//
// Using disableWorker: true in getDocument options to run PDF parsing
// synchronously on the main thread ("FakeWorker" / in-process mode)
// instead of spawning a web-worker. This is the correct mode for
// server-side rendering where neither a DOM nor a SharedArrayBuffer worker
// is available.
//
// Canvas backend: pdfjs-dist uses a Node-compatible canvas path under Node.js.
// This module uses @napi-rs/canvas consistently so canvas objects are not mixed.
//
// Notes:
// - This module intentionally avoids logging any PDF bytes or sensitive content.
// - Rendering failures are handled per-page in batch APIs with a placeholder,
//   keeping the output shape stable and resilient.
// ---------------------------------------------------------------------------

export interface RenderOptions {
  pageIndex?: number;
  quality?: number;
  maxWidth?: number;
  format?: 'png' | 'jpeg';
  /** DPI multiplier. Default 2 → ~192 DPI for sharp sheet music OCR */
  scale?: number;
  /** Optional cache tag (e.g. session-id) to enable cross-call render caching */
  cacheTag?: string;
}

export interface HeaderCropBatchOptions extends Omit<RenderOptions, 'pageIndex'> {
  cropHeightFraction?: number;
}

export interface PageImageWithInfo {
  imageBase64: string;
  totalPages: number;
  mimeType: string;
  effective: {
    scale: number;
    wasClamped: boolean;
    width: number;
    height: number;
  };
}

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

interface PdfJsViewportLike {
  width: number;
  height: number;
}

interface PdfJsRenderTaskLike {
  promise: Promise<unknown>;
}

interface PdfJsPageLike {
  getViewport(params: { scale: number }): PdfJsViewportLike;
  render(params: Record<string, unknown>): PdfJsRenderTaskLike;
  cleanup?: () => void | Promise<void>;
}

interface PdfJsDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPageLike>;
  cleanup?: () => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}

interface PdfJsLoadingTaskLike<TDocument> {
  promise: Promise<TDocument>;
  destroy?: () => void | Promise<void>;
  onPassword?: ((updatePassword: (password: string) => void, reason: number) => void) | null;
}

interface RenderedPagePng {
  rawPngBuffer: Buffer;
  totalPages: number;
  effective: {
    scale: number;
    wasClamped: boolean;
    width: number;
    height: number;
  };
}

interface CachedPageInfo {
  totalPages: number;
  mimeType: string;
  effective: {
    scale: number;
    wasClamped: boolean;
    width: number;
    height: number;
  };
}

// ---------------------------------------------------------------------------
// Node.js filesystem-backed CMap and standard font data factories.
//
// pdfjs-dist ships CMap tables (.bcmap) and standard font fallbacks in-package.
// Using filesystem-backed factories keeps rendering deterministic on the server
// and prevents garbled glyphs in CMap-heavy sheet music PDFs.
// ---------------------------------------------------------------------------

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

class NodeFsCMapReaderFactory {
  fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const bcmapPath = nodePath.join(CMAP_DIR, `${name}.bcmap`);
    const cmapPath = nodePath.join(CMAP_DIR, name);

    if (fs.existsSync(bcmapPath)) {
      const data = fs.readFileSync(bcmapPath);
      return Promise.resolve({ cMapData: new Uint8Array(data), isCompressed: true });
    }

    if (fs.existsSync(cmapPath)) {
      const data = fs.readFileSync(cmapPath);
      return Promise.resolve({ cMapData: new Uint8Array(data), isCompressed: false });
    }

    return Promise.reject(new Error(`CMap not found: ${name}`));
  }
}

class NodeFsStandardFontDataFactory {
  fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    const fontPath = nodePath.join(FONTS_DIR, filename);

    if (fs.existsSync(fontPath)) {
      const data = fs.readFileSync(fontPath);
      return Promise.resolve(new Uint8Array(data));
    }

    return Promise.reject(new Error(`Standard font not found: ${filename}`));
  }
}

/**
 * Maximum total canvas pixels we will allocate for a single page render.
 * Prevents OOM crashes for huge-format PDFs rendered at high scale.
 */
const MAX_CANVAS_PIXELS = 40_000_000;

/** Minimal 100×100 white PNG used as a placeholder for pages that fail to render */
const PLACEHOLDER_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// In-process render cache
//
// Keyed by `${cacheTag}:${pageIndex}:${scale}:${maxWidth}:${format}:${quality}`.
// The processor fills `cacheTag` with the session-id so different sessions
// never collide. Call `clearRenderCache(tag)` at the end of a pipeline run
// to free memory.
// ---------------------------------------------------------------------------

/** Cache key → base64 image string */
const renderCache = new Map<string, string>();

/** Cache key → metadata needed by renderPdfPageToImageWithInfo */
const renderInfoCache = new Map<string, CachedPageInfo>();

function cacheKey(
  tag: string,
  pageIndex: number,
  scale: number,
  maxWidth: number,
  format: string,
  quality: number,
  variant: string = 'full',
): string {
  return `${tag}:${pageIndex}:${scale}:${maxWidth}:${format}:${quality}:${variant}`;
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function safeErrorDetails(err: unknown) {
  const error = asError(err);
  return {
    errorMessage: error.message,
    errorName: error.name,
    errorStack: error.stack,
  };
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function normalizeFormat(format: RenderOptions['format']): 'png' | 'jpeg' {
  return format === 'jpeg' ? 'jpeg' : 'png';
}

function normalizeQuality(value: unknown, fallback: number): number {
  const normalized = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(100, Math.max(1, Math.round(normalized)));
}

function normalizeMaxWidth(value: unknown, fallback: number): number {
  const normalized = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.round(normalized));
}

function normalizeScale(value: unknown, fallback: number): number {
  const normalized = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(normalized)) return fallback;
  return normalized <= 0 ? fallback : normalized;
}

function normalizePageIndex(value: unknown, fallback = 0): number {
  const normalized = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(normalized)) return fallback;
  return Math.trunc(normalized);
}

function normalizeCropHeightFraction(value: unknown, fallback = 0.2): number {
  const normalized = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(0.8, Math.max(0.05, normalized));
}

/**
 * Create a placeholder image with an error message.
 * Returns a base64-encoded PNG showing the error text.
 */
function createPlaceholderImage(errorMessage: string, width: number): string {
  // Create a simple SVG with the error message
  const height = Math.round(width * 1.414); // A4 aspect ratio
  const truncatedMessage = errorMessage.length > 200 
    ? errorMessage.slice(0, 200) + '...' 
    : errorMessage;
  
  // Escape special XML characters
  const escapedMessage = truncatedMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Split message into lines (max 60 chars per line)
  const words = escapedMessage.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length > 60) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  // Limit to 8 lines
  const displayLines = lines.slice(0, 8);
  const lineHeight = Math.min(24, Math.max(16, Math.floor(height / 12)));
  const startY = Math.floor(height / 2) - (displayLines.length * lineHeight) / 2;
  
  const lineElements = displayLines.map((line, i) => 
    `<text x="${width / 2}" y="${startY + i * lineHeight}" font-size="${lineHeight}" fill="#666" text-anchor="middle" font-family="sans-serif">${line}</text>`
  ).join('');
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="none" stroke="#ddd" stroke-width="2" stroke-dasharray="10,5"/>
  <text x="${width / 2}" y="${Math.floor(height / 4)}" font-size="${Math.floor(lineHeight * 1.5)}" fill="#999" text-anchor="middle" font-family="sans-serif" font-weight="bold">Preview Unavailable</text>
  ${lineElements}
</svg>`;
  
  // Convert SVG to base64
  return Buffer.from(svg).toString('base64');
}

/**
 * Clear cached render results.
 * Call with a `tag` to clear only that session's entries,
 * or with no arguments to flush the entire cache.
 */
export function clearRenderCache(tag?: string): void {
  if (!tag) {
    renderCache.clear();
    renderInfoCache.clear();
    return;
  }

  const prefix = `${tag}:`;
  for (const key of renderCache.keys()) {
    if (key.startsWith(prefix)) {
      renderCache.delete(key);
    }
  }

  for (const key of renderInfoCache.keys()) {
    if (key.startsWith(prefix)) {
      renderInfoCache.delete(key);
    }
  }
}

async function openPdfDocument(pdfBuffer: Buffer): Promise<{
  loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike>;
  pdfDocument: PdfJsDocumentLike;
}> {
  const pdfData = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true,
    CMapReaderFactory: NodeFsCMapReaderFactory,
    StandardFontDataFactory: NodeFsStandardFontDataFactory,
    cMapPacked: true,
    useSystemFonts: false,
    isEvalSupported: false,
  } as unknown as PdfGetDocumentParams) as unknown as PdfJsLoadingTaskLike<PdfJsDocumentLike>;

  // Allow pdf.js to attempt opening restricted/encrypted PDFs with an empty password.
  loadingTask.onPassword = (updatePassword) => {
    updatePassword('');
  };

  const pdfDocument = await loadingTask.promise;
  return { loadingTask, pdfDocument };
}

async function cleanupPdfDocument(
  loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined,
  pdfDocument: PdfJsDocumentLike | undefined,
) {
  try {
    if (pdfDocument && typeof pdfDocument.cleanup === 'function') {
      await pdfDocument.cleanup();
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

  try {
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      await pdfDocument.destroy();
    }
  } catch {
    // best-effort cleanup only
  }
}

async function cleanupPdfPage(page: PdfJsPageLike | undefined) {
  try {
    if (page && typeof page.cleanup === 'function') {
      await page.cleanup();
    }
  } catch {
    // best-effort cleanup only
  }
}

/**
 * Compute a pdfjs viewport for a page at the requested scale, clamped so that
 * the resulting canvas stays under MAX_CANVAS_PIXELS.
 */
function computeClampedViewport(
  page: PdfJsPageLike,
  scale: number,
): { viewport: PdfJsViewportLike; wasClamped: boolean; effectiveScale: number } {
  const viewport = page.getViewport({ scale });
  const rawWidth = Math.floor(viewport.width);
  const rawHeight = Math.floor(viewport.height);

  if (rawWidth * rawHeight <= MAX_CANVAS_PIXELS) {
    return { viewport, wasClamped: false, effectiveScale: scale };
  }

  const shrink = Math.sqrt(MAX_CANVAS_PIXELS / (rawWidth * rawHeight));
  const effectiveScale = scale * shrink;

  return {
    viewport: page.getViewport({ scale: effectiveScale }),
    wasClamped: true,
    effectiveScale,
  };
}

async function renderPageToRawPng(
  pdfDocument: PdfJsDocumentLike,
  pageIndex: number,
  requestedScale: number,
  logContext: string,
): Promise<RenderedPagePng> {
  const totalPages = pdfDocument.numPages;

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(
      `Page index ${pageIndex} out of range. PDF has ${totalPages} page(s) (0-${totalPages - 1}).`,
    );
  }

  let page: PdfJsPageLike | undefined;

  try {
    page = await pdfDocument.getPage(pageIndex + 1);
    const { viewport, wasClamped, effectiveScale } = computeClampedViewport(page, requestedScale);

    const canvasWidth = Math.floor(viewport.width);
    const canvasHeight = Math.floor(viewport.height);

    if (wasClamped) {
      logger.warn(`${logContext}: scale clamped to avoid OOM`, {
        pageIndex,
        requestedScale,
        effectiveScale,
        canvasWidth,
        canvasHeight,
      });
    }

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    const rawPngBuffer = canvas.toBuffer('image/png');

    return {
      rawPngBuffer,
      totalPages,
      effective: {
        scale: effectiveScale,
        wasClamped,
        width: canvasWidth,
        height: canvasHeight,
      },
    };
  } finally {
    await cleanupPdfPage(page);
  }
}

async function encodeRenderedImage(
  rawPngBuffer: Buffer,
  options: {
    canvasWidth: number;
    format: 'png' | 'jpeg';
    maxWidth: number;
    quality: number;
    jpeg444?: boolean;
  },
): Promise<Buffer> {
  const { canvasWidth, format, maxWidth, quality, jpeg444 = false } = options;

  if (canvasWidth > maxWidth) {
    const resized = sharp(rawPngBuffer).resize({ width: maxWidth, fit: 'inside' });

    if (format === 'jpeg') {
      return resized
        .toFormat('jpeg', jpeg444
          ? { quality, chromaSubsampling: '4:4:4', mozjpeg: true }
          : { quality })
        .toBuffer();
    }

    return resized.toBuffer();
  }

  if (format === 'jpeg') {
    return sharp(rawPngBuffer)
      .toFormat('jpeg', jpeg444
        ? { quality, chromaSubsampling: '4:4:4', mozjpeg: true }
        : { quality })
      .toBuffer();
  }

  return rawPngBuffer;
}

async function extractHeaderCrop(
  rawPngBuffer: Buffer,
  options: {
    cropHeightFraction: number;
    format: 'png' | 'jpeg';
    maxWidth: number;
    quality: number;
  },
): Promise<Buffer> {
  const { cropHeightFraction, format, maxWidth, quality } = options;

  const metadata = await sharp(rawPngBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    throw new Error('Unable to determine rendered image dimensions for header crop');
  }

  const cropHeight = Math.max(1, Math.floor(height * cropHeightFraction));

  let headerBuffer = await sharp(rawPngBuffer)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .toBuffer();

  if (width > maxWidth) {
    headerBuffer = await sharp(headerBuffer)
      .resize({ width: maxWidth, fit: 'inside' })
      .toFormat(format, { quality })
      .toBuffer();
  } else if (format === 'jpeg') {
    headerBuffer = await sharp(headerBuffer)
      .toFormat('jpeg', { quality })
      .toBuffer();
  }

  return headerBuffer;
}

/**
 * Render a single PDF page to a base64 encoded image string.
 */
export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: RenderOptions = {},
): Promise<string> {
  const {
    pageIndex = 0,
    quality = 85,
    maxWidth = 1024,
    format = 'png',
    scale = 2,
  } = options;

  const idx = normalizePageIndex(pageIndex, 0);
  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 85);
  const mw = normalizeMaxWidth(maxWidth, 1024);
  const sc = normalizeScale(scale, 2);

  const start = nowMs();
  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const rendered = await renderPageToRawPng(pdfDocument, idx, sc, 'pdf-renderer');
    const imageBuffer = await encodeRenderedImage(rendered.rawPngBuffer, {
      canvasWidth: rendered.effective.width,
      format: fmt,
      maxWidth: mw,
      quality: q,
    });

    logger.debug('Rendered PDF page to image', {
      pageIndex: idx,
      format: fmt,
      scale: sc,
      effectiveScale: rendered.effective.scale,
      maxWidth: mw,
      quality: q,
      durationMs: Math.round(nowMs() - start),
      canvasWidth: rendered.effective.width,
      canvasHeight: rendered.effective.height,
    });

    return imageBuffer.toString('base64');
  } catch (error) {
    logger.error('Failed to render PDF to image', {
      ...safeErrorDetails(error),
      pageIndex: idx,
      format: fmt,
      scale: sc,
      maxWidth: mw,
      quality: q,
    });
    throw asError(error);
  } finally {
    await cleanupPdfDocument(loadingTask, pdfDocument);
  }
}

/**
 * Render multiple PDF pages in one call, reusing a single parsed pdfjs document.
 * Much faster than calling renderPdfToImage() N times for large documents.
 *
 * @param pdfBuffer   - Raw PDF bytes
 * @param pageIndices - 0-based page indices to render
 * @param options     - Shared render options (pageIndex is ignored here)
 * @returns Base64-encoded images in the same order as pageIndices
 */
export async function renderPdfPageBatch(
  pdfBuffer: Buffer,
  pageIndices: number[],
  options: Omit<RenderOptions, 'pageIndex'> = {},
): Promise<string[]> {
  const { scale = 2, maxWidth = 1024, quality = 85, format = 'png', cacheTag } = options;

  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 85);
  const mw = normalizeMaxWidth(maxWidth, 1024);
  const sc = normalizeScale(scale, 2);

  if (pageIndices.length === 0) {
    return [];
  }

  const start = nowMs();

  if (cacheTag) {
    const allCached: string[] = [];
    let miss = false;

    for (const idxRaw of pageIndices) {
      const idx = normalizePageIndex(idxRaw, -1);
      const key = cacheKey(cacheTag, idx, sc, mw, fmt, q, 'full');
      const cached = renderCache.get(key);

      if (cached) {
        allCached.push(cached);
      } else {
        miss = true;
        break;
      }
    }

    if (!miss) {
      logger.debug('renderPdfPageBatch: served entirely from cache', {
        cacheTag,
        count: allCached.length,
      });
      return allCached;
    }
  }

  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const numPages = pdfDocument.numPages;
    const results: string[] = [];

    for (const idxRaw of pageIndices) {
      const idx = normalizePageIndex(idxRaw, -1);

      if (idx < 0 || idx >= numPages) {
        logger.warn('renderPdfPageBatch: page index out of bounds; using placeholder', {
          idx: idxRaw,
          normalizedIdx: idx,
          numPages,
        });
        results.push(PLACEHOLDER_IMAGE);
        continue;
      }

      if (cacheTag) {
        const key = cacheKey(cacheTag, idx, sc, mw, fmt, q, 'full');
        const cached = renderCache.get(key);
        if (cached) {
          results.push(cached);
          continue;
        }
      }

      try {
        const pageStart = nowMs();
        const rendered = await renderPageToRawPng(pdfDocument, idx, sc, 'renderPdfPageBatch');
        const imageBuffer = await encodeRenderedImage(rendered.rawPngBuffer, {
          canvasWidth: rendered.effective.width,
          format: fmt,
          maxWidth: mw,
          quality: q,
        });

        const imageBase64 = imageBuffer.toString('base64');

        if (cacheTag) {
          renderCache.set(cacheKey(cacheTag, idx, sc, mw, fmt, q, 'full'), imageBase64);
        }

        results.push(imageBase64);

        logger.debug('renderPdfPageBatch: rendered page', {
          idx,
          durationMs: Math.round(nowMs() - pageStart),
          canvasWidth: rendered.effective.width,
          canvasHeight: rendered.effective.height,
          format: fmt,
          scale: sc,
          maxWidth: mw,
          quality: q,
        });
      } catch (error) {
        logger.warn('renderPdfPageBatch: failed to render page; using placeholder', {
          idx,
          ...safeErrorDetails(error),
        });
        results.push(PLACEHOLDER_IMAGE);
      }
    }

    logger.info('renderPdfPageBatch: completed', {
      requestedCount: pageIndices.length,
      returnedCount: results.length,
      durationMs: Math.round(nowMs() - start),
      format: fmt,
      scale: sc,
      maxWidth: mw,
      quality: q,
    });

    return results;
  } finally {
    await cleanupPdfDocument(loadingTask, pdfDocument);
  }
}

/**
 * Render top-of-page header crops in batch for scanned/image PDFs.
 *
 * Returns base64 images ordered to match `pageIndices`.
 */
export async function renderPdfHeaderCropBatch(
  pdfBuffer: Buffer,
  pageIndices: number[],
  options: HeaderCropBatchOptions = {},
): Promise<string[]> {
  const {
    scale = 2,
    maxWidth = 1024,
    quality = 85,
    format = 'png',
    cropHeightFraction = 0.2,
    cacheTag,
  } = options;

  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 85);
  const mw = normalizeMaxWidth(maxWidth, 1024);
  const sc = normalizeScale(scale, 2);
  const safeCropHeightFraction = normalizeCropHeightFraction(cropHeightFraction, 0.2);
  const variant = `header-${safeCropHeightFraction}`;

  if (pageIndices.length === 0) {
    return [];
  }

  const start = nowMs();
  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const numPages = pdfDocument.numPages;
    const results: string[] = [];

    for (const idxRaw of pageIndices) {
      const idx = normalizePageIndex(idxRaw, -1);

      if (idx < 0 || idx >= numPages) {
        logger.warn('renderPdfHeaderCropBatch: page index out of bounds; using placeholder', {
          idx: idxRaw,
          normalizedIdx: idx,
          numPages,
        });
        results.push(PLACEHOLDER_IMAGE);
        continue;
      }

      if (cacheTag) {
        const key = cacheKey(cacheTag, idx, sc, mw, fmt, q, variant);
        const cached = renderCache.get(key);
        if (cached) {
          results.push(cached);
          continue;
        }
      }

      try {
        const pageStart = nowMs();
        const rendered = await renderPageToRawPng(pdfDocument, idx, sc, 'renderPdfHeaderCropBatch');
        const headerBuffer = await extractHeaderCrop(rendered.rawPngBuffer, {
          cropHeightFraction: safeCropHeightFraction,
          format: fmt,
          maxWidth: mw,
          quality: q,
        });

        const headerBase64 = headerBuffer.toString('base64');

        if (cacheTag) {
          renderCache.set(cacheKey(cacheTag, idx, sc, mw, fmt, q, variant), headerBase64);
        }

        results.push(headerBase64);

        logger.debug('renderPdfHeaderCropBatch: rendered header crop', {
          idx,
          durationMs: Math.round(nowMs() - pageStart),
          pageWidth: rendered.effective.width,
          pageHeight: rendered.effective.height,
          cropHeightFraction: safeCropHeightFraction,
          format: fmt,
          scale: sc,
          maxWidth: mw,
          quality: q,
        });
      } catch (error) {
        logger.warn('renderPdfHeaderCropBatch: failed to render header crop; using placeholder', {
          idx,
          ...safeErrorDetails(error),
        });
        results.push(PLACEHOLDER_IMAGE);
      }
    }

    logger.info('renderPdfHeaderCropBatch: completed', {
      requestedCount: pageIndices.length,
      returnedCount: results.length,
      durationMs: Math.round(nowMs() - start),
      cropHeightFraction: safeCropHeightFraction,
      format: fmt,
      scale: sc,
      maxWidth: mw,
      quality: q,
    });

    return results;
  } finally {
    await cleanupPdfDocument(loadingTask, pdfDocument);
  }
}

// ---------------------------------------------------------------------------
// renderPdfPageToImageWithInfo
//
// Single-page render that returns the image base64, MIME type, total page
// count, and effective render dimensions — all from a single pdfjs document
// open. This eliminates the double-parse that was required when callers used
// separate libraries for page-count and rendering.
//
// Supports the same in-process render cache as renderPdfPageBatch.
// ---------------------------------------------------------------------------

/**
 * Render a single PDF page and return image data together with total page
 * count so callers never need to open the PDF twice.
 *
 * Sheet-music safe JPEG options (4:4:4 chroma + mozjpeg) are automatically
 * applied when format='jpeg' to minimise line-art artefacts.
 */
export async function renderPdfPageToImageWithInfo(
  pdfBuffer: Buffer,
  options: RenderOptions = {},
): Promise<PageImageWithInfo> {
  const {
    pageIndex = 0,
    quality = 92,
    maxWidth = 2000,
    format = 'png',
    scale = 3,
    cacheTag,
  } = options;

  const idx = normalizePageIndex(pageIndex, 0);
  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 92);
  const mw = normalizeMaxWidth(maxWidth, 2000);
  const sc = normalizeScale(scale, 3);
  const mimeType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
  const key = cacheTag ? cacheKey(cacheTag, idx, sc, mw, fmt, q, 'full') : null;

  const start = nowMs();
  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    if (key) {
      const cachedImage = renderCache.get(key);
      const cachedInfo = renderInfoCache.get(key);

      if (cachedImage && cachedInfo) {
        logger.debug('renderPdfPageToImageWithInfo: serving from cache', {
          cacheTag,
          pageIndex: idx,
        });

        return {
          imageBase64: cachedImage,
          totalPages: cachedInfo.totalPages,
          mimeType: cachedInfo.mimeType,
          effective: cachedInfo.effective,
        };
      }
    }

    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const rendered = await renderPageToRawPng(pdfDocument, idx, sc, 'renderPdfPageToImageWithInfo');
    const imageBuffer = await encodeRenderedImage(rendered.rawPngBuffer, {
      canvasWidth: rendered.effective.width,
      format: fmt,
      maxWidth: mw,
      quality: q,
      jpeg444: true,
    });

    const imageBase64 = imageBuffer.toString('base64');

    if (key) {
      renderCache.set(key, imageBase64);
      renderInfoCache.set(key, {
        totalPages: rendered.totalPages,
        mimeType,
        effective: rendered.effective,
      });
    }

    logger.debug('renderPdfPageToImageWithInfo: completed', {
      pageIndex: idx,
      totalPages: rendered.totalPages,
      format: fmt,
      scale: sc,
      effectiveScale: rendered.effective.scale,
      maxWidth: mw,
      quality: q,
      wasClamped: rendered.effective.wasClamped,
      durationMs: Math.round(nowMs() - start),
      canvasWidth: rendered.effective.width,
      canvasHeight: rendered.effective.height,
    });

    return {
      imageBase64,
      totalPages: rendered.totalPages,
      mimeType,
      effective: rendered.effective,
    };
  } catch (error) {
    logger.error('renderPdfPageToImageWithInfo: failed, returning placeholder', {
      ...safeErrorDetails(error),
      pageIndex: idx,
      format: fmt,
      scale: sc,
      maxWidth: mw,
      quality: q,
    });
    
    // Return a placeholder image instead of throwing
    // This ensures the admin UI can still display something
    const errorMessage = error instanceof Error ? error.message : 'Render failed';
    const placeholderBase64 = createPlaceholderImage(errorMessage, mw);
    
    return {
      imageBase64: placeholderBase64,
      totalPages: 0,
      mimeType: 'image/png',
      effective: {
        width: mw,
        height: Math.round(mw * 1.414), // A4 aspect ratio
        scale: sc,
        wasClamped: false,
      },
      error: errorMessage,
    };
  } finally {
    await cleanupPdfDocument(loadingTask, pdfDocument);
  }
}