import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
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
// ---------------------------------------------------------------------------

export interface RenderOptions {
  pageIndex?: number;
  quality?: number;
  maxWidth?: number;
  format?: 'png' | 'jpeg';
  /** DPI multiplier. Default 2 → ~192 DPI for sharp sheet music OCR */
  scale?: number;
}

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

  try {
    // pdfjs-dist requires Uint8Array, not Buffer
    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableWorker: true,
    } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    if (pageIndex < 0 || pageIndex >= numPages) {
      throw new Error(
        `Page index ${pageIndex} out of range. PDF has ${numPages} page(s) (0-${numPages - 1}).`
      );
    }

    const page = await pdfDocument.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const canvasWidth = Math.floor(viewport.width);
    const canvasHeight = Math.floor(viewport.height);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    let imageBuffer: Buffer;
    const rawBuffer = canvas.toBuffer('image/png');

    if (canvasWidth > maxWidth) {
      imageBuffer = await sharp(rawBuffer)
        .resize({ width: maxWidth, fit: 'inside' })
        .toFormat(format, { quality })
        .toBuffer();
    } else {
      if (format === 'jpeg') {
        imageBuffer = await sharp(rawBuffer)
          .toFormat('jpeg', { quality })
          .toBuffer();
      } else {
        imageBuffer = rawBuffer;
      }
    }

    return imageBuffer.toString('base64');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to render PDF to image:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    throw err;
  }
}

// Minimal 1×1 white PNG used as a placeholder for pages that fail to render
const PLACEHOLDER_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';

/**
 * Render multiple PDF pages in one call, reusing a single parsed pdfjs document.
 * Much faster than calling renderPdfToImage() N times for large documents.
 *
 * @param pdfBuffer  - Raw PDF bytes
 * @param pageIndices - 0-based page indices to render
 * @param options    - Shared render options (pageIndex is ignored here)
 * @returns Base64-encoded PNG images in the same order as pageIndices
 */
export async function renderPdfPageBatch(
  pdfBuffer: Buffer,
  pageIndices: number[],
  options: Omit<RenderOptions, 'pageIndex'> = {}
): Promise<string[]> {
  const { scale = 2, maxWidth = 1024, quality = 85, format = 'png' } = options;

  const pdfData = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
  const pdfDocument = await loadingTask.promise;

  const results: string[] = [];

  for (const idx of pageIndices) {
    try {
      const page = await pdfDocument.getPage(idx + 1);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;

      const rawBuffer = canvas.toBuffer('image/png');

      let imageBuffer: Buffer;
      if (Math.floor(viewport.width) > maxWidth) {
        imageBuffer = await sharp(rawBuffer)
          .resize({ width: maxWidth, fit: 'inside' })
          .toFormat(format, { quality })
          .toBuffer();
      } else if (format === 'jpeg') {
        imageBuffer = await sharp(rawBuffer).toFormat('jpeg', { quality }).toBuffer();
      } else {
        imageBuffer = rawBuffer;
      }

      results.push(imageBuffer.toString('base64'));
    } catch (err) {
      logger.warn('renderPdfPageBatch: failed to render page', { idx, err });
      results.push(PLACEHOLDER_IMAGE);
    }
  }

  return results;
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
  } = options;

  const safeCropHeightFraction = Math.min(0.8, Math.max(0.05, cropHeightFraction));

  const pdfData = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
  const pdfDocument = await loadingTask.promise;

  const results: string[] = [];

  for (const idx of pageIndices) {
    try {
      const page = await pdfDocument.getPage(idx + 1);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;

      const rawBuffer = canvas.toBuffer('image/png');
      const metadata = await sharp(rawBuffer).metadata();
      const width = metadata.width ?? Math.floor(viewport.width);
      const height = metadata.height ?? Math.floor(viewport.height);
      const cropHeight = Math.max(1, Math.floor(height * safeCropHeightFraction));

      let headerBuffer = await sharp(rawBuffer)
        .extract({ left: 0, top: 0, width, height: cropHeight })
        .toBuffer();

      if (width > maxWidth) {
        headerBuffer = await sharp(headerBuffer)
          .resize({ width: maxWidth, fit: 'inside' })
          .toFormat(format, { quality })
          .toBuffer();
      } else if (format === 'jpeg') {
        headerBuffer = await sharp(headerBuffer).toFormat('jpeg', { quality }).toBuffer();
      }

      results.push(headerBuffer.toString('base64'));
    } catch (err) {
      logger.warn('renderPdfHeaderCropBatch: failed to render header crop', { idx, err });
      results.push(PLACEHOLDER_IMAGE);
    }
  }

  return results;
}
