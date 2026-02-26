'use client';

import React, { useState } from 'react';
import { useStandStore } from '@/store/standStore';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, List, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * SetlistManager — PiaScore-style piece list sidebar.
 *
 * Features:
 * - Shows ordered list of pieces for the event
 * - Highlights the currently active piece
 * - Tap to jump to a piece
 * - Collapsible so the viewer doesn't lose screen space
 */
export function SetlistManager() {
  const { pieces, currentPieceIndex, setCurrentPieceIndex } = useStandStore();
  const [isOpen, setIsOpen] = useState(true);

  if (!pieces || pieces.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0',
        isOpen ? 'w-56' : 'w-10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-border">
        {isOpen && (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <List className="h-3 w-3" />
            Setlist
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto"
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? 'Collapse setlist' : 'Expand setlist'}
        >
          {isOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Piece list */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto py-1">
          {pieces.map((piece, idx) => {
            const isActive = idx === currentPieceIndex;
            return (
              <button
                key={piece.id}
                onClick={() => setCurrentPieceIndex(idx)}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-accent/50 transition-colors border-l-2',
                  isActive
                    ? 'border-l-primary bg-primary/10 font-semibold text-primary'
                    : 'border-l-transparent text-foreground'
                )}
                aria-current={isActive ? 'true' : undefined}
              >
                <div className="flex items-start gap-2">
                  <Music
                    className={cn(
                      'h-3 w-3 mt-0.5 shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium leading-tight">
                      {idx + 1}. {piece.title}
                    </div>
                    {piece.composer && (
                      <div className="truncate text-muted-foreground text-[10px] leading-tight mt-0.5">
                        {piece.composer}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {piece.totalPages} {piece.totalPages === 1 ? 'page' : 'pages'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Collapsed: just numbered dots */}
      {!isOpen && (
        <div className="flex flex-col items-center py-2 gap-1">
          {pieces.map((piece, idx) => {
            const isActive = idx === currentPieceIndex;
            return (
              <button
                key={piece.id}
                onClick={() => setCurrentPieceIndex(idx)}
                className={cn(
                  'w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
                title={`${idx + 1}. ${piece.title}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

SetlistManager.displayName = 'SetlistManager';

