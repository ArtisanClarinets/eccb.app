'use client';

import React from 'react';
import { useStandStore } from '@/store/standStore';

export function PitchPipe() {
  const { showPitchPipe, pitchPipeSettings, updatePitchPipeSettings } = useStandStore();

  const notes = [] as { name: string; freq: number }[];
  const startFreq = 261.63; // C4
  for (let i = 0; i < 24; i++) {
    const freq = startFreq * Math.pow(2, i / 12);
    const octave = 4 + Math.floor(i / 12);
    const semitone = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][i % 12];
    notes.push({ name: `${semitone}${octave}`, freq });
  }

  const playTone = (freq: number) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = pitchPipeSettings.instrument;
    osc.frequency.value = freq;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  };

  if (!showPitchPipe) return null;

  return (
    <div className="absolute bottom-2 right-2 bg-card p-4 z-50 rounded shadow-lg">
      <select
        value={pitchPipeSettings.instrument}
        onChange={(e) => {
          updatePitchPipeSettings({ instrument: e.target.value as any });
          fetch('/api/stand/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pitchPipeSettings: { instrument: e.target.value } }),
          }).catch(console.error);
        }}
      >
        {['sine', 'square', 'triangle', 'sawtooth'].map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-6 gap-1 mt-2">
        {notes.map((n) => (
          <button key={n.name} onClick={() => playTone(n.freq)} className="p-1 border">
            {n.name}
          </button>
        ))}
      </div>
    </div>
  );
}
