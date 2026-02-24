'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStandStore } from '@/store/standStore';

export function NavigationControls() {
  const {
    nextPiece,
    prevPiece,
    currentPieceIndex,
    pieces,
    eventTitle,
  } = useStandStore();

  const currentPiece = pieces[currentPieceIndex];

  const handlePieceSelect = (value: string) => {
    const index = parseInt(value, 10);
    useStandStore.getState().setCurrentPieceIndex(index);
  };

  return (
    <div className="flex items-center gap-4">
      <Button
        variant="outline"
        size="icon"
        onClick={prevPiece}
        disabled={currentPieceIndex === 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex flex-col">
        <span className="font-bold text-lg">{currentPiece?.title || 'No Music'}</span>
        <span className="text-sm text-muted-foreground">
          {pieces.length > 0 ? `${currentPieceIndex + 1} of ${pieces.length}` : '0'} - {eventTitle || 'Unknown Event'}
        </span>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={nextPiece}
        disabled={currentPieceIndex >= pieces.length - 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Select
        value={currentPieceIndex.toString()}
        onValueChange={handlePieceSelect}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Jump to piece" />
        </SelectTrigger>
        <SelectContent>
          {pieces.map((piece, idx) => (
            <SelectItem key={piece.id} value={idx.toString()}>
              {idx + 1}. {piece.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

NavigationControls.displayName = 'NavigationControls';
