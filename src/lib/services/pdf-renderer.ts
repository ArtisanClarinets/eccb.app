import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Server-side (Node.js) pdfjs configuration.
//
// Using disableWorker: true in getDocument options to run PDF parsing
// synchronously on the main thread ("FakeWorker" / in-process mode)
// instead of spawning a web-worker. This is the correct mode for
// server-side rendering where neither a DOM nor a SharedArrayBuffer worker
// is available (pdfjs-dist v5 compatibility).
//
// Canvas backend: pdfjs-dist v5 ships a built-in NodeCanvasFactory that
// uses @napi-rs/canvas automatically when running under Node.js. We use
// the same package for all canvas operations in this module so that the
// objects passed between our code and pdfjs's internal rendering pipeline
// are the same types — avoiding the "Image or Canvas expected" TypeError
// that occurs when mixing node-canvas (canvas) and @napi-rs/canvas objects.
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

// Minimal 100×100 white PNG used as a placeholder for pages that fail to render
const PLACEHOLDER_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function safeErrorDetails(err: unknown) {
  const e = asError(err);
  return {
    errorMessage: e.message,
    errorName: e.name,
    // Keep stack for server logs; do not include any PDF data.
    errorStack: e.stack,
  };
}

function nowMs(): number {
  // High-resolution timing where available
   
  const perf = (globalThis as any)?.performance;
  if (perf?.now) return perf.now();
  return Date.now();
}


async function openPdfDocument(pdfBuffer: Buffer) {
  // pdfjs-dist requires Uint8Array, not Buffer
  const pdfData = new Uint8Array(pdfBuffer);

  // pdfjs-dist v5 automatically selects its built-in NodeCanvasFactory
  // (backed by @napi-rs/canvas) when running in Node.js. Do not pass a
  // custom canvasFactory — mixing canvas package types causes
  // "Image or Canvas expected" errors in ctx.drawImage() calls.
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true,
  } as unknown as PdfGetDocumentParams);

  const pdfDocument = await loadingTask.promise;

  return { loadingTask, pdfDocument };
}

