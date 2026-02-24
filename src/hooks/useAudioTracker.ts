'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';

/**
 * Audio tracker settings for the AI/automation feature
 */
interface AudioTrackerConfig {
  enabled: boolean;
  sensitivity: number; // 0.0 - 1.0, threshold for detecting silence
  cooldownMs: number; // Minimum time between page turns
}

/**
 * Hook return type
 */
interface UseAudioTrackerReturn {
  isListening: boolean;
  isCalibrating: boolean;
  error: string | null;
  currentLevel: number;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  calibrate: () => void;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AudioTrackerConfig = {
  enabled: false,
  sensitivity: 0.5,
  cooldownMs: 3000,
};

/**
 * Audio analysis constants
 */
const _ANALYSIS_INTERVAL_MS = 100; // How often to analyze audio
const CALIBRATION_DURATION_MS = 2000; // Calibration period duration
const SILENCE_THRESHOLD_MULTIPLIER = 0.3; // Silence is 30% of calibrated baseline
const FFT_SIZE = 256;

/**
 * useAudioTracker - Client-side audio analysis for automatic page advancement
 *
 * This hook uses the Web Audio API to analyze microphone input and detect
 * when the section has finished playing (silence detection). When silence
 * is detected after a period of sound, it automatically advances to the
 * next page or piece.
 *
 * The hook includes:
 * - Calibration period to establish baseline audio levels
 * - RMS energy calculation for volume detection
 * - Cooldown period to prevent rapid page turns
 * - Configurable sensitivity threshold
 *
 * @returns UseAudioTrackerReturn - Control functions and state
 */
export function useAudioTracker(): UseAudioTrackerReturn {
  const { audioTrackerSettings, nextPageOrPiece } = useStandStore();

  // State
  const [isListening, setIsListening] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastAdvanceTimeRef = useRef<number>(0);
  const calibrationBaselineRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const silenceStartTimeRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);

  // Config from store settings
  const config: AudioTrackerConfig = {
    enabled: audioTrackerSettings?.enabled ?? DEFAULT_CONFIG.enabled,
    sensitivity: audioTrackerSettings?.sensitivity ?? DEFAULT_CONFIG.sensitivity,
    cooldownMs: audioTrackerSettings?.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
  };

  /**
   * Calculate RMS (Root Mean Square) energy from audio data
   * This gives us a measure of the average signal level
   */
  const calculateRMS = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  /**
   * Main audio analysis loop
   */
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) {
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);

    const rms = calculateRMS(dataArray);
    setCurrentLevel(rms);

    const now = audioContextRef.current.currentTime * 1000;
    const adjustedThreshold = calibrationBaselineRef.current * SILENCE_THRESHOLD_MULTIPLIER * (1 - config.sensitivity * 0.5);

    // Detect if we're in a "playing" state (above threshold)
    const isCurrentlyPlaying = rms > adjustedThreshold;

    // Track state transitions
    if (isCurrentlyPlaying) {
      wasPlayingRef.current = true;
      silenceStartTimeRef.current = null;
    } else if (wasPlayingRef.current) {
      // We were playing, now we're silent
      if (silenceStartTimeRef.current === null) {
        silenceStartTimeRef.current = now;
      }

      // Check if we've been silent long enough (500ms grace period)
      const silenceDuration = now - silenceStartTimeRef.current;
      if (silenceDuration > 500) {
        // Check cooldown
        const timeSinceLastAdvance = now - lastAdvanceTimeRef.current;
        if (timeSinceLastAdvance >= config.cooldownMs) {
          // Advance to next page/piece
          lastAdvanceTimeRef.current = now;
          nextPageOrPiece();
          wasPlayingRef.current = false;
          silenceStartTimeRef.current = null;
        }
      }
    }

    // Continue analysis loop
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [calculateRMS, config.cooldownMs, config.sensitivity, nextPageOrPiece]);

  /**
   * Calibration routine - samples ambient audio for baseline
   */
  const calibrate = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) {
      return;
    }

    setIsCalibrating(true);
    calibrationSamplesRef.current = [];

    const analyser = analyserRef.current;
    const startTime = audioContextRef.current.currentTime * 1000;
    const calibrationDuration = CALIBRATION_DURATION_MS;

    const collectSample = () => {
      if (!audioContextRef.current) {
        setIsCalibrating(false);
        return;
      }

      const now = audioContextRef.current.currentTime * 1000;
      if (now - startTime >= calibrationDuration) {
        // Calculate baseline from collected samples
        if (calibrationSamplesRef.current.length > 0) {
          const avg = calibrationSamplesRef.current.reduce((a, b) => a + b, 0) / calibrationSamplesRef.current.length;
          calibrationBaselineRef.current = avg;
        }
        setIsCalibrating(false);
        return;
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArray);
      const rms = calculateRMS(dataArray);
      calibrationSamplesRef.current.push(rms);

      requestAnimationFrame(collectSample);
    };

    collectSample();
  }, [calculateRMS]);

  /**
   * Start audio tracking
   */
  const startTracking = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Create audio context and analyser
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Connect microphone to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      // Start calibration
      calibrate();

      // Start analysis loop after calibration
      setTimeout(() => {
        analyzeAudio();
      }, CALIBRATION_DURATION_MS + 100);
    } catch (err) {
      console.error('Failed to start audio tracking:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission denied. Please allow microphone access to use audio tracking.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Failed to start audio tracking: ${err.message}`);
        }
      } else {
        setError('Failed to start audio tracking');
      }
    }
  }, [analyzeAudio, calibrate]);

  /**
   * Stop audio tracking
   */
  const stopTracking = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsListening(false);
    setIsCalibrating(false);
    setCurrentLevel(0);
    wasPlayingRef.current = false;
    silenceStartTimeRef.current = null;
  }, []);

  // Auto-start/stop based on enabled setting
  useEffect(() => {
    if (config.enabled && !isListening) {
      startTracking();
    } else if (!config.enabled && isListening) {
      stopTracking();
    }

    // Cleanup on unmount
    return () => {
      stopTracking();
    };
  }, [config.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isListening,
    isCalibrating,
    error,
    currentLevel,
    startTracking,
    stopTracking,
    calibrate,
  };
}

export default useAudioTracker;
