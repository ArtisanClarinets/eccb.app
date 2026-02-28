import { describe, it, expect } from 'vitest';
import { normaliseLabelFromHeader } from '../part-boundary-detector';

describe('normaliseLabelFromHeader', () => {
  describe('invalid and empty inputs', () => {
    it('should return null for empty or whitespace strings', () => {
      expect(normaliseLabelFromHeader('')).toBeNull();
      expect(normaliseLabelFromHeader('   ')).toBeNull();
      expect(normaliseLabelFromHeader('\n\t')).toBeNull();
    });

    it('should return null for strings shorter than 3 characters', () => {
      expect(normaliseLabelFromHeader('A')).toBeNull();
      expect(normaliseLabelFromHeader('1')).toBeNull();
      expect(normaliseLabelFromHeader('  x  ')).toBeNull();
    });

    it('should return null for strings that trim to less than 3 characters', () => {
      expect(normaliseLabelFromHeader(' A ')).toBeNull();
      expect(normaliseLabelFromHeader(' 12 ')).toBeNull();
    });

    it('should return null for forbidden LLM sentinel strings', () => {
      expect(normaliseLabelFromHeader('null')).toBeNull();
      expect(normaliseLabelFromHeader('none')).toBeNull();
      expect(normaliseLabelFromHeader('N/A')).toBeNull();
      expect(normaliseLabelFromHeader('na')).toBeNull();
      expect(normaliseLabelFromHeader('unknown')).toBeNull();
      expect(normaliseLabelFromHeader('undefined')).toBeNull();
      // Case insensitivity and whitespace handling check
      expect(normaliseLabelFromHeader('  NULL  ')).toBeNull();
      expect(normaliseLabelFromHeader('  None  ')).toBeNull();
    });
  });

  describe('pattern matching (PART_PATTERNS)', () => {
    it('should match Clarinet patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('1st Clarinet')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('First Clarinet')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('1 Clarinet')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('2nd Bb Clarinet')).toEqual({ label: '2nd Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('3rd Clarinet')).toEqual({ label: '3rd Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Solo Clarinet')).toEqual({ label: 'Solo Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Solo Bb Clarinet')).toEqual({ label: 'Solo Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Eb Clarinet')).toEqual({ label: 'Eb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Clarinet')).toEqual({ label: 'Bb Clarinet', confidence: 80 });
    });

    it('should match Flute/Piccolo patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('Piccolo')).toEqual({ label: 'Piccolo', confidence: 80 });
      expect(normaliseLabelFromHeader('1st Flute')).toEqual({ label: '1st Flute', confidence: 80 });
      expect(normaliseLabelFromHeader('2 Flute')).toEqual({ label: '2nd Flute', confidence: 80 });
      expect(normaliseLabelFromHeader('Flute')).toEqual({ label: 'Flute', confidence: 80 });
    });

    it('should match Saxophone patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('1st Alto Saxophone')).toEqual({ label: '1st Eb Alto Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('2nd A. Sax')).toEqual({ label: '2nd Eb Alto Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Alto Sax')).toEqual({ label: 'Eb Alto Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Tenor Saxophone')).toEqual({ label: 'Bb Tenor Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Baritone Sax')).toEqual({ label: 'Eb Baritone Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Bari Sax')).toEqual({ label: 'Eb Baritone Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Saxophone')).toEqual({ label: 'Saxophone', confidence: 80 });
    });

    it('should match Brass patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('1st Trumpet')).toEqual({ label: '1st Bb Trumpet', confidence: 80 });
      expect(normaliseLabelFromHeader('Cornet')).toEqual({ label: 'Bb Cornet', confidence: 80 });
      expect(normaliseLabelFromHeader('1st F Horn')).toEqual({ label: '1st F Horn', confidence: 80 });
      expect(normaliseLabelFromHeader('2 F Horn')).toEqual({ label: '2nd F Horn', confidence: 80 });
      expect(normaliseLabelFromHeader('French Horn')).toEqual({ label: 'F Horn', confidence: 80 });
      expect(normaliseLabelFromHeader('1st Trombone')).toEqual({ label: '1st Trombone', confidence: 80 });
      expect(normaliseLabelFromHeader('Bass Trombone')).toEqual({ label: 'Bass Trombone', confidence: 80 });
      expect(normaliseLabelFromHeader('Euphonium')).toEqual({ label: 'Euphonium', confidence: 80 });
      expect(normaliseLabelFromHeader('Tuba')).toEqual({ label: 'Tuba', confidence: 80 });
      expect(normaliseLabelFromHeader('Baritone')).toEqual({ label: 'Baritone', confidence: 80 });
    });

    it('should match Strings and Percussion patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('String Bass')).toEqual({ label: 'String Bass', confidence: 80 });
      expect(normaliseLabelFromHeader('Timpani')).toEqual({ label: 'Timpani', confidence: 80 });
      expect(normaliseLabelFromHeader('Percussion')).toEqual({ label: 'Percussion', confidence: 80 });
      expect(normaliseLabelFromHeader('Snare Drum')).toEqual({ label: 'Snare Drum', confidence: 80 });
      expect(normaliseLabelFromHeader('Bass Drum')).toEqual({ label: 'Bass Drum', confidence: 80 });
      expect(normaliseLabelFromHeader('Mallet Percussion')).toEqual({ label: 'Mallet Percussion', confidence: 80 });
    });

    it('should match Keyboard and Score patterns with confidence 80', () => {
      expect(normaliseLabelFromHeader('Piano')).toEqual({ label: 'Piano', confidence: 80 });
      expect(normaliseLabelFromHeader('Conductor')).toEqual({ label: 'Conductor Score', confidence: 80 });
      expect(normaliseLabelFromHeader('Full Score')).toEqual({ label: 'Full Score', confidence: 80 });
      expect(normaliseLabelFromHeader('Condensed Score')).toEqual({ label: 'Condensed Score', confidence: 80 });
    });

    it('should handle variations in spacing and punctuation within patterns', () => {
      expect(normaliseLabelFromHeader('1st   Clarinet')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('1  st  flute')).toEqual({ label: '1st Flute', confidence: 80 });
      expect(normaliseLabelFromHeader('1st. Clarinet in Bb')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Flute I')).toEqual({ label: 'Flute', confidence: 80 });
    });
  });

  describe('fallback normalization (normalizeInstrumentLabel)', () => {
    it('should return confidence 65 for valid instruments not explicitly in PART_PATTERNS', () => {
      const result = normaliseLabelFromHeader('Violin');
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(65);
      expect(result!.label).toBe('Violin');
    });

    it('should normalize chairs using the fallback normalizer', () => {
      const result = normaliseLabelFromHeader('Violin II');
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(65);
      expect(result!.label).toBe('2nd Violin');
    });
  });

  describe('unrecognized labels', () => {
    it('should return fallback instrument with confidence 65 for unrecognized strings', () => {
      expect(normaliseLabelFromHeader('QQQ ZZZ JJJ')).toEqual({ label: 'QQQ ZZZ JJJ', confidence: 65 });
      expect(normaliseLabelFromHeader('W X Y Z')).toEqual({ label: 'W X Y Z', confidence: 65 });
    });
  });
});
