import { describe, it, expect, vi } from 'vitest';
import { detectPartBoundaries, normaliseLabelFromHeader } from '../part-boundary-detector';
import type { PageHeader } from '../pdf-text-extractor';

// Mock logger to avoid noisy output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Part Boundary Detector', () => {
  describe('normaliseLabelFromHeader', () => {
    it('returns null for empty or very short strings', () => {
      expect(normaliseLabelFromHeader('')).toBeNull();
      expect(normaliseLabelFromHeader('A')).toBeNull();
      expect(normaliseLabelFromHeader('No')).toBeNull();
    });

    it('returns null for forbidden labels', () => {
      expect(normaliseLabelFromHeader('null')).toBeNull();
      expect(normaliseLabelFromHeader('Unknown')).toBeNull();
      expect(normaliseLabelFromHeader(' N/A ')).toBeNull();
    });

    it('matches known patterns exactly', () => {
      const result = normaliseLabelFromHeader('1st Bb Clarinet');
      expect(result).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
    });

    it('matches known patterns ignoring case and spacing', () => {
      expect(normaliseLabelFromHeader('First Clarinet')).toEqual({ label: '1st Bb Clarinet', confidence: 80 });
      expect(normaliseLabelFromHeader('Clarinet 1')).toEqual({ label: 'Bb Clarinet', confidence: 80 }); // 'Clarinet 1' hits 'clarinet' fallback or regex
      expect(normaliseLabelFromHeader('Alto Sax')).toEqual({ label: 'Eb Alto Saxophone', confidence: 80 });
      expect(normaliseLabelFromHeader('Tuba')).toEqual({ label: 'Tuba', confidence: 80 });
    });

    it('falls back to normalizeInstrumentLabel for other instruments', () => {
      // Assuming normalizeInstrumentLabel works
      const result = normaliseLabelFromHeader('Cello');
      expect(result).toEqual({ label: 'Cello', confidence: 65 });
    });
  });

  describe('detectPartBoundaries', () => {
    it('handles empty inputs gracefully', () => {
      const result = detectPartBoundaries([], 0, true);

      expect(result.pageLabels).toHaveLength(0);
      expect(result.segments).toHaveLength(0);
      expect(result.cuttingInstructions).toHaveLength(0);
      expect(result.segmentationConfidence).toBe(0);
      expect(result.fromTextLayer).toBe(true);
    });

    it('performs basic segmentation', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: 'Flute', fullText: '', hasText: true },
        { pageIndex: 1, headerText: 'Flute', fullText: '', hasText: true },
        { pageIndex: 2, headerText: 'Oboe', fullText: '', hasText: true },
      ];

      const result = detectPartBoundaries(headers, 3, true);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        label: 'Flute',
        pageStart: 0,
        pageEnd: 1,
        pageCount: 2,
      });
      expect(result.segments[1]).toEqual({
        label: 'Oboe',
        pageStart: 2,
        pageEnd: 2,
        pageCount: 1,
      });

      expect(result.cuttingInstructions).toHaveLength(2);
      expect(result.cuttingInstructions[0].partName).toBe('Flute');
      expect(result.cuttingInstructions[0].pageRange).toEqual([0, 1]);
      expect(result.cuttingInstructions[1].partName).toBe('Oboe');
      expect(result.cuttingInstructions[1].pageRange).toEqual([2, 2]);
    });

    it('fills gaps with previous labels', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: 'Flute', fullText: '', hasText: true },
        { pageIndex: 1, headerText: '', fullText: '', hasText: true }, // Empty
        { pageIndex: 2, headerText: 'Oboe', fullText: '', hasText: true },
      ];

      const result = detectPartBoundaries(headers, 3, true);

      expect(result.pageLabels[1].label).toBe('Flute'); // Filled
      expect(result.pageLabels[1].confidence).toBe(40);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].pageEnd).toBe(1);
    });

    it('fills initial gaps with first found label', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: '', fullText: '', hasText: true }, // Empty at start
        { pageIndex: 1, headerText: 'Flute', fullText: '', hasText: true },
      ];

      const result = detectPartBoundaries(headers, 2, true);

      expect(result.pageLabels[0].label).toBe('Flute'); // Filled backward
      expect(result.pageLabels[0].confidence).toBe(30);

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].pageStart).toBe(0);
      expect(result.segments[0].pageEnd).toBe(1);
    });

    it('smooths out single-page blips', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: 'Flute', fullText: '', hasText: true },
        { pageIndex: 1, headerText: 'Oboe', fullText: '', hasText: true }, // Blip!
        { pageIndex: 2, headerText: 'Flute', fullText: '', hasText: true },
      ];

      const result = detectPartBoundaries(headers, 3, true);

      expect(result.pageLabels[1].label).toBe('Flute');
      expect(result.pageLabels[1].confidence).toBeLessThanOrEqual(60);

      expect(result.segments).toHaveLength(1); // Smoothed into one
      expect(result.segments[0].pageCount).toBe(3);
    });

    it('adds "Unknown Part" for unanalyzed pages at the end', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: 'Flute', fullText: '', hasText: true },
      ];

      // totalPages is 3, but only 1 header provided
      const result = detectPartBoundaries(headers, 3, true);

      expect(result.pageLabels).toHaveLength(3);
      expect(result.pageLabels[1].label).toBe('Unknown Part');
      expect(result.pageLabels[2].label).toBe('Unknown Part');

      expect(result.segments).toHaveLength(2);
      expect(result.segments[1].label).toBe('Unknown Part');
      expect(result.segments[1].pageStart).toBe(1);
      expect(result.segments[1].pageEnd).toBe(2);
    });

    it('handles multiple segments and overlapping patterns correctly', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: '1st Trumpet', fullText: '', hasText: true },
        { pageIndex: 1, headerText: '2nd Trumpet', fullText: '', hasText: true },
        { pageIndex: 2, headerText: '3rd Trumpet', fullText: '', hasText: true },
      ];

      const result = detectPartBoundaries(headers, 3, true);

      expect(result.segments).toHaveLength(3);
      expect(result.segments[0].label).toBe('1st Bb Trumpet');
      expect(result.segments[1].label).toBe('2nd Bb Trumpet');
      expect(result.segments[2].label).toBe('3rd Bb Trumpet');
    });

    it('calculates segmentation confidence correctly', () => {
      const headers: PageHeader[] = [
        { pageIndex: 0, headerText: 'Flute', fullText: '', hasText: true }, // High confidence (80)
        { pageIndex: 1, headerText: 'Flute', fullText: '', hasText: true }, // High confidence (80)
        { pageIndex: 2, headerText: '', fullText: '', hasText: true }, // Filled gap (low confidence 40)
        { pageIndex: 3, headerText: 'Oboe', fullText: '', hasText: true }, // High confidence (80)
      ];

      const result = detectPartBoundaries(headers, 4, true);

      // 3 high confidence out of 4 total pages = 75%
      expect(result.segmentationConfidence).toBe(75);
    });
  });
});
