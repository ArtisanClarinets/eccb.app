'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';

// simple zero-crossing based pitch estimate
export function detectPitch(data: Float32Array, sampleRate: number): number {
  const size = data.length;
  let crossings = 0;
  for (let i = 1; i < size; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) crossings++;
  }
  if (crossings === 0) return -1;
  const duration = size / sampleRate;
  const freq = crossings / (2 * duration); // two crossings per cycle
  return freq;
}

// convert frequency to nearest note name
export function frequencyToNote(freq: number): { note: string; cents: number } {
  if (freq <= 0) return { note: '', cents: 0 };
  const A4 = 440;
  const semitone = 69 + 12 * Math.log2(freq / A4);
  const noteNum = Math.round(semitone);
  const cents = (semitone - noteNum) * 100;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = noteNames[(noteNum + 12) % 12] + Math.floor(noteNum / 12 - 1);
  return { note: name, cents };
}

export function Tuner() {
  const { tunerSettings, updateTunerSettings, showTuner } = useStandStore();
  const [note, setNote] = useState('');
  const [cents, setCents] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!showTuner) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Tuner: mediaDevices API not available');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;
        dataRef.current = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (analyserRef.current && dataRef.current) {
            analyserRef.current.getFloatTimeDomainData(dataRef.current as Float32Array<ArrayBuffer>);
            const freq = detectPitch(dataRef.current, ctx.sampleRate);
            const res = frequencyToNote(freq);
            setNote(res.note);
            setCents(res.cents);
          }
          requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(console.error);
  }, [showTuner]);

  if (!showTuner) return null;

  return (
    <div className="absolute top-2 left-2 bg-card p-4 z-50 rounded shadow-lg">
      <div>Note: {note}</div>
      <div>Cents: {cents.toFixed(1)}</div>
      <label>
        <input
          type="checkbox"
          checked={tunerSettings.mute}
          onChange={(e) => {
            updateTunerSettings({ mute: e.target.checked });
            fetch('/api/stand/preferences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tunerSettings: { mute: e.target.checked } }),
            }).catch(console.error);
          }}
        />
        Mute output
      </label>
    </div>
  );
}
