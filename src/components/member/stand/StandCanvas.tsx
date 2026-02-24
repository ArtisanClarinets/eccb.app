'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useStandStore } from '@/store/standStore';
import { usePdf } from './usePdf';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { AnnotationLayer } from './AnnotationLayer';

export interface StandCanvasProps {
  className?: string;
  enableAutoCrop?: boolean;
  enablePreload?: boolean;
  onPageClick?: (pageNumber: number, x: number, y: number) => void;
  onCropChange?: (cropRect: { x: number; y: number; width: number; height: number } | null) => void;
}

export interface StandCanvasRef {
  renderPage: (pageNumber: number) => Promise<void>;
  getCropRect: () => { x: number; y: number; width: number; height: number } | null;
  getCanvasDataUrl: () => string | null;
  requestRender: () => void;
}

// Check for reduced motion preference
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange, { passive: true });
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

/**
 * Canvas-based PDF renderer for the digital music stand
 * Supports zoom, auto-crop, preloading, and annotation overlays
 * Night mode applies CSS inversion for dark environment reading
 * 
 * Accessibility features:
 * - ARIA labels for screen readers
 * - Keyboard navigation support
 * - Reduced motion support
 * - Skip links for major sections
 */
export const StandCanvas = forwardRef<StandCanvasRef, StandCanvasProps>(
  (
    {
      className,
      enableAutoCrop = false,
      enablePreload = true,
      onPageClick,
      onCropChange,
    },
    ref
  ) => {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderFrameRef = useRef<number | null>(null);

    const {
      currentPieceIndex,
      _currentPage: currentPage,
      pieces,
      zoom,
      setCurrentPage,
      scrollOffset,
      nightMode,
    } = useStandStore();

    const prefersReducedMotion = usePrefersReducedMotion();
    const currentPiece = pieces[currentPieceIndex];

    const scale = useMemo(() => zoom / 100, [zoom]);

    const {
      isLoading,
      error,
      numPages,
      cropRect,
      prevPageCanvas,
      nextPageCanvas,
      renderCurrentPage,
    } = usePdf({
      url: currentPiece?.pdfUrl ?? null,
      pageNumber: currentPage,
      scale,
      enablePreload,
      enableAutoCrop,
    });

    // Notify parent of crop changes
    useEffect(() => {
      if (onCropChange) {
        onCropChange(cropRect);
      }
    }, [cropRect, onCropChange]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        renderPage: async (pageNumber: number) => {
          if (pageNumber >= 1 && pageNumber <= numPages) {
            setCurrentPage(pageNumber);
            await renderCurrentPage();
          }
        },
        getCropRect: () => cropRect,
        getCanvasDataUrl: () => {
          if (canvasRef.current) {
            return canvasRef.current.toDataURL('image/png');
          }
          return null;
        },
        requestRender: () => renderCurrentPage(),
      }),
      [numPages, cropRect, renderCurrentPage, setCurrentPage]
    );

    // Handle canvas click with RAF for performance
    const handleCanvasClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current || !onPageClick) return;
        
        // Use RAF to ensure we're not blocking main thread
        if (renderFrameRef.current) {
          cancelAnimationFrame(renderFrameRef.current);
        }
        
        renderFrameRef.current = requestAnimationFrame(() => {
          if (!canvasRef.current || !onPageClick) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          onPageClick(currentPage, x, y);
        });
      },
      [currentPage, onPageClick]
    );

    // Keyboard navigation for canvas
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // Don't capture if focus is in an input
        if (document.activeElement?.tagName === 'INPUT' || 
            document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }

        switch (event.key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            if (currentPage > 1) setCurrentPage(currentPage - 1);
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            if (currentPage < numPages) setCurrentPage(currentPage + 1);
            break;
          case 'Home':
            setCurrentPage(1);
            break;
          case 'End':
            setCurrentPage(numPages);
            break;
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (renderFrameRef.current) {
          cancelAnimationFrame(renderFrameRef.current);
        }
      };
    }, [currentPage, numPages, setCurrentPage]);

    // Cleanup RAF on unmount
    useEffect(() => {
      return () => {
        if (renderFrameRef.current) {
          cancelAnimationFrame(renderFrameRef.current);
        }
      };
    }, []);

    if (!currentPiece) {
      return (
        <div
          className={cn(
            'flex items-center justify-center h-full text-muted-foreground',
            className
          )}
          role="status"
          aria-live="polite"
        >
          No piece selected.
        </div>
      );
    }

    if (!currentPiece.pdfUrl) {
      return (
        <div
          className={cn(
            'flex items-center justify-center h-full text-muted-foreground',
            className
          )}
          role="status"
          aria-live="polite"
        >
          No PDF available for this piece.
        </div>
      );
    }

    if (error) {
      return (
        <div
          className={cn(
            'flex items-center justify-center h-full text-destructive',
            className
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center">
            <p className="font-semibold">Error loading PDF</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        </div>
      );
    }

    const nightModeContainerStyles = nightMode
      ? { backgroundColor: '#000000' }
      : {};

    const nightModeCanvasStyles = nightMode
      ? { filter: 'invert(1) hue-rotate(180deg)' }
      : {};

    // Determine transition duration based on motion preference
    const transitionDuration = prefersReducedMotion ? '0ms' : '200ms';

    return (
      <div
        ref={canvasContainerRef}
        className={cn(
          'relative w-full h-full overflow-auto',
          'flex items-start justify-center',
          'bg-neutral-100 dark:bg-neutral-900',
          className
        )}
        style={{
          ...nightModeContainerStyles,
          transitionDuration,
        }}
        data-night-mode={nightMode}
        role="region"
        aria-label="PDF viewer"
        aria-busy={isLoading}
      >
        {/* Skip links for keyboard users */}
        <a
          href="#stand-canvas-main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        >
          Skip to main content
        </a>
        <a
          href="#stand-toolbar"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        >
          Skip to toolbar
        </a>

        {isLoading && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
            role="status"
            aria-live="polite"
            aria-label="Loading PDF page"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading page {currentPage}...</span>
          </div>
        )}
        <div
          id="stand-canvas-main"
          className="relative"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            marginTop: scrollOffset > 0 ? `-${scrollOffset * 100}%` : undefined,
          }}
          tabIndex={-1}
        >
          <canvas
            ref={canvasRef}
            className="block shadow-lg"
            onClick={handleCanvasClick}
            style={{
              maxWidth: '100%',
              height: 'auto',
              ...nightModeCanvasStyles,
            }}
            aria-label={`Page ${currentPage} of ${numPages} of ${currentPiece.title}`}
            role="img"
          />
          {prevPageCanvas && (
            <canvas
              ref={(el) => {
                if (el && prevPageCanvas) {
                  const ctx = el.getContext('2d');
                  if (ctx) {
                    el.width = prevPageCanvas.width;
                    el.height = prevPageCanvas.height;
                    ctx.drawImage(prevPageCanvas, 0, 0);
                  }
                }
              }}
              className="absolute inset-0 pointer-events-none opacity-0"
              aria-hidden="true"
            />
          )}
          {nextPageCanvas && (
            <canvas
              ref={(el) => {
                if (el && nextPageCanvas) {
                  const ctx = el.getContext('2d');
                  if (ctx) {
                    el.width = nextPageCanvas.width;
                    el.height = nextPageCanvas.height;
                    ctx.drawImage(nextPageCanvas, 0, 0);
                  }
                }
              }}
              className="absolute inset-0 pointer-events-none opacity-0"
              aria-hidden="true"
            />
          )}
          <AnnotationLayer />
          <div
            className={cn(
              'absolute bottom-2 right-2 px-2 py-1 rounded text-xs',
              nightMode
                ? 'bg-black/80 text-white border border-white/20'
                : 'bg-background/80 text-muted-foreground'
            )}
            role="status"
            aria-live="polite"
            aria-label={`Page ${currentPage} of ${numPages}`}
          >
            {currentPage} / {numPages}
          </div>
        </div>
      </div>
    );
  }
);

StandCanvas.displayName = 'StandCanvas';

export default StandCanvas;
