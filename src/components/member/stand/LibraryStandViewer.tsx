'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Lazy-load the PDF viewer to avoid SSR issues
const PDFViewer = dynamic(
  () => import('./LibraryPDFViewer').then((m) => m.LibraryPDFViewer),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading PDF…</div> }
);

interface LibraryFile {
  id: string;
  storageKey: string;
  storageUrl: string | null;
  pageCount: number;
  partLabel: string | null;
  instrumentName: string | null;
}

interface LibraryPart {
  id: string;
  partName: string;
  instrumentId: string;
  instrumentName: string;
  storageKey: string | null;
  pageCount: number | null;
}

interface LibraryPiece {
  id: string;
  title: string;
  composer: string | null;
  files: LibraryFile[];
  parts: LibraryPart[];
}

interface LibraryStandViewerProps {
  piece: LibraryPiece;
  userId: string;
}

/**
 * Simplified stand viewer for library / practice mode.
 * Shows a single piece with part selection and basic page navigation.
 */
export function LibraryStandViewer({ piece }: LibraryStandViewerProps) {
  const [nightMode, setNightMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPartId, setSelectedPartId] = useState<string>('__full__');

  // Build the list of available views
  const fullScorePdf = piece.files[0] ?? null;

  const partOptions = [
    ...(fullScorePdf
      ? [
          {
            id: '__full__',
            label: fullScorePdf.partLabel ?? fullScorePdf.instrumentName ?? 'Full Score',
            storageKey: fullScorePdf.storageKey,
            pageCount: fullScorePdf.pageCount,
          },
        ]
      : []),
    ...piece.parts
      .filter((p) => p.storageKey)
      .map((p) => ({
        id: p.id,
        label: p.partName || p.instrumentName,
        storageKey: p.storageKey!,
        pageCount: p.pageCount ?? 1,
      })),
  ];

  const selectedPart = partOptions.find((p) => p.id === selectedPartId) ?? partOptions[0];
  const totalPages = selectedPart?.pageCount ?? 1;

  const pdfUrl = selectedPart
    ? `/api/stand/files/${encodeURIComponent(selectedPart.storageKey)}`
    : null;

  function prevPage() {
    setCurrentPage((p) => Math.max(1, p - 1));
  }

  function nextPage() {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }

  return (
    <div
      className={cn(
        'flex flex-col flex-1 overflow-hidden',
        nightMode && 'bg-zinc-900 text-zinc-100'
      )}
    >
      {/* Controls */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2 border-b shrink-0',
          nightMode ? 'bg-zinc-800 border-zinc-700' : 'bg-card'
        )}
      >
        {partOptions.length > 1 && (
          <Select
            value={selectedPartId}
            onValueChange={(v) => {
              setSelectedPartId(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Select part" />
            </SelectTrigger>
            <SelectContent>
              {partOptions.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={prevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className={cn('text-xs tabular-nums', nightMode && 'text-zinc-300')}>
            {currentPage} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setNightMode((n) => !n)}
            aria-label={nightMode ? 'Light mode' : 'Night mode'}
          >
            {nightMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* PDF area */}
      <div
        className={cn(
          'flex-1 overflow-hidden',
          nightMode ? 'bg-zinc-900' : 'bg-muted/30'
        )}
      >
        {pdfUrl ? (
          <PDFViewer
            url={pdfUrl}
            page={currentPage}
            onPageChange={setCurrentPage}
            nightMode={nightMode}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No PDF available for this piece.
          </div>
        )}
      </div>
    </div>
  );
}

LibraryStandViewer.displayName = 'LibraryStandViewer';
