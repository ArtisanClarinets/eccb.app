'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';

/**
 * Schedule a single metronome click.
 * Beat 1 (accent) plays at 1200 Hz; all other beats play at 800 Hz.
 * Returns the OscillatorNode for testing.
 */
export function scheduleClick(
  context: AudioContext,
  time: number,
  isAccent: boolean
): OscillatorNode {
  const osc = context.createOscillator();
  const gainNode = context.createGain();

  osc.type = 'square';
  osc.frequency.value = isAccent ? 1200 : 800;

  // Fast attack, exponential decay envelope
  gainNode.gain.setValueAtTime(isAccent ? 0.7 : 0.4, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

  osc.connect(gainNode);
  gainNode.connect(context.destination);
  osc.start(time);
  osc.stop(time + 0.07);
  return osc;
}

export function Metronome() {
  const { metronomeSettings, updateMetronomeSettings, showMetronome } = useStandStore();
  const [running, setRunning] = useState(false);
  const [beatFlash, setBeatFlash] = useState<'accent' | 'normal' | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);
  const beatCounterRef = useRef(0); // 0-based beat within measure

  const getContext = (): AudioContext => {
    if (!contextRef.current) {
      contextRef.current = new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return contextRef.current;
  };

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const context = contextRef.current;
      if (!context) return;

      const subdivision = metronomeSettings.subdivision ?? 1;
      const interval = 60 / metronomeSettings.bpm / subdivision;
      const lookahead = 0.1; // seconds look-ahead
      const now = context.currentTime;

      while (nextBeatTimeRef.current < now + lookahead) {
        const isAccent = beatCounterRef.current === 0;
        scheduleClick(context, nextBeatTimeRef.current, isAccent);

        const msAhead = Math.max(0, (nextBeatTimeRef.current - now) * 1000);
        setTimeout(() => {
          setBeatFlash(isAccent ? 'accent' : 'normal');
          setTimeout(() => setBeatFlash(null), isAccent ? 120 : 80);
        }, msAhead);

        nextBeatTimeRef.current += interval;
        beatCounterRef.current =
          (beatCounterRef.current + 1) % (metronomeSettings.numerator || 4);
      }

      timerId = setTimeout(schedule, 25);
    };

    if (running) {
      const ctx = getContext();
      ctx.resume().then(() => {
        nextBeatTimeRef.current = ctx.currentTime;
        beatCounterRef.current = 0;
        schedule();
      });
    }

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [running, metronomeSettings]);

  const handleStartStop = () => {
    getContext();
    setRunning((r) => !r);
  };

  const handleChange =
    (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (isNaN(value)) return;
      updateMetronomeSettings({ [field]: value } as Parameters<typeof updateMetronomeSettings>[0]);
      fetch('/api/stand/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metronomeSettings: { ...metronomeSettings, [field]: value } }),
      }).catch(console.error);
    };

  if (!showMetronome) return null;

  return (
    <div className="absolute top-2 right-2 bg-card p-4 z-50 rounded shadow-lg metronome-container select-none">
      {/* Beat indicator: bright on accent, dim on sub-beat */}
      <div
        className="w-8 h-8 rounded-full mb-2 mx-auto transition-colors duration-75"
        style={{
          backgroundColor:
            beatFlash === 'accent'
              ? 'hsl(var(--primary))'
              : beatFlash === 'normal'
                ? 'hsl(var(--muted-foreground) / 0.5)'
                : 'hsl(var(--muted) / 0.3)',
        }}
        aria-label="Beat indicator"
      />

      <button
        onClick={handleStartStop}
        className="w-full mb-3 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium"
      >
        {running ? 'Stop' : 'Start'}
      </button>

      <div className="space-y-2 text-sm">
        <label className="flex items-center justify-between gap-2">
          <span>BPM: {metronomeSettings.bpm}</span>
          <input
            type="range"
            min={30}
            max={240}
            value={metronomeSettings.bpm}
            onChange={handleChange('bpm')}
            className="w-28"
          />
        </label>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <span>Beats</span>
            <input
              type="number"
              min={1}
              max={12}
              value={metronomeSettings.numerator}
              onChange={handleChange('numerator')}
              className="w-12 border rounded px-1 py-0.5 text-center bg-background"
            />
          </label>
          <span className="text-muted-foreground">/</span>
          <label className="flex items-center gap-1">
            <span>Note</span>
            <input
              type="number"
              min={1}
              max={16}
              value={metronomeSettings.denominator}
              onChange={handleChange('denominator')}
              className="w-12 border rounded px-1 py-0.5 text-center bg-background"
            />
          </label>
        </div>

        <label className="flex items-center justify-between gap-2">
          <span>Sub-div</span>
          <select
            value={metronomeSettings.subdivision ?? 1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              updateMetronomeSettings({ subdivision: val } as Parameters<typeof updateMetronomeSettings>[0]);
            }}
            className="border rounded px-1 py-0.5 bg-background text-sm"
          >
            <option value={1}>Quarter note</option>
            <option value={2}>Eighth note</option>
            <option value={3}>Triplet</option>
            <option value={4}>Sixteenth</option>
          </select>
        </label>
      </div>
    </div>
  );
}
