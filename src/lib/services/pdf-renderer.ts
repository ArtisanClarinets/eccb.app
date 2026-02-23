import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Server-side (Node.js) pdfjs configuration.
//
// Setting workerSrc to an empty string instructs pdfjs-dist to run
// PDF parsing synchronously on the main thread ("FakeWorker" / in-process
// mode) instead of spawning a web-worker.  This is the correct mode for
// server-side rendering where neither a DOM nor a SharedArrayBuffer worker
// is available.
// ---------------------------------------------------------------------------
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface RenderOptions {
  pageIndex?: number;
  quality?: number;
  maxWidth?: number;
  format?: 'png' | 'jpeg';
}

export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: RenderOptions = {}
): Promise<string> {
  const {
    pageIndex = 0,
    quality = 85,
    maxWidth = 1920,
    format = 'png',
  } = options;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    if (pageIndex < 0 || pageIndex >= numPages) {
      throw new Error(
        `Page index ${pageIndex} out of range. PDF has ${numPages} page(s) (0-${numPages - 1}).`
      );
    }

    const page = await pdfDocument.getPage(pageIndex + 1);
    const scale = 1;
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
    logger.error('Failed to render PDF to image:', err);
    throw err;
  }
}