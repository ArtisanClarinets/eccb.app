'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';

/**
 * Autocorrelation-based pitch detection (YIN-inspired).
 * Much more accurate than zero-crossing for musical instruments.
 * Returns frequency in Hz, or -1 when no pitch detected.
 */
export function detectPitch(data: Float32Array, sampleRate: number): number {
  const n = data.length;

  // RMS energy gate — ignore silence
  let rms = 0;
  for (let i = 0; i < n; i++) rms += data[i] * data[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.015) return -1;

  // Search range: 60 Hz (low bass) to 3 000 Hz (piccolo top register)
  const minLag = Math.floor(sampleRate / 3000);
  const maxLag = Math.min(Math.floor(sampleRate / 60), n - 1);

  // Compute unnormalised autocorrelation for each candidate lag
  let bestLag = -1;
  let bestVal = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const len = n - lag;
    for (let i = 0; i < len; i++) {
      sum += data[i] * data[i + lag];
    }
    if (sum > bestVal) {
      bestVal = sum;
      bestLag = lag;
    }
  }

  // Reject weak correlations (too noisy)
  if (bestLag < 1 || bestVal < 0.005) return -1;

  // Sub-sample refinement using parabolic interpolation for improved accuracy
  const prev = bestLag > 1
    ? (() => {
        let s = 0;
        const l = n - (bestLag - 1);
        for (let i = 0; i < l; i++) s += data[i] * data[i + bestLag - 1];
        return s;
      })()
    : 0;
  const next = bestLag < maxLag
    ? (() => {
        let s = 0;
        const l = n - (bestLag + 1);
        for (let i = 0; i < l; i++) s += data[i] * data[i + bestLag + 1];
        return s;
      })()
    : 0;

  const denom = 2 * bestVal - prev - next;
  const refinedLag = denom === 0 ? bestLag : bestLag - (next - prev) / (2 * denom);

  return sampleRate / refinedLag;
}

/** Map a frequency to the nearest musical note name + cents deviation. */
export function frequencyToNote(freq: number): { note: string; cents: number } {
  if (freq <= 0) return { note: '', cents: 0 };
  const A4 = 440;
  const semitone = 69 + 12 * Math.log2(freq / A4);
  const noteNum = Math.round(semitone);
  const cents = Math.round((semitone - noteNum) * 100);
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(noteNum / 12) - 1;
  const name = noteNames[((noteNum % 12) + 12) % 12];
  return { note: `${name}${octave}`, cents };
}

export function Tuner() {
  const { tunerSettings, updateTunerSettings, showTuner } = useStandStore();
  const [note, setNote] = useState('');
  const [cents, setCents] = useState(0);
  const [freq, setFreq] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sampleRateRef = useRef(44100);

  useEffect(() => {
    if (!showTuner) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('Tuner: getUserMedia not available');
      return;
    }

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
      .then((s) => {
        stream = s;
        ctx = new (window.AudioContext ||
          (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        sampleRateRef.current = ctx.sampleRate;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096; // larger buffer = better low-frequency resolution
        analyser.smoothingTimeConstant = 0; // no smoothing — we want raw signal
        source.connect(analyser);
        analyserRef.current = analyser;

        const buf = new Float32Array(analyser.fftSize);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getFloatTimeDomainData(buf);
          const f = detectPitch(buf, sampleRateRef.current);
          if (f > 0) {
            const res = frequencyToNote(f);
            setNote(res.note);
            setCents(res.cents);
            setFreq(Math.round(f * 10) / 10);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(console.error);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      analyserRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [showTuner]);

  if (!showTuner) return null;

  // Cents dial: -50 to +50, fill arc shows deviation
  const dialPercent = Math.max(-50, Math.min(50, cents)) / 50; // -1 to 1
  const inTune = Math.abs(cents) <= 5;

  return (
    <div className="absolute top-2 left-2 bg-card p-4 z-50 rounded shadow-lg w-44 select-none">
      <div className="text-xs text-muted-foreground text-center mb-1">Tuner</div>

      {/* Note display */}
      <div className="text-3xl font-bold text-center mb-1 font-mono">
        {note || '—'}
      </div>
      <div className="text-xs text-center text-muted-foreground mb-2">
        {freq > 0 ? `${freq} Hz` : '—'}
      </div>

      {/* Cents gauge */}
      <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-1">
        {/* Center tick */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
        {/* Deviation bar */}
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-75"
          style={{
            width: `${Math.abs(dialPercent) * 50}%`,
            left: dialPercent < 0 ? `${(0.5 + dialPercent * 0.5) * 100}%` : '50%',
            backgroundColor: inTune ? '#22c55e' : '#ef4444',
          }}
        />
      </div>
      <div
        className="text-xs text-center font-mono"
        style={{ color: inTune ? '#22c55e' : '#ef4444' }}
      >
        {cents > 0 ? `+${cents}¢` : cents < 0 ? `${cents}¢` : '± 0¢'}
      </div>

      <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer">
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
