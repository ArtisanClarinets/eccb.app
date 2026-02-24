'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStandStore } from '@/store/standStore';

// simple type for the built-in actions we support
export type MidiAction =
  | 'nextPageOrPiece'
  | 'prevPageOrPiece'
  | 'toggleGigMode'
  | 'toggleNightMode'
  | 'toggleMetronome'
  | 'toggleTuner'
  | 'toggleAudioPlayer'
  | 'togglePitchPipe';

function messageToKey(data: Uint8Array): string {
  // use status byte and first data byte as a key
  return `${data[0]}-${data[1]}`;
}

/**
 * Check if Web MIDI API is supported
 */
function isWebMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/**
 * MidiHandler - Handles MIDI device connections and mappings for the digital music stand
 * 
 * Features:
 * - Auto-detects MIDI devices
 * - Maps MIDI messages to stand actions
 * - Hides UI when Web MIDI is not supported
 * 
 * Accessibility:
 * - Provides ARIA labels for all controls
 * - Announces device connections to screen readers
 */
export function MidiHandler() {
  const store = useStandStore();
  const { midiMappings, setMidiMappings: _setMidiMappings } = store;
  const [inputs, setInputs] = useState<Array<{ id: string; name: string; input: MIDIInput }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Check Web MIDI support on mount
  useEffect(() => {
    setIsSupported(isWebMidiSupported());
  }, []);

  useEffect(() => {
    if (!isWebMidiSupported()) {
      return;
    }

    let access: MIDIAccess;

    setConnectionStatus('connecting');
    
    navigator
      .requestMIDIAccess()
      .then((m) => {
        access = m;
        setConnectionStatus('connected');
        
        const update = () => {
          const ins: Array<{ id: string; name: string; input: MIDIInput }> = [];
          m.inputs.forEach((inp) => {
            ins.push({ id: inp.id, name: inp.name || 'Unknown device', input: inp });
          });
          setInputs(ins);
          if (ins.length && !selectedId) {
            setSelectedId(ins[0].id);
          }
        };
        update();
        m.onstatechange = () => {
          update();
        };
      })
      .catch((err) => {
        console.error('[MidiHandler] failed to get MIDI access', err);
        setConnectionStatus('error');
      });

    return () => {
      if (access) {
        access.onstatechange = null;
      }
    };
  }, [selectedId]);

  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      if (!event.data) return;
      const key = messageToKey(event.data);
      const action = midiMappings[key];
      if (action) {
        // perform action directly
        switch (action as MidiAction) {
          case 'nextPageOrPiece':
            store.nextPageOrPiece();
            break;
          case 'prevPageOrPiece':
            store.prevPageOrPiece();
            break;
          case 'toggleGigMode':
            store.toggleGigMode();
            break;
          case 'toggleNightMode':
            store.toggleNightMode();
            break;
          case 'toggleMetronome':
            store.toggleMetronome();
            break;
          case 'toggleTuner':
            store.toggleTuner();
            break;
          case 'toggleAudioPlayer':
            store.toggleAudioPlayer();
            break;
          case 'togglePitchPipe':
            store.togglePitchPipe();
            break;
          default:
            console.warn('[MidiHandler] unknown action', action);
        }
      }
    },
    [midiMappings, store]
  );

  // attach listener when selectedId changes
  useEffect(() => {
    // clear all previous handlers
    inputs.forEach((i) => {
      i.input.onmidimessage = null;
    });
    if (selectedId) {
      const sel = inputs.find((i) => i.id === selectedId);
      if (sel) {
        sel.input.onmidimessage = handleMidiMessage;
      }
    }
  }, [selectedId, inputs, handleMidiMessage]);

  // Don't render anything if Web MIDI is not supported
  if (!isSupported) {
    return null;
  }

  return (
    <div 
      className="midi-handler"
      role="region"
      aria-label="MIDI device settings"
    >
      {/* Screen reader announcement for connection status */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {connectionStatus === 'connected' && inputs.length > 0 && 
          `MIDI connected. ${inputs.length} device${inputs.length > 1 ? 's' : ''} available.`}
        {connectionStatus === 'error' && 
          'MIDI connection failed. Please check your device and browser permissions.'}
      </div>

      {inputs.length > 0 && (
        <div className="p-2 text-sm">
          <label htmlFor="midi-device" className="mr-2">
            MIDI Device:
          </label>
          <select
            id="midi-device"
            value={selectedId || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Select MIDI device"
            className="min-h-[44px] px-2 border rounded"
          >
            {inputs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Show message when no devices are connected */}
      {connectionStatus === 'connected' && inputs.length === 0 && (
        <div className="p-2 text-sm text-muted-foreground" role="status">
          No MIDI devices detected. Connect a device to use MIDI controls.
        </div>
      )}
      
      {/* mapping listing - read-only */}
      {Object.keys(midiMappings).length > 0 && (
        <div className="p-2 text-xs" role="list" aria-label="Active MIDI mappings">
          <strong>Mappings:</strong>
          <ul>
            {Object.entries(midiMappings).map(([k, a]) => (
              <li key={k} role="listitem">
                {k} → {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

MidiHandler.displayName = 'MidiHandler';

export default MidiHandler;
