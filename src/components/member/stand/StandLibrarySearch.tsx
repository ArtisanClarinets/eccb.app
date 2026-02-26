'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Music, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LibraryPiece {
  id: string;
  title: string;
  composer: string | null;
  hasPdf: boolean;
}

interface StandLibrarySearchProps {
  pieces: LibraryPiece[];
}

/**
 * Client-side searchable library browser for the Stand Hub.
 * Lets members find and open any piece for personal practice.
 */
export function StandLibrarySearch({ pieces }: StandLibrarySearchProps) {
  const [query, setQuery] = useState('');

  const filtered =
    query.trim().length === 0
      ? pieces
      : pieces.filter(
          (p) =>
            p.title.toLowerCase().includes(query.toLowerCase()) ||
            (p.composer ?? '').toLowerCase().includes(query.toLowerCase())
        );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by title or composer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search music library"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Music className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No pieces match &ldquo;{query}&rdquo;</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((piece) => (
          <Card
            key={piece.id}
            className={cn(
              'transition-colors',
              piece.hasPdf
                ? 'hover:border-teal-400 cursor-pointer'
                : 'opacity-60'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-tight truncate">{piece.title}</p>
                  {piece.composer && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{piece.composer}</p>
                  )}
                  {!piece.hasPdf && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      No PDF
                    </Badge>
                  )}
                </div>

                {piece.hasPdf ? (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/member/stand/library/${piece.id}`}>
                      <BookOpen className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="shrink-0">
                    <BookOpen className="h-3.5 w-3.5 opacity-40" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} of {pieces.length} piece{pieces.length !== 1 ? 's' : ''} in library
      </p>
    </div>
  );
}

StandLibrarySearch.displayName = 'StandLibrarySearch';
