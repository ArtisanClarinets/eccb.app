import { describe, it, expect } from 'vitest';
import {
  normalizeInstrumentLabel,
  buildPartDisplayName,
  buildPartFilename,
  buildPartStorageSlug,
} from '../part-naming';

// =============================================================================
// normalizeInstrumentLabel
// =============================================================================

describe('normalizeInstrumentLabel', () => {
  it('"Clarinet 1" → chair "1st", Bb Clarinet', () => {
    const result = normalizeInstrumentLabel('Clarinet 1');
    expect(result.chair).toBe('1st');
    expect(result.instrument).toBe('1st Bb Clarinet');
    expect(result.transposition).toBe('Bb');
    expect(result.section).toBe('Woodwinds');
  });

  it('"Clarinet I" → chair "1st", 1st Bb Clarinet', () => {
    const result = normalizeInstrumentLabel('Clarinet I');
    expect(result.chair).toBe('1st');
    expect(result.instrument).toBe('1st Bb Clarinet');
  });

  it('"Clarinet II" → chair "2nd", 2nd Bb Clarinet', () => {
    const result = normalizeInstrumentLabel('Clarinet II');
    expect(result.chair).toBe('2nd');
    expect(result.instrument).toBe('2nd Bb Clarinet');
  });

  it('"Alto Saxophone" → section Woodwinds, transposition Eb', () => {
    const result = normalizeInstrumentLabel('Alto Saxophone');
    expect(result.section).toBe('Woodwinds');
    expect(result.transposition).toBe('Eb');
    expect(result.chair).toBeNull();
  });

  it('"1st Trumpet" → chair "1st", section Brass', () => {
    const result = normalizeInstrumentLabel('1st Trumpet');
    expect(result.chair).toBe('1st');
    expect(result.section).toBe('Brass');
    expect(result.transposition).toBe('Bb');
  });

  it('"Bass Trombone" → section Brass', () => {
    const result = normalizeInstrumentLabel('Bass Trombone');
    expect(result.section).toBe('Brass');
  });

  it('"Snare Drum" → section Percussion', () => {
    const result = normalizeInstrumentLabel('Snare Drum');
    expect(result.section).toBe('Percussion');
  });

  it('"Conductor Score" → partType CONDUCTOR_SCORE', () => {
    const result = normalizeInstrumentLabel('Conductor Score');
    expect(result.partType).toBe('CONDUCTOR_SCORE');
  });

  it('"Full Score" → partType FULL_SCORE', () => {
    const result = normalizeInstrumentLabel('Full Score');
    expect(result.partType).toBe('FULL_SCORE');
  });

  it('empty string → instrument "Unknown"', () => {
    const result = normalizeInstrumentLabel('');
    expect(result.instrument).toBe('Unknown');
  });

  it('unknown garbage string → section "Other"', () => {
    const result = normalizeInstrumentLabel('XyzGarbage99');
    expect(result.section).toBe('Other');
  });

  it('"Flute" → section Woodwinds, transposition C', () => {
    const result = normalizeInstrumentLabel('Flute');
    expect(result.section).toBe('Woodwinds');
    expect(result.transposition).toBe('C');
    expect(result.chair).toBeNull();
    expect(result.partType).toBe('PART');
  });

  it('"Tuba" → section Brass, transposition C', () => {
    const result = normalizeInstrumentLabel('Tuba');
    expect(result.section).toBe('Brass');
    expect(result.transposition).toBe('C');
    expect(result.chair).toBeNull();
  });

  it('"French Horn" → transposition F', () => {
    const result = normalizeInstrumentLabel('French Horn');
    expect(result.transposition).toBe('F');
    expect(result.section).toBe('Brass');
  });

  it('"3rd Bb Clarinet" → chair "3rd"', () => {
    const result = normalizeInstrumentLabel('3rd Bb Clarinet');
    expect(result.chair).toBe('3rd');
    expect(result.transposition).toBe('Bb');
    expect(result.section).toBe('Woodwinds');
  });
});

// =============================================================================
// buildPartDisplayName
// =============================================================================

describe('buildPartDisplayName', () => {
  it('combines title and instrument', () => {
    expect(
      buildPartDisplayName('American Patrol', { instrument: '1st Bb Clarinet' })
    ).toBe('American Patrol 1st Bb Clarinet');
  });

  it('handles instrument without chair', () => {
    expect(
      buildPartDisplayName('Stars and Stripes', { instrument: 'Tuba' })
    ).toBe('Stars and Stripes Tuba');
  });

  it('trims extra whitespace', () => {
    expect(
      buildPartDisplayName('  March  ', { instrument: '  Flute  ' })
    ).toBe('March Flute');
  });
});

// =============================================================================
// buildPartFilename
// =============================================================================

describe('buildPartFilename', () => {
  it('replaces spaces with underscores and appends .pdf', () => {
    expect(buildPartFilename('American Patrol 1st Bb Clarinet')).toBe(
      'American_Patrol_1st_Bb_Clarinet.pdf'
    );
  });

  it('strips filesystem-unsafe characters', () => {
    const result = buildPartFilename("O'Brien / March");
    expect(result).not.toContain('/');
    expect(result).not.toContain("'");
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('collapses multiple underscores', () => {
    expect(buildPartFilename('A   B')).toBe('A_B.pdf');
  });

  it('truncates at 200 chars before extension', () => {
    const longName = 'A'.repeat(250);
    const result = buildPartFilename(longName);
    // 200 chars + '.pdf' = 204 total
    expect(result.length).toBe(204);
  });
});

// =============================================================================
// buildPartStorageSlug
// =============================================================================

describe('buildPartStorageSlug', () => {
  it('replaces spaces with underscores', () => {
    expect(buildPartStorageSlug('American Patrol 1st Bb Clarinet')).toBe(
      'American_Patrol_1st_Bb_Clarinet'
    );
  });

  it('strips non-alphanumeric/dash/underscore/space chars', () => {
    const result = buildPartStorageSlug("O'Brien: March! (2)");
    expect(result).not.toContain("'");
    expect(result).not.toContain(':');
    expect(result).not.toContain('!');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
  });

  it('truncates at 150 chars', () => {
    const longName = 'A'.repeat(200);
    expect(buildPartStorageSlug(longName).length).toBe(150);
  });
});
