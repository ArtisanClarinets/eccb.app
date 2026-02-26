'use client';

import React, { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Trash2,
  GripVertical,
  Music,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { addMusicToEvent, removeMusicFromEvent, reorderEventMusic } from '@/app/(admin)/admin/events/actions';

interface EventMusic {
  id: string;
  sortOrder: number;
  piece: {
    id: string;
    title: string;
    composer: string | null;
    hasPdf: boolean;
  };
}

interface LibraryPiece {
  id: string;
  title: string;
  composer: string | null;
}

interface EventMusicManagerProps {
  eventId: string;
  eventMusic: EventMusic[];
  library: LibraryPiece[];
}

export function EventMusicManager({ eventId, eventMusic: initial, library }: EventMusicManagerProps) {
  const [program, setProgram] = useState(initial);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // IDs already in the program
  const addedPieceIds = new Set(program.map((em) => em.piece.id));

  // Filter library to show pieces not already in the program
  const filteredLibrary = library.filter(
    (p) =>
      !addedPieceIds.has(p.id) &&
      (searchQuery.trim() === '' ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.composer ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
  );

  function handleAdd(piece: LibraryPiece) {
    startTransition(async () => {
      const result = await addMusicToEvent(eventId, piece.id, program.length);
      if (result.success) {
        // Optimistic update
        setProgram((prev) => [
          ...prev,
          {
            id: `optimistic-${Date.now()}`,
            sortOrder: prev.length,
            piece: { id: piece.id, title: piece.title, composer: piece.composer, hasPdf: false },
          },
        ]);
        toast.success(`Added "${piece.title}" to program`);
      } else {
        toast.error(result.error ?? 'Failed to add piece');
      }
    });
  }

  function handleRemove(em: EventMusic) {
    startTransition(async () => {
      const result = await removeMusicFromEvent(eventId, em.id);
      if (result.success) {
        setProgram((prev) => prev.filter((p) => p.id !== em.id));
        toast.success(`Removed "${em.piece.title}"`);
      } else {
        toast.error(result.error ?? 'Failed to remove piece');
      }
    });
  }

  function move(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= program.length) return;
    const updated = [...program];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    // Re-assign sortOrder locally
    const reordered = updated.map((em, i) => ({ ...em, sortOrder: i }));
    setProgram(reordered);

    // Persist
    startTransition(async () => {
      const result = await reorderEventMusic(eventId, reordered.map((em) => em.id));
      if (!result.success) {
        toast.error('Failed to save order');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Current program */}
      <div>
        <h3 className="font-semibold mb-3 text-sm">
          Current Program
          {program.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {program.length} piece{program.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </h3>

        {program.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <Music className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No pieces in the program yet.</p>
            <p className="text-xs mt-1">Search and add pieces from the library below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {program.map((em, idx) => (
              <div
                key={em.id}
                className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-card"
              >
                {/* Position */}
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {idx + 1}
                </span>

                {/* Drag grip (visual only) */}
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{em.piece.title}</p>
                  {em.piece.composer && (
                    <p className="text-xs text-muted-foreground truncate">{em.piece.composer}</p>
                  )}
                </div>

                {em.piece.hasPdf && (
                  <CheckCircle2
                    className="h-4 w-4 text-green-500 shrink-0"
                    aria-label="Has PDF"
                  />
                )}

                {/* Reorder */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0 || isPending}
                    onClick={() => move(idx, idx - 1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === program.length - 1 || isPending}
                    onClick={() => move(idx, idx + 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => handleRemove(em)}
                  disabled={isPending}
                  aria-label={`Remove ${em.piece.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Library search */}
      <div>
        <h3 className="font-semibold mb-3 text-sm">Add from Library</h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search library…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredLibrary.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {searchQuery ? `No results for "${searchQuery}"` : 'All library pieces are in the program.'}
          </p>
        ) : (
          <div className="divide-y border rounded-lg max-h-72 overflow-y-auto">
            {filteredLibrary.map((piece) => (
              <div key={piece.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{piece.title}</p>
                  {piece.composer && (
                    <p className="text-xs text-muted-foreground truncate">{piece.composer}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAdd(piece)}
                  disabled={isPending}
                  className="shrink-0"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

EventMusicManager.displayName = 'EventMusicManager';
