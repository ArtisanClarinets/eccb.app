'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  loadPdfDocument,
  type PdfDocument,
  type PdfPage,
  type CropRect,
  renderPageToCanvas,
  createOffscreenCanvas,
} from '@/lib/pdf';
import { calculateAutoCrop } from '@/lib/autoCrop';

export interface UsePdfOptions {
  url: string | null;
  pageNumber: number;
  scale: number;
  enablePreload?: boolean;
  enableAutoCrop?: boolean;
}

export interface UsePdfResult {
  document: PdfDocument | null;
  currentPage: PdfPage | null;
  isLoading: boolean;
  error: Error | null;
  numPages: number;
  cropRect: CropRect | null;
  prevPageCanvas: HTMLCanvasElement | null;
  nextPageCanvas: HTMLCanvasElement | null;
  renderCurrentPage: () => Promise<void>;
  preloadAdjacentPages: () => Promise<void>;
}

export interface UsePdfReturn extends UsePdfResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Custom hook for loading and rendering PDF pages
 * Handles document loading, page rendering, and preloading
 */
export function usePdf(options: UsePdfOptions): UsePdfReturn {
  const { url, pageNumber, scale, enablePreload = true, enableAutoCrop = false } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef<PdfDocument | null>(null);

  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [currentPage, setCurrentPage] = useState<PdfPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [prevPageCanvas, setPrevPageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [nextPageCanvas, setNextPageCanvas] = useState<HTMLCanvasElement | null>(null);

  const renderRef = useRef<{ cancel: () => void } | null>(null);

  // Load PDF document when URL changes
  useEffect(() => {
    if (!url) {
      setDocument(null);
      setCurrentPage(null);
      setNumPages(0);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadDocument() {
      if (!url) return;
      setIsLoading(true);
      setError(null);

      try {
        const pdfDoc = await loadPdfDocument(url);

        if (cancelled) return;

        documentRef.current = pdfDoc;
        setDocument(pdfDoc);
        setNumPages(pdfDoc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load PDF'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Load and render current page when document or page number changes
  useEffect(() => {
    if (!document || pageNumber < 1 || pageNumber > numPages) {
      setCurrentPage(null);
      return;
    }

    let cancelled = false;

    // Cancel any ongoing render before starting a new one
    if (renderRef.current) {
      renderRef.current.cancel();
      renderRef.current = null;
    }

    async function loadAndRenderPage() {
      const doc = document;
      if (!doc) return;

      try {
        const page = await doc.getPage(pageNumber);

        if (cancelled) return;

        setCurrentPage(page);

        // Calculate auto-crop if enabled
        if (enableAutoCrop) {
          const crop = await calculateAutoCrop(page);
          if (!cancelled) {
            setCropRect(crop);
          }
        }

        // Render to canvas if available
        if (canvasRef.current) {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
          try {
            const handle = await renderPageToCanvas(page, canvasRef.current, scale, dpr);
            if (!cancelled) {
              renderRef.current = handle;
            } else {
              handle.cancel();
            }
          } catch (renderErr) {
            // Cancelled renders throw — ignore if we triggered it
            if (!cancelled) {
              console.error('Error rendering page:', renderErr);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error rendering page:', err);
        }
      }
    }

    loadAndRenderPage();

    return () => {
      cancelled = true;
      if (renderRef.current) {
        renderRef.current.cancel();
        renderRef.current = null;
      }
    };
  }, [document, pageNumber, scale, numPages, enableAutoCrop]);

  // Preload adjacent pages
  useEffect(() => {
    if (!enablePreload || !document || numPages === 0) return;

    let cancelled = false;

    async function preloadPages() {
      const doc = document;
      if (!doc) return;

      // Preload previous page
      if (pageNumber > 1) {
        try {
          const prevPage = await doc.getPage(pageNumber - 1);
          const canvas = createOffscreenCanvas(
            Math.floor(prevPage.getViewport({ scale }).width),
            Math.floor(prevPage.getViewport({ scale }).height)
          );
          await renderPageToCanvas(prevPage, canvas, scale);

          if (!cancelled) {
            setPrevPageCanvas(canvas);
          }
        } catch (err) {
          console.error('Error preloading previous page:', err);
        }
      } else {
        setPrevPageCanvas(null);
      }

      // Preload next page
      if (pageNumber < numPages) {
        try {
          const nextPage = await document.getPage(pageNumber + 1);
          const canvas = createOffscreenCanvas(
            Math.floor(nextPage.getViewport({ scale }).width),
            Math.floor(nextPage.getViewport({ scale }).height)
          );
          await renderPageToCanvas(nextPage, canvas, scale);

          if (!cancelled) {
            setNextPageCanvas(canvas);
          }
        } catch (err) {
          console.error('Error preloading next page:', err);
        }
      } else {
        setNextPageCanvas(null);
      }
    }

    preloadPages();

    return () => {
      cancelled = true;
    };
  }, [document, pageNumber, numPages, scale, enablePreload]);

  const renderCurrentPage = useCallback(async () => {
    if (!currentPage || !canvasRef.current) return;

    try {
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      if (renderRef.current) {
        renderRef.current.cancel();
        renderRef.current = null;
      }
      const handle = await renderPageToCanvas(currentPage, canvasRef.current, scale, dpr);
      renderRef.current = handle;
    } catch (err) {
      console.error('Error re-rendering page:', err);
    }
  }, [currentPage, scale]);

  const preloadAdjacentPages = useCallback(async () => {
    if (!document || !enablePreload) return;

    // Force preload regardless of current state
    if (pageNumber > 1) {
      const prevPage = await document.getPage(pageNumber - 1);
      const canvas = createOffscreenCanvas(
        Math.floor(prevPage.getViewport({ scale }).width),
        Math.floor(prevPage.getViewport({ scale }).height)
      );
      await renderPageToCanvas(prevPage, canvas, scale);
      setPrevPageCanvas(canvas);
    }

    if (pageNumber < numPages) {
      const nextPage = await document.getPage(pageNumber + 1);
      const canvas = createOffscreenCanvas(
        Math.floor(nextPage.getViewport({ scale }).width),
        Math.floor(nextPage.getViewport({ scale }).height)
      );
      await renderPageToCanvas(nextPage, canvas, scale);
      setNextPageCanvas(canvas);
    }
  }, [document, pageNumber, numPages, scale, enablePreload]);

  return {
    document,
    currentPage,
    isLoading,
    error,
    numPages,
    cropRect,
    prevPageCanvas,
    nextPageCanvas,
    renderCurrentPage,
    preloadAdjacentPages,
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement | null>,
    containerRef: containerRef as React.RefObject<HTMLDivElement | null>,
  };
}

export type { CropRect };