async function cleanupPdfDocument(
   
  loadingTask: any,
   
  pdfDocument: any
) {
  // pdfjs APIs differ slightly across versions; guard calls defensively.
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

function normalizeFormat(format: RenderOptions['format']): 'png' | 'jpeg' {
  return format === 'jpeg' ? 'jpeg' : 'png';
}

function normalizeQuality(q: unknown, fallback: number): number {
  const n = typeof q === 'number' ? q : fallback;
  if (!Number.isFinite(n)) return fallback;
  // Keep behavior stable; clamp only to avoid invalid encoder states.
  return Math.min(100, Math.max(1, Math.round(n)));
}

function normalizeMaxWidth(w: unknown, fallback: number): number {
  const n = typeof w === 'number' ? w : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

function normalizeScale(s: unknown, fallback: number): number {
  const n = typeof s === 'number' ? s : fallback;
  if (!Number.isFinite(n)) return fallback;
  // Prevent invalid viewport scale. Avoid aggressive clamping to preserve output.
  return n <= 0 ? fallback : n;
}

// ---------------------------------------------------------------------------
// In-process render cache
//
// Keyed by `${cacheTag}:${pageIndex}:${scale}:${maxWidth}:${format}:${quality}`.
// The processor fills `cacheTag` with the session-id so different sessions
// never collide.  Call `clearRenderCache(tag)` at the end of a pipeline run
// to free memory.
// ---------------------------------------------------------------------------

/** Cache key → base64 image string */
const renderCache = new Map<string, string>();

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

/**
 * Clear cached render results.
 * Call with a `tag` to clear only that session's entries,
 * or with no arguments to flush the entire cache.
 */
export function clearRenderCache(tag?: string): void {
  if (!tag) {
    renderCache.clear();
    return;
  }
  const prefix = `${tag}:`;
  for (const key of renderCache.keys()) {
    if (key.startsWith(prefix)) {
      renderCache.delete(key);
    }
  }
}

/**
 * Render a single PDF page to a base64 encoded image string.
 */
export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: RenderOptions = {}
): Promise<string> {
  const {
    pageIndex = 0,
    quality = 85,
    maxWidth = 1024,
    format = 'png',
    scale = 2,
  } = options;

  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 85);
  const mw = normalizeMaxWidth(maxWidth, 1024);
  const sc = normalizeScale(scale, 2);

  const start = nowMs();

   
  let loadingTask: any | undefined;
   
  let pdfDocument: any | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const numPages: number = pdfDocument.numPages;
    if (pageIndex < 0 || pageIndex >= numPages) {
      throw new Error(
        `Page index ${pageIndex} out of range. PDF has ${numPages} page(s) (0-${numPages - 1}).`
      );
    }

    const page = await pdfDocument.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: sc });

    const canvasWidth = Math.floor(viewport.width);
    const canvasHeight = Math.floor(viewport.height);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    // Release page resources where supported (best-effort)
    try {
      if (typeof page.cleanup === 'function') page.cleanup();
    } catch {
      // ignore
    }

    let imageBuffer: Buffer;
    const rawBuffer = canvas.toBuffer('image/png');

    if (canvasWidth > mw) {
      imageBuffer = await sharp(rawBuffer)
        .resize({ width: mw, fit: 'inside' })
        .toFormat(fmt, { quality: q })
        .toBuffer();
    } else {
      if (fmt === 'jpeg') {
        imageBuffer = await sharp(rawBuffer).toFormat('jpeg', { quality: q }).toBuffer();
      } else {
        imageBuffer = rawBuffer;
      }
    }

    const durationMs = Math.round(nowMs() - start);
    logger.debug('Rendered PDF page to image', {
      pageIndex,
      format: fmt,
      scale: sc,
      maxWidth: mw,
      quality: q,
      durationMs,
      canvasWidth,
      canvasHeight,
    });

    return imageBuffer.toString('base64');
  } catch (error) {
    const details = safeErrorDetails(error);
    logger.error('Failed to render PDF to image', {
      ...details,
      pageIndex,
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
  options: Omit<RenderOptions, 'pageIndex'> = {}
): Promise<string[]> {
  const { scale = 2, maxWidth = 1024, quality = 85, format = 'png', cacheTag } = options;

  const fmt = normalizeFormat(format);
  const q = normalizeQuality(quality, 85);
  const mw = normalizeMaxWidth(maxWidth, 1024);
  const sc = normalizeScale(scale, 2);

  const start = nowMs();

  // Check cache first — return early if all pages are cached
  if (cacheTag) {
    const allCached: string[] = [];
    let miss = false;
    for (const idxRaw of pageIndices) {
      const key = cacheKey(cacheTag, idxRaw, sc, mw, fmt, q, 'full');
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

   
  let loadingTask: any | undefined;
   
  let pdfDocument: any | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const numPages: number = pdfDocument.numPages;
    const results: string[] = [];

    for (const idxRaw of pageIndices) {
      const idx = Number.isFinite(idxRaw) ? Math.trunc(idxRaw) : -1;

      if (idx < 0 || idx >= numPages) {
        logger.warn('renderPdfPageBatch: page index out of bounds; using placeholder', {
          idx: idxRaw,
          normalizedIdx: idx,
          numPages,
        });
        results.push(PLACEHOLDER_IMAGE);
        continue;
      }

      // Per-page cache check
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

        const page = await pdfDocument.getPage(idx + 1);
        const viewport = page.getViewport({ scale: sc });

        const canvasWidth = Math.floor(viewport.width);
        const canvasHeight = Math.floor(viewport.height);

        const canvas = createCanvas(canvasWidth, canvasHeight);
        const context = canvas.getContext('2d');

        await page.render({
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        }).promise;

        // Release page resources where supported (best-effort)
        try {
          if (typeof page.cleanup === 'function') page.cleanup();
        } catch {
          // ignore
        }

        const rawBuffer = canvas.toBuffer('image/png');

        let imageBuffer: Buffer;
        if (canvasWidth > mw) {
          imageBuffer = await sharp(rawBuffer)
            .resize({ width: mw, fit: 'inside' })
            .toFormat(fmt, { quality: q })
            .toBuffer();
        } else if (fmt === 'jpeg') {
          imageBuffer = await sharp(rawBuffer).toFormat('jpeg', { quality: q }).toBuffer();
        } else {
          imageBuffer = rawBuffer;
        }

        const b64 = imageBuffer.toString('base64');

        // Store in cache if tag provided
        if (cacheTag) {
          renderCache.set(cacheKey(cacheTag, idx, sc, mw, fmt, q, 'full'), b64);
        }

        results.push(b64);

        logger.debug('renderPdfPageBatch: rendered page', {
          idx,
          durationMs: Math.round(nowMs() - pageStart),
          canvasWidth,
          canvasHeight,
          format: fmt,
          scale: sc,
          maxWidth: mw,
          quality: q,
        });
      } catch (err) {
        const details = safeErrorDetails(err);
        logger.warn('renderPdfPageBatch: failed to render page; using placeholder', {
          idx,
          ...details,
        });
        results.push(PLACEHOLDER_IMAGE);
      }
    }

    logger.info('renderPdfPageBatch: completed', {
      requestedCount: pageIndices.length,
      returnedCount: pageIndices.length,
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

export interface HeaderCropBatchOptions extends Omit<RenderOptions, 'pageIndex'> {
  cropHeightFraction?: number;
}

/**
 * Render top-of-page header crops in batch for scanned/image PDFs.
 *
 * Returns base64 images ordered to match `pageIndices`.
 */
export async function renderPdfHeaderCropBatch(
  pdfBuffer: Buffer,
  pageIndices: number[],
  options: HeaderCropBatchOptions = {}
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

  const safeCropHeightFraction = Math.min(0.8, Math.max(0.05, cropHeightFraction));
  const variant = `header-${safeCropHeightFraction}`;

  const start = nowMs();

   
  let loadingTask: any | undefined;
   
  let pdfDocument: any | undefined;

  try {
    ({ loadingTask, pdfDocument } = await openPdfDocument(pdfBuffer));

    const numPages: number = pdfDocument.numPages;
    const results: string[] = [];

    for (const idxRaw of pageIndices) {
      const idx = Number.isFinite(idxRaw) ? Math.trunc(idxRaw) : -1;

      if (idx < 0 || idx >= numPages) {
        logger.warn('renderPdfHeaderCropBatch: page index out of bounds; using placeholder', {
          idx: idxRaw,
          normalizedIdx: idx,
          numPages,
        });
        results.push(PLACEHOLDER_IMAGE);
        continue;
      }

      // Per-page header crop cache check
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

        const page = await pdfDocument.getPage(idx + 1);
        const viewport = page.getViewport({ scale: sc });

        const canvasWidth = Math.floor(viewport.width);
        const canvasHeight = Math.floor(viewport.height);

        const canvas = createCanvas(canvasWidth, canvasHeight);
        const context = canvas.getContext('2d');

        await page.render({
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        }).promise;

        // Release page resources where supported (best-effort)
        try {
          if (typeof page.cleanup === 'function') page.cleanup();
        } catch {
          // ignore
        }

        const rawBuffer = canvas.toBuffer('image/png');

        // Use sharp metadata to confirm dimensions, but fall back to viewport if missing
        const metadata = await sharp(rawBuffer).metadata();
        const width = metadata.width ?? canvasWidth;
        const height = metadata.height ?? canvasHeight;
        const cropHeight = Math.max(1, Math.floor(height * safeCropHeightFraction));

        let headerBuffer = await sharp(rawBuffer)
          .extract({ left: 0, top: 0, width, height: cropHeight })
          .toBuffer();

        if (width > mw) {
          headerBuffer = await sharp(headerBuffer)
            .resize({ width: mw, fit: 'inside' })
            .toFormat(fmt, { quality: q })
            .toBuffer();
        } else if (fmt === 'jpeg') {
          headerBuffer = await sharp(headerBuffer).toFormat('jpeg', { quality: q }).toBuffer();
        } else if (fmt === 'png') {
          // Keep as-is (already png)
        }

        const headerB64 = headerBuffer.toString('base64');

        // Store in cache if tag provided
        if (cacheTag) {
          renderCache.set(cacheKey(cacheTag, idx, sc, mw, fmt, q, variant), headerB64);
        }

        results.push(headerB64);

        logger.debug('renderPdfHeaderCropBatch: rendered header crop', {
          idx,
          durationMs: Math.round(nowMs() - pageStart),
          pageWidth: width,
          pageHeight: height,
          cropHeight,
          cropHeightFraction: safeCropHeightFraction,
          format: fmt,
          scale: sc,
          maxWidth: mw,
          quality: q,
        });
      } catch (err) {
        const details = safeErrorDetails(err);
        logger.warn('renderPdfHeaderCropBatch: failed to render header crop; using placeholder', {
          idx,
          ...details,
        });
        results.push(PLACEHOLDER_IMAGE);
      }
    }

    logger.info('renderPdfHeaderCropBatch: completed', {
      requestedCount: pageIndices.length,
      returnedCount: pageIndices.length,
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