'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MusicLibraryTable, type MusicPieceWithRelations } from '@/components/admin/MusicLibraryTable';
import { toast } from 'sonner';

interface RealTimeMusicLibraryProps {
  initialPieces: MusicPieceWithRelations[];
  difficultyColors: Record<string, string>;
  difficultyLabels: Record<string, string>;
  onPiecesChange?: () => void;
}

/**
 * Real-time wrapper for MusicLibraryTable that automatically refreshes
 * when music pieces are created, modified, or deleted.
 * 
 * Uses SSE for server-sent events and falls back to periodic polling.
 */
export function RealTimeMusicLibrary({
  initialPieces,
  difficultyColors,
  difficultyLabels,
  onPiecesChange,
}: RealTimeMusicLibraryProps) {
  const router = useRouter();

  // Refresh the music list from the server
  const refreshMusicList = useCallback(async () => {
    try {
      // Use router.refresh() to refresh server data
      router.refresh();
      onPiecesChange?.();
    } catch (error) {
      console.error('Failed to refresh music list:', error);
      toast.error('Failed to refresh music library');
    }
  }, [router, onPiecesChange]);

  // Set up SSE for real-time updates
  useEffect(() => {
    const connectSSE = () => {
      try {
        const eventSource = new EventSource('/api/admin/music/events');

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              console.log('Connected to music events stream');
            } else if (data.type === 'music-created' || data.type === 'music-updated' || data.type === 'music-archived' || data.type === 'music-deleted') {
              // Refresh the music list when any change occurs
              void refreshMusicList();
              toast.success(`Music library updated`);
            } else if (data.type === 'heartbeat') {
              // Keep the connection alive
              console.debug('Music events heartbeat');
            }
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        eventSource.onerror = () => {
          console.warn('SSE connection lost, falling back to polling');
          eventSource.close();
          // Fall back to polling every 5 seconds
          const pollInterval = setInterval(() => {
            void refreshMusicList();
          }, 5000);

          return () => clearInterval(pollInterval);
        };

        return () => eventSource.close();
      } catch (error) {
        console.error('Failed to connect to SSE:', error);
        // Fall back to polling
        const pollInterval = setInterval(() => {
          void refreshMusicList();
        }, 5000);
        return () => clearInterval(pollInterval);
      }
    };

    const cleanup = connectSSE();
    return () => {
      if (cleanup) cleanup();
    };
  }, [refreshMusicList]);

  return (
    <MusicLibraryTable
      pieces={initialPieces}
      difficultyColors={difficultyColors}
      difficultyLabels={difficultyLabels}
      onPiecesChange={refreshMusicList}
    />
  );
}
