'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStandStore } from '@/store/standStore';

const LOOP_STORAGE_KEY = (pieceId: string) => `eccb_abloop_${pieceId}`;

export function AudioPlayer() {
  const {
    audioLinks,
    selectedAudioLinkId,
    selectAudioLink,
    audioLoopStart,
    audioLoopEnd,
    setAudioLoopPoints,
    setAudioPlaying,
    audioPlaying: _audioPlaying,
    showAudioPlayer,
  } = useStandStore();

  const currentPieceId = useStandStore((s) => s.pieces[s.currentPieceIndex]?.id);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Restore A-B loop points from localStorage when piece changes
  useEffect(() => {
    if (!currentPieceId) return;
    try {
      const saved = localStorage.getItem(LOOP_STORAGE_KEY(currentPieceId));
      if (saved) {
        const { start, end } = JSON.parse(saved) as { start: number | null; end: number | null };
        setAudioLoopPoints(start ?? null, end ?? null);
      } else {
        // Clear loop points for a new piece
        setAudioLoopPoints(null, null);
      }
    } catch {
      // ignore parse errors
    }
  }, [currentPieceId, setAudioLoopPoints]);

  // Persist A-B loop points to localStorage whenever they change
  useEffect(() => {
    if (!currentPieceId) return;
    try {
      localStorage.setItem(
        LOOP_STORAGE_KEY(currentPieceId),
        JSON.stringify({ start: audioLoopStart, end: audioLoopEnd })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [audioLoopStart, audioLoopEnd, currentPieceId]);

  const setA = useCallback(() => {
    const a = audioRef.current;
    if (a) setAudioLoopPoints(a.currentTime, audioLoopEnd);
  }, [audioLoopEnd, setAudioLoopPoints]);

  const setB = useCallback(() => {
    const a = audioRef.current;
    if (a) setAudioLoopPoints(audioLoopStart, a.currentTime);
  }, [audioLoopStart, setAudioLoopPoints]);

  const clearLoop = useCallback(() => {
    setAudioLoopPoints(null, null);
  }, [setAudioLoopPoints]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => {
      setProgress(audio.currentTime);
      // Loop enforcement
      if (audioLoopEnd !== null && audio.currentTime >= audioLoopEnd && audioLoopStart !== null) {
        audio.currentTime = audioLoopStart;
      }
    };
    const handleMeta = () => setDuration(audio.duration || 0);
    const handlePlay = () => setAudioPlaying(true);
    const handlePause = () => setAudioPlaying(false);

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('loadedmetadata', handleMeta);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('loadedmetadata', handleMeta);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioLoopStart, audioLoopEnd, setAudioPlaying]);

  const currentLink = audioLinks.find((l) => l.id === selectedAudioLinkId) || audioLinks[0];

  if (!showAudioPlayer || !currentLink) return null;

  const loopActive = audioLoopStart !== null && audioLoopEnd !== null;
  const fmtTime = (t: number) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card p-4 z-50 rounded shadow-lg w-72 select-none text-sm">
      {audioLinks.length > 1 && (
        <select
          value={currentLink.id}
          onChange={(e) => selectAudioLink(e.target.value)}
          className="w-full border rounded px-1 py-0.5 bg-background mb-2 text-xs"
        >
          {audioLinks.map((l) => (
            <option key={l.id} value={l.id}>
              {l.description || l.fileKey}
            </option>
          ))}
        </select>
      )}

      <audio
        ref={audioRef}
        src={currentLink.url || ''}
        controls
        className="w-full mt-1"
      />

      {/* Progress / duration */}
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{fmtTime(progress)}</span>
        <span>{duration > 0 ? fmtTime(duration) : '--:--'}</span>
      </div>

      {/* A-B loop controls */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={setA}
          title="Set loop start"
          className="flex-1 px-2 py-1 border rounded text-xs hover:bg-muted transition-colors"
        >
          {audioLoopStart !== null ? `A: ${fmtTime(audioLoopStart)}` : 'Set A'}
        </button>
        <button
          onClick={setB}
          title="Set loop end"
          className="flex-1 px-2 py-1 border rounded text-xs hover:bg-muted transition-colors"
        >
          {audioLoopEnd !== null ? `B: ${fmtTime(audioLoopEnd)}` : 'Set B'}
        </button>
        {loopActive && (
          <button
            onClick={clearLoop}
            title="Clear A-B loop"
            className="px-2 py-1 border rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {loopActive && (
        <div className="text-xs text-center text-primary mt-1">
          Looping {fmtTime(audioLoopStart!)} → {fmtTime(audioLoopEnd!)}
        </div>
      )}
    </div>
  );
}

