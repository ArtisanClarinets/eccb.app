'use client';

import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker from our own public/ copy (CSP-safe).
let workerInitialised = false;

export function initializePdfJs(): void {
  if (workerInitialised) return;
  // Served from public/pdf.worker.min.mjs – same origin, so CSP 'self' allows it.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  workerInitialised = true;
}

export interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
}

export interface PdfPage {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: PdfRenderOptions) => PdfRenderTask;
  getTextContent: () => Promise<PdfTextContent>;
}

export interface PdfViewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  clone: (options?: Partial<PdfViewportOptions>) => PdfViewport;
}

export interface PdfViewportOptions {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface PdfRenderOptions {
  canvasContext: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  viewport: PdfViewport;
}

export interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

export interface PdfTextContent {
  items: PdfTextItem[];
}

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Load a PDF document from a URL
 * @param url - The URL of the PDF file
 * @returns Promise resolving to the PDF document
 */
export async function loadPdfDocument(url: string): Promise<PdfDocument> {
  initializePdfJs();

  const loadingTask = pdfjs.getDocument({
    url,
    // cMaps are bundled into the worker in pdfjs-dist >= 4; no external URL needed.
    cMapPacked: true,
    withCredentials: false, // same-origin proxy, cookies travel automatically
  });

  const pdfDoc = await loadingTask.promise;

  return {
    numPages: pdfDoc.numPages,
    getPage: async (pageNumber: number) => {
      const page = await pdfDoc.getPage(pageNumber);
      return {
        getViewport: (options: { scale: number }) => {
          const viewport = page.getViewport(options);
          return {
            width: viewport.width,
            height: viewport.height,
            scale: viewport.scale,
            offsetX: viewport.offsetX,
            offsetY: viewport.offsetY,
            clone: (cloneOptions?: Partial<PdfViewportOptions>) => {
              return viewport.clone(cloneOptions) as unknown as PdfViewport;
            },
          };
        },
        render: (renderOptions: PdfRenderOptions) => {
          // Cast to unknown first to handle type mismatches between custom types and PDF.js types
          const task = page.render(renderOptions as unknown as Parameters<typeof page.render>[0]);
          return {
            promise: task.promise,
            cancel: () => task.cancel(),
          };
        },
        getTextContent: async () => {
          const textContent = await page.getTextContent();
          return {
            items: textContent.items
              .filter((item): item is Extract<typeof item, { str: string }> => 'str' in item)
              .map((item) => ({
                str: item.str,
                transform: item.transform,
                width: item.width,
                height: item.height,
              })),
          };
        },
      };
    },
  };
}

/**
 * Create an offscreen canvas for pre-rendering
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns HTMLCanvasElement
 */
export function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Render a PDF page to a canvas
 * @param page - PDF page object
 * @param canvas - Target canvas element
 * @param scale - Scale factor
 * @returns Promise resolving when rendering is complete
 */
export async function renderPageToCanvas(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to get canvas context');
  }

  // Set canvas dimensions to match viewport
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
  });

  await renderTask.promise;
}

export { pdfjs };
