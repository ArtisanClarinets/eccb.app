'use client';

/**
 * AudioLinkEditor — manages audio links for a piece.
 * Directors / librarians can add and remove audio links.
 * Members can only view (play) them.
 *
 * Features:
 *   - List audio links (file key or URL)
 *   - Add a new audio link (director/librarian only)
 *   - Delete an audio link (director/librarian only)
 *   - Inline audio player via <audio> tag
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MusicIcon,
  PlusIcon,
  Trash2Icon,
  PlayCircleIcon,
  PauseCircleIcon,
  Loader2,
  RefreshCw,
  LinkIcon,
  HardDriveIcon,
  XIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface AudioLink {
  id: string;
  pieceId: string;
  fileKey: string | null;
  url: string | null;
  description: string | null;
  createdAt: string;
}

export interface AudioLinkEditorProps {
  className?: string;
  pieceId: string;
  /** If true, show add/delete controls */
  canManage?: boolean;
}

function resolveAudioSrc(link: AudioLink): string {
  if (link.url) return link.url;
  if (link.fileKey) return `/api/stand/audio-files/${encodeURIComponent(link.fileKey)}`;
  return '';
}

function LinkLabel({ link }: { link: AudioLink }) {
  const label = link.description ?? link.fileKey ?? link.url ?? 'Audio';
  const isExternal = !!link.url && !link.fileKey;
  return (
    <span className="flex items-center gap-1 text-sm font-medium truncate" title={label}>
      {isExternal ? (
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <HardDriveIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      {label}
    </span>
  );
}

function InlinePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setError(true);
      }
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Audio player - captions not applicable for externally-linked audio files */}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? 'Pause' : 'Play'}
        title={error ? 'Audio unavailable' : playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <PauseCircleIcon className="h-4 w-4 text-primary" />
        ) : (
          <PlayCircleIcon className={cn('h-4 w-4', error ? 'opacity-30' : '')} />
        )}
      </Button>
    </div>
  );
}

export function AudioLinkEditor({ className, pieceId, canManage = false }: AudioLinkEditorProps) {
  const [links, setLinks] = useState<AudioLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Form state
  const [addMode, setAddMode] = useState<'file' | 'url'>('url');
  const [addFileKey, setAddFileKey] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stand/audio?pieceId=${encodeURIComponent(pieceId)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setLinks(Array.isArray(data.audioLinks) ? data.audioLinks : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio links');
    } finally {
      setIsLoading(false);
    }
  }, [pieceId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const body: Record<string, unknown> = {
      pieceId,
      fileKey: addMode === 'file' ? addFileKey.trim() : '',
      url: addMode === 'url' ? addUrl.trim() : null,
      description: addDescription.trim() || undefined,
    };
    if (!body.fileKey && !body.url) {
      setSaveError('Provide a file key or a URL.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/stand/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Status ${res.status}`);
      }
      setAddFileKey('');
      setAddUrl('');
      setAddDescription('');
      setShowAddDialog(false);
      await fetchLinks();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add audio link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    setDeletingId(linkId);
    try {
      const res = await fetch(`/api/stand/audio/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      console.error('Delete audio link failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <MusicIcon className="h-4 w-4" />
          Reference Audio
          {links.length > 0 && (
            <Badge variant="secondary" className="ml-1">{links.length}</Badge>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchLinks}
            disabled={isLoading}
            aria-label="Refresh audio links"
            title="Refresh"
            className="h-7 w-7"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAddDialog(true)}
              aria-label="Add audio link"
              title="Add audio link"
              className="h-7 w-7"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading…
        </div>
      )}

      {/* Error */}
      {error && !isLoading && <p className="text-xs text-destructive">{error}</p>}

      {/* Empty */}
      {!isLoading && !error && links.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">
          {canManage
            ? 'No audio links yet. Add one with the + button.'
            : 'No reference audio for this piece.'}
        </p>
      )}

      {/* Link list */}
      {!isLoading && links.length > 0 && (
        <ul className="space-y-1" aria-label="Audio links">
          {links.map((link) => {
            const src = resolveAudioSrc(link);
            return (
              <li
                key={link.id}
                className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/40 transition-colors"
              >
                <InlinePlayer src={src} />
                <div className="flex-1 min-w-0">
                  <LinkLabel link={link} />
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    aria-label="Delete audio link"
                    title="Delete"
                  >
                    {deletingId === link.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2Icon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setAddFileKey('');
            setAddUrl('');
            setAddDescription('');
            setSaveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Audio Link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
              <Button
                type="button"
                variant={addMode === 'url' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setAddMode('url')}
                className="h-7"
              >
                <LinkIcon className="h-3.5 w-3.5 mr-1" />
                URL
              </Button>
              <Button
                type="button"
                variant={addMode === 'file' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setAddMode('file')}
                className="h-7"
              >
                <HardDriveIcon className="h-3.5 w-3.5 mr-1" />
                File key
              </Button>
            </div>

            {addMode === 'url' ? (
              <div className="space-y-2">
                <Label htmlFor="audio-url">Audio URL</Label>
                <Input
                  id="audio-url"
                  type="url"
                  placeholder="https://example.com/track.mp3"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="audio-filekey">Storage file key</Label>
                <Input
                  id="audio-filekey"
                  placeholder="audio/2026/piece-123.mp3"
                  value={addFileKey}
                  onChange={(e) => setAddFileKey(e.target.value)}
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Object key in the platform&apos;s file storage (MinIO/S3).
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="audio-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="audio-desc"
                placeholder="e.g. Reference recording – Mvt. I"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                maxLength={200}
              />
            </div>

            {saveError && <p className="text-xs text-destructive">{saveError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  <XIcon className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={isSaving || (addMode === 'url' ? !addUrl.trim() : !addFileKey.trim())}
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
