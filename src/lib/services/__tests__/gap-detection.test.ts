/**
 * Tests for buildGapInstructions — gap detection in cutting instructions.
 */

import { describe, it, expect } from 'vitest';
import { buildGapInstructions } from '../cutting-instructions';
import type { CuttingInstruction } from '@/types/smart-upload';

function makeInst(pageStart: number, pageEnd: number, name = 'Part'): CuttingInstruction {
  // tests now supply zero-indexed ranges to match production
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
    const instructions = [makeInst(0, 9)];
    expect(buildGapInstructions(instructions, 10)).toEqual([]);
  });

  it('detects a gap at the start', () => {
    const instructions = [makeInst(2, 9)]; // covers pages 3-10
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([0, 1]);
    expect(gaps[0].partName).toBe('Unlabelled Pages 1-2');
    expect(gaps[0].partNumber).toBe(9900);
  });

  it('detects a gap at the end', () => {
    const instructions = [makeInst(0, 7)]; // covers pages 1-8
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([8, 9]);
    expect(gaps[0].partName).toBe('Unlabelled Pages 9-10');
  });

  it('detects a gap in the middle', () => {
    const instructions = [makeInst(0, 3), makeInst(6, 9)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([4, 5]);
  });

  it('detects multiple gaps with sequential part numbers', () => {
    const instructions = [makeInst(1, 2), makeInst(5, 6)];
    const gaps = buildGapInstructions(instructions, 10);
    expect(gaps).toHaveLength(3);
    // page 0, pages 3-4, pages 7-9
    expect(gaps[0].pageRange).toEqual([0, 0]);
    expect(gaps[0].partNumber).toBe(9900);
    expect(gaps[1].pageRange).toEqual([3, 4]);
    expect(gaps[1].partNumber).toBe(9901);
    expect(gaps[2].pageRange).toEqual([7, 9]);
    expect(gaps[2].partNumber).toBe(9902);
  });

  it('returns empty for empty instructions on a 0-page doc', () => {
    expect(buildGapInstructions([], 0)).toEqual([]);
  });

  it('returns single gap for empty instructions', () => {
    const gaps = buildGapInstructions([], 5);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pageRange).toEqual([0, 4]);
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
