'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StandViewerProps {
  eventTitle: string;
  music: any[];
}

export function StandViewer({ eventTitle, music }: StandViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showControls, setShowControls] = useState(true);

  const currentPiece = music[currentIndex]; // nosemgrep: safe-access
  const pdfFile = currentPiece?.piece?.files?.find((f: any) =>
    f.mimeType === 'application/pdf'
  );

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const nextPiece = () => {
    if (currentIndex < music.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const prevPiece = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  if (!music || music.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No music scheduled for this event.
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-[calc(100vh-4rem)] ${isFullscreen ? 'fixed inset-0 z-50 bg-background h-screen' : ''}`}>
      {/* Controls Bar */}
      <div className={`p-4 border-b flex items-center justify-between bg-card ${!showControls && isFullscreen ? 'hidden' : ''}`}>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={prevPiece} disabled={currentIndex === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col">
            <span className="font-bold text-lg">{currentPiece?.piece?.title || 'No Music'}</span>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} of {music.length} - {eventTitle}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={nextPiece} disabled={currentIndex === music.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
           <Select
            value={currentIndex.toString()}
            onValueChange={(val) => setCurrentIndex(parseInt(val))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Jump to piece" />
            </SelectTrigger>
            <SelectContent>
              {music.map((m, idx) => (
                <SelectItem key={m.id} value={idx.toString()}>
                  {idx + 1}. {m.piece.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 bg-muted/20 relative overflow-hidden">
        {pdfFile ? (
          <iframe
            src={pdfFile.storageUrl || `/api/files/download/${pdfFile.storageKey}`}
            className="w-full h-full border-none"
            title={currentPiece.piece.title}
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
