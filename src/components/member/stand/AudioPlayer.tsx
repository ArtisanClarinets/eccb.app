'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useStandStore } from '@/store/standStore';

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTime = () => {
      setProgress(audio.currentTime);
      if (
        audioLoopEnd !== null &&
        audio.currentTime >= audioLoopEnd &&
        audioLoopStart !== null
      ) {
        audio.currentTime = audioLoopStart;
      }
    };
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('play', () => setAudioPlaying(true));
    audio.addEventListener('pause', () => setAudioPlaying(false));
    return () => {
      audio.removeEventListener('timeupdate', handleTime);
    };
  }, [audioLoopStart, audioLoopEnd, setAudioPlaying]);

  const currentLink = audioLinks.find((l) => l.id === selectedAudioLinkId) || audioLinks[0];

  if (!showAudioPlayer || !currentLink) return null;

  return (
    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-card p-4 z-50 rounded shadow-lg">
      <select
        value={currentLink.id}
        onChange={(e) => selectAudioLink(e.target.value)}
      >
        {audioLinks.map((l) => (
          <option key={l.id} value={l.id}>
            {l.description || l.fileKey}
          </option>
        ))}
      </select>
      <audio
        ref={audioRef}
        src={currentLink.url || ''}
        controls
        className="w-full mt-2"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => {
            const a = audioRef.current;
            if (a) {
              setAudioLoopPoints(a.currentTime, null);
            }
          }}
        >
          Set A
        </button>
        <button
          onClick={() => {
            const a = audioRef.current;
            if (a) {
              setAudioLoopPoints(audioLoopStart, a.currentTime);
            }
          }}
        >
          Set B
        </button>
      </div>
      <div>Progress: {progress.toFixed(1)}</div>
    </div>
  );
}
