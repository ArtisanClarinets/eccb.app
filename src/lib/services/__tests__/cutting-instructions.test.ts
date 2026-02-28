import { describe, it, expect } from 'vitest';
import {
  validateAndNormalizeInstructions,
  detectOverlaps,
  detectGaps,
  generateUniqueFilename,
  splitOverlappingRanges,
  type NormalizedInstruction,
} from '../cutting-instructions';

describe('cutting-instructions', () => {
  describe('validateAndNormalizeInstructions', () => {
    it('should convert 1-indexed to 0-indexed', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 1, pageEnd: 3 },
        { partName: 'Flute 2', pageStart: 4, pageEnd: 6 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        oneIndexed: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.instructions).toHaveLength(2);
      expect(result.instructions[0].pageRange[0]).toBe(0);
      expect(result.instructions[0].pageRange[1]).toBe(2);
      expect(result.instructions[1].pageRange[0]).toBe(3);
      expect(result.instructions[1].pageRange[1]).toBe(5);
    });

    it('should keep 0-indexed when oneIndexed is false', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Flute 2', pageStart: 3, pageEnd: 5 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        oneIndexed: false,
      });

      expect(result.isValid).toBe(true);
      expect(result.instructions[0].pageRange[0]).toBe(0);
      expect(result.instructions[0].pageRange[1]).toBe(2);
    });

    it('should clamp ranges to valid page bounds', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: -5, pageEnd: 100 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        oneIndexed: false,
      });

      expect(result.isValid).toBe(true);
      expect(result.instructions[0].pageRange[0]).toBe(0);
      expect(result.instructions[0].pageRange[1]).toBe(9); // totalPages - 1
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect overlaps and generate errors when not allowed', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Flute 2', pageStart: 3, pageEnd: 7 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        allowOverlaps: false,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Overlap detected');
      expect(result.errors[0]).toContain('Flute 1');
      expect(result.errors[0]).toContain('Flute 2');
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps![0].overlap).toEqual([3, 5]);
    });

    it('should detect overlaps and generate warnings when allowed', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Flute 2', pageStart: 3, pageEnd: 7 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        allowOverlaps: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Overlap detected');
      expect(result.errors).toHaveLength(0);
    });

    it('should auto-fix overlaps when autoFixOverlaps is true', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Flute 2', pageStart: 3, pageEnd: 7 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        autoFixOverlaps: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('Auto-fixed'))).toBe(true);
      // First part should be truncated
      expect(result.instructions[0].pageRange[1]).toBeLessThan(3);
    });

    it('should detect gaps', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Flute 2', pageStart: 5, pageEnd: 7 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        detectGaps: true,
      });

      expect(result.isValid).toBe(true);
      // Gaps: pages 3-4 (middle) and pages 8-9 (end)
      expect(result.gaps).toHaveLength(2);
      expect(result.gaps!.some(g => g.start === 3 && g.end === 4)).toBe(true);
      expect(result.gaps!.some(g => g.start === 8 && g.end === 9)).toBe(true);
      expect(result.warnings.some(w => w.includes('Gap detected'))).toBe(true);
    });

    it('should detect multiple gaps', () => {
      const rawInstructions = [
        { partName: 'Part 1', pageStart: 1, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 5, pageEnd: 6 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {
        detectGaps: true,
      });

      expect(result.gaps).toHaveLength(3);
      // Gap at start: 0-0
      expect(result.gaps!.some(g => g.start === 0 && g.end === 0)).toBe(true);
      // Middle gap: 3-4
      expect(result.gaps!.some(g => g.start === 3 && g.end === 4)).toBe(true);
      // End gap: 7-9
      expect(result.gaps!.some(g => g.start === 7 && g.end === 9)).toBe(true);
    });

    it('should handle empty instructions array', () => {
      const result = validateAndNormalizeInstructions([], 10, {});

      expect(result.isValid).toBe(true);
      expect(result.instructions).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No cutting instructions');
    });

    it('should handle invalid totalPages', () => {
      const rawInstructions = [{ partName: 'Flute 1', pageStart: 0, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 0, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid totalPages');
    });

    it('should handle missing partName', () => {
      const rawInstructions = [{ pageStart: 0, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('partName');
    });

    it('should handle empty partName', () => {
      const rawInstructions = [{ partName: '   ', pageStart: 0, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('partName');
    });

    it('should handle missing pageStart', () => {
      const rawInstructions = [{ partName: 'Flute 1', pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('pageStart');
    });

    it('should handle missing pageEnd', () => {
      const rawInstructions = [{ partName: 'Flute 1', pageStart: 0 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('pageEnd');
    });

    it('should handle non-integer page numbers', () => {
      const rawInstructions = [{ partName: 'Flute 1', pageStart: 0.5, pageEnd: 2.5 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('integer');
    });

    it('should handle pageStart > pageEnd', () => {
      const rawInstructions = [{ partName: 'Flute 1', pageStart: 5, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('pageStart');
      expect(result.errors[0]).toContain('pageEnd');
    });

    it('should handle non-array input', () => {
      const result = validateAndNormalizeInstructions('not an array' as unknown as unknown[], 10, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('array');
    });

    it('should handle null instruction', () => {
      const rawInstructions = [null, { partName: 'Flute 1', pageStart: 0, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions as unknown[], 10, {});

      // Should be invalid because null instruction generates an error
      expect(result.isValid).toBe(false);
      expect(result.instructions).toHaveLength(1);
      expect(result.errors.some(e => e.includes('Must be an object'))).toBe(true);
    });

    it('should handle duplicate part names', () => {
      const rawInstructions = [
        { partName: 'Flute 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Flute 1', pageStart: 3, pageEnd: 5 },
      ];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(true);
      expect(result.instructions).toHaveLength(2);
      // Duplicate names should be allowed - filenames will be unique via index
    });

    it('should trim part names', () => {
      const rawInstructions = [{ partName: '  Flute 1  ', pageStart: 0, pageEnd: 2 }];

      const result = validateAndNormalizeInstructions(rawInstructions, 10, {});

      expect(result.isValid).toBe(true);
      expect(result.instructions[0].partName.trim()).toBe('Flute 1');
    });
  });

  describe('detectOverlaps', () => {
    it('should return empty array when no overlaps', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 5 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(0);
    });

    it('should detect single overlap', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 7 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].part1).toBe('Part 1');
      expect(overlaps[0].part2).toBe('Part 2');
      expect(overlaps[0].overlap).toEqual([3, 5]);
    });

    it('should detect multiple overlaps', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 7 },
        { partName: 'Part 3', pageStart: 4, pageEnd: 8 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(3); // 1-2, 1-3, 2-3
    });

    it('should handle adjacent ranges as non-overlapping', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 5 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(0);
    });

    it('should handle exact same range as overlapping', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Part 2', pageStart: 0, pageEnd: 5 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].overlap).toEqual([0, 5]);
    });

    it('should return empty array for single instruction', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
      ];

      const overlaps = detectOverlaps(instructions);

      expect(overlaps).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const overlaps = detectOverlaps([]);

      expect(overlaps).toHaveLength(0);
    });
  });

  describe('detectGaps', () => {
    it('should return empty array when all pages covered', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 9 },
      ];

      const gaps = detectGaps(instructions, 10);

      expect(gaps).toHaveLength(0);
    });

    it('should detect gap at start', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 3, pageEnd: 9 },
      ];

      const gaps = detectGaps(instructions, 10);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toEqual({ start: 0, end: 2 });
    });

    it('should detect gap at end', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 6 },
      ];

      const gaps = detectGaps(instructions, 10);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toEqual({ start: 7, end: 9 });
    });

    it('should detect gap in middle', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 5, pageEnd: 9 },
      ];

      const gaps = detectGaps(instructions, 10);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toEqual({ start: 3, end: 4 });
    });

    it('should return all pages as gap when no instructions', () => {
      const gaps = detectGaps([], 10);

      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toEqual({ start: 0, end: 9 });
    });

    it('should handle totalPages of 0', () => {
      const gaps = detectGaps([], 0);

      expect(gaps).toHaveLength(0);
    });

    it('should handle multiple gaps', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 1, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 5, pageEnd: 6 },
      ];

      const gaps = detectGaps(instructions, 10);

      expect(gaps).toHaveLength(3);
    });
  });

  describe('generateUniqueFilename', () => {
    it('should include page range in filename', () => {
      const filename = generateUniqueFilename('Flute 1', 0, 2, 0);

      expect(filename).toBe('Flute 1__p0-2_0.pdf');
    });

    it('should include index in filename', () => {
      const filename = generateUniqueFilename('Flute 1', 0, 2, 5);

      expect(filename).toBe('Flute 1__p0-2_5.pdf');
    });

    it('should sanitize unsafe characters', () => {
      const filename = generateUniqueFilename('Percussion 1 & 2!', 5, 10, 1);

      expect(filename).not.toContain('!');
      expect(filename).toContain('&');
      expect(filename).toBe('Percussion 1 & 2__p5-10_1.pdf');
    });

    it('should remove path traversal characters', () => {
      const filename = generateUniqueFilename('../../etc/passwd', 0, 2, 0);

      expect(filename).not.toContain('/');
      expect(filename).not.toContain('\\');
      // Dots are removed by the sanitization regex
      expect(filename).toBe('etcpasswd__p0-2_0.pdf');
    });

    it('should remove special characters', () => {
      const filename = generateUniqueFilename('Part: <Test>?|*', 0, 2, 0);

      expect(filename).not.toContain(':');
      expect(filename).not.toContain('<');
      expect(filename).not.toContain('>');
      expect(filename).not.toContain('?');
      expect(filename).not.toContain('|');
      expect(filename).not.toContain('*');
      expect(filename).toBe('Part Test__p0-2_0.pdf');
    });

    it('should trim whitespace', () => {
      const filename = generateUniqueFilename('  Flute 1  ', 0, 2, 0);

      expect(filename).toBe('Flute 1__p0-2_0.pdf');
    });

    it('should handle empty partName', () => {
      const filename = generateUniqueFilename('', 0, 2, 0);

      expect(filename).toBe('__p0-2_0.pdf');
    });

    it('should preserve allowed characters', () => {
      const filename = generateUniqueFilename('Woodwinds - Bb Clarinet_1', 0, 2, 0);

      expect(filename).toContain('-');
      expect(filename).toContain('_');
      expect(filename).toBe('Woodwinds - Bb Clarinet_1__p0-2_0.pdf');
    });

    it('should strip emojis and non-ASCII characters', () => {
      // The function calls .trim() after removing unsafe characters
      const filename = generateUniqueFilename('🎻Violin part', 1, 3, 2);

      expect(filename).toBe('Violin part__p1-3_2.pdf');
    });

    it('should handle strings that become completely empty after sanitization', () => {
      const filename = generateUniqueFilename('???!!!', 5, 5, 1);

      expect(filename).toBe('__p5-5_1.pdf');
    });

    it('should preserve consecutive spaces internally but trim ends', () => {
      const filename = generateUniqueFilename(' Trumpet   in   Bb ', 0, 10, 0);

      expect(filename).toBe('Trumpet   in   Bb__p0-10_0.pdf');
    });

    it('should handle negative page numbers correctly', () => {
      const filename = generateUniqueFilename('Flute', -1, -5, 0);

      expect(filename).toBe('Flute__p-1--5_0.pdf');
    });

    it('should handle large indices and page numbers', () => {
      const filename = generateUniqueFilename('Tuba', 10000, 20000, 999999);

      expect(filename).toBe('Tuba__p10000-20000_999999.pdf');
    });

    it('should strip invisible characters', () => {
      const filename = generateUniqueFilename('Horn\x00\x1F\x7F1', 0, 1, 0);

      expect(filename).toBe('Horn1__p0-1_0.pdf');
    });
  });

  describe('splitOverlappingRanges', () => {
    it('should return empty array for empty input', () => {
      const result = splitOverlappingRanges([]);

      expect(result).toHaveLength(0);
    });

    it('should return same array for single instruction', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(instructions[0]);
    });

    it('should not modify non-overlapping ranges', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 2 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 5 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(instructions[0]);
      expect(result[1]).toEqual(instructions[1]);
    });

    it('should split overlapping ranges', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 7 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(2);
      expect(result[0].pageEnd).toBe(2); // Part 1 truncated
      expect(result[1]).toEqual(instructions[1]); // Part 2 unchanged
    });

    it('should handle multiple overlaps', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 5 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 7 },
        { partName: 'Part 3', pageStart: 6, pageEnd: 9 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(3);
      // Part 1: 0-2 (truncated at start of overlap with Part 2)
      expect(result[0].pageEnd).toBe(2);
      // Part 2: 3-5 (truncated at start of overlap with Part 3)
      expect(result[1].pageStart).toBe(3);
      expect(result[1].pageEnd).toBe(5);
      // Part 3: 6-9 (unchanged)
      expect(result[2]).toEqual(instructions[2]);
    });

    it('should sort by pageStart', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 2', pageStart: 3, pageEnd: 5 },
        { partName: 'Part 1', pageStart: 0, pageEnd: 4 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(2);
      // Part 1 should be first (pageStart 0)
      expect(result[0].partName).toBe('Part 1');
      expect(result[1].partName).toBe('Part 2');
    });

    it('should handle complete overlap (one range inside another)', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 10 },
        { partName: 'Part 2', pageStart: 3, pageEnd: 5 },
      ];

      const result = splitOverlappingRanges(instructions);

      expect(result).toHaveLength(2);
      // Part 1 gets truncated before Part 2 starts
      expect(result[0].pageEnd).toBe(2);
      expect(result[0].pageStart).toBe(0);
      // Part 2 remains unchanged
      expect(result[1]).toEqual(instructions[1]);
    });

    it('should handle overlapping parts where earlier part is truncated', () => {
      const instructions: NormalizedInstruction[] = [
        { partName: 'Part 1', pageStart: 0, pageEnd: 10 },
        { partName: 'Part 2', pageStart: 5, pageEnd: 10 },
      ];

      const result = splitOverlappingRanges(instructions);

      // Part 1 gets truncated to end before Part 2 starts
      expect(result).toHaveLength(2);
      expect(result[0].partName).toBe('Part 1');
      expect(result[0].pageEnd).toBe(4);
      expect(result[1].partName).toBe('Part 2');
      expect(result[1].pageStart).toBe(5);
      expect(result[1].pageEnd).toBe(10);
    });
  });
});
