/**
 * Tests for buildGapInstructions — gap detection in cutting instructions.
 */

import { describe, it, expect } from 'vitest';
import { buildGapInstructions } from '../cutting-instructions';
import type { CuttingInstruction } from '@/types/smart-upload';

function makeInst(pageStart: number, pageEnd: number, name = 'Part'): CuttingInstruction {
  return {
    partName: name,
    instrument: 'Clarinet',
    section: 'Woodwinds',
    transposition: 'Bb',
    partNumber: 1,
    pageRange: [pageStart, pageEnd],
  };
}

describe('buildGapInstructions', () => {
  it('returns empty array when all pages covered', () => {
    const instructions = [makeInst(1, 10)];
    expect(buildGapInstructions(instructions, 10)).toEqual([]);
  });

  it('detects a gap at the start', () => {
    const instructions = [makeInst(3, 10)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([1, 2]);
    expect(gaps[0].partName).toBe('Unlabelled Pages 1-2');
    expect(gaps[0].partNumber).toBe(9900);
  });

  it('detects a gap at the end', () => {
    const instructions = [makeInst(1, 8)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([9, 10]);
    expect(gaps[0].partName).toBe('Unlabelled Pages 9-10');
  });

  it('detects a gap in the middle', () => {
    const instructions = [makeInst(1, 4), makeInst(7, 10)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([5, 6]);
  });

  it('detects multiple gaps with sequential part numbers', () => {
    const instructions = [makeInst(2, 3), makeInst(6, 7)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(3);
    // page 1, pages 4-5, pages 8-10
    expect(gaps[0].pageRange).toEqual([1, 1]);
    expect(gaps[0].partNumber).toBe(9900);
    expect(gaps[1].pageRange).toEqual([4, 5]);
    expect(gaps[1].partNumber).toBe(9901);
    expect(gaps[2].pageRange).toEqual([8, 10]);
    expect(gaps[2].partNumber).toBe(9902);
  });

  it('returns empty for empty instructions on a 0-page doc', () => {
    expect(buildGapInstructions([], 0)).toEqual([]);
  });

  it('returns single gap for empty instructions', () => {
    const gaps = buildGapInstructions([], 5);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([1, 5]);
    expect(gaps[0].partName).toBe('Unlabelled Pages 1-5');
  });

  it('gap instructions have instrument = Unknown and section = Other', () => {
    const gaps = buildGapInstructions([makeInst(3, 5)], 5);
    for (const g of gaps) {
      expect(g.instrument).toBe('Unknown');
      expect(g.section).toBe('Other');
      expect(g.transposition).toBe('C');
    }
  });
});
