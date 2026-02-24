'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';

// exported for testing
export function scheduleClick(
  context: AudioContext,
  time: number,
  _bpm: number
): { oscillator: OscillatorNode; startTime: number } {
  const osc = context.createOscillator();
  osc.frequency.value = 1000;
  osc.connect(context.destination);
  osc.start(time);
  osc.stop(time + 0.05);
  return { oscillator: osc, startTime: time };
}

export function Metronome() {
  const { metronomeSettings, updateMetronomeSettings, showMetronome } = useStandStore();
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);

  useEffect(() => {
    if (!contextRef.current) {
      contextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      if (!contextRef.current) return;
      const context = contextRef.current;
      const interval = 60 / metronomeSettings.bpm / metronomeSettings.subdivision;
      const now = context.currentTime;
      while (nextBeatTimeRef.current < now + 0.1) {
        scheduleClick(context, nextBeatTimeRef.current, metronomeSettings.bpm);
        nextBeatTimeRef.current += interval;
        setFlash(true);
        setTimeout(() => setFlash(false), 100);
      }
      timer = window.setTimeout(schedule, 25);
    };
    if (running) {
      nextBeatTimeRef.current = contextRef.current!.currentTime;
      schedule();
    } else {
      if (timer) window.clearTimeout(timer);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [running, metronomeSettings]);

  const handleStartStop = () => {
    setRunning((r) => !r);
  };

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    updateMetronomeSettings({ [field]: value } as any);
    // persist preference
    fetch('/api/stand/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metronomeSettings: { ...metronomeSettings, [field]: value } }),
    }).catch(console.error);
  };

  if (!showMetronome) return null;

  return (
    <div className="absolute top-2 right-2 bg-card p-4 z-50 rounded shadow-lg metronome-container">
      <button onClick={handleStartStop} className="mb-2 px-2 py-1 bg-primary text-white rounded">
        {running ? 'Stop' : 'Start'}
      </button>
      <div className="flex items-center gap-2">
        <label>
          BPM
          <input
            type="range"
            min={30}
            max={240}
            value={metronomeSettings.bpm}
            onChange={handleChange('bpm')}
          />
        </label>
        <label>
          Num
          <input
            type="number"
            min={1}
            max={12}
            value={metronomeSettings.numerator}
            onChange={handleChange('numerator')}
            className="w-12"
          />
        </label>
        <label>
          Den
          <input
            type="number"
            min={1}
            max={16}
            value={metronomeSettings.denominator}
            onChange={handleChange('denominator')}
            className="w-12"
          />
        </label>
      </div>
      <div className={flash ? 'metronome-flash' : ''} />
    </div>
  );
}
