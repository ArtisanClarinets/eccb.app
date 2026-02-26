'use client';

import React, { useEffect, useRef } from 'react';
import { usePdf } from './usePdf';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LibraryPDFViewerProps {
  url: string;
  page: number;
  onPageChange: (page: number) => void;
  nightMode?: boolean;
}

/**
 * Standalone PDF viewer for library / practice mode.
 * Uses the same usePdf hook as StandCanvas but without the Zustand store.
 */
export function LibraryPDFViewer({
  url,
  page,
  onPageChange,
  nightMode = false,
}: LibraryPDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { isLoading, error, numPages, renderCurrentPage } = usePdf({
    url,
    pageNumber: page,
    scale: 1.5,
    enablePreload: true,
    enableAutoCrop: false,
  });

  // Sync page count back to parent
  useEffect(() => {
    if (numPages > 0 && page > numPages) {
      onPageChange(1);
    }
  }, [numPages, page, onPageChange]);

  // Trigger render when page or url changes
  useEffect(() => {
    if (!isLoading && !error) {
      renderCurrentPage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, url]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive">
        <AlertTriangle className="h-10 w-10" />
        <p className="text-sm">Failed to load PDF</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center h-full w-full overflow-auto p-4"
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn(
          'max-w-full shadow-lg rounded',
          nightMode && 'invert sepia brightness-75',
          isLoading && 'opacity-30'
        )}
        aria-label={`Page ${page}`}
      />
    </div>
  );
}

LibraryPDFViewer.displayName = 'LibraryPDFViewer';
