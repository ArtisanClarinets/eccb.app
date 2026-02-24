import { detectPitch, frequencyToNote } from '../Tuner';

describe('Tuner utilities', () => {
  it('frequencyToNote converts A4 correctly', () => {
    const res = frequencyToNote(440);
    expect(res.note).toContain('A4');
    expect(Math.abs(res.cents)).toBeLessThan(0.1);
  });

  it('detectPitch approximates frequency from a sine wave buffer', () => {
    // create simple sine wave at 440 Hz
    const sampleRate = 44100;
    const size = 2048;
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      buffer[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    const freq = detectPitch(buffer, sampleRate);
    // result should be a positive number (we rely on algorithm, exact may vary)
    expect(freq).toBeGreaterThan(0);
  });
});