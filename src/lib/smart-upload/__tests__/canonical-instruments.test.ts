/**
 * Tests for Canonical Instruments Registry
 */
import { describe, it, expect } from 'vitest';
import {
  findByAlias,
  findByFuzzyMatch,
  getSectionForLabel,
  getTranspositionForLabel,
  getInstrumentsBySection,
  getAllSections,
  CANONICAL_INSTRUMENTS,
} from '../canonical-instruments';

describe('Canonical Instruments — findByAlias', () => {
  it('finds Bb Clarinet by exact alias "clarinet"', () => {
    const result = findByAlias('clarinet');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Bb Clarinet');
    expect(result!.transposition).toBe('Bb');
    expect(result!.section).toBe('Woodwinds');
  });

  it('finds Trumpet by abbreviation "tpt"', () => {
    const result = findByAlias('tpt');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Trumpet');
  });

  it('finds Horn by alias "french horn"', () => {
    const result = findByAlias('french horn');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Horn');
    expect(result!.transposition).toBe('F');
  });

  it('is case-insensitive', () => {
    expect(findByAlias('CLARINET')?.name).toBe('Bb Clarinet');
    expect(findByAlias('Trumpet')?.name).toBe('Trumpet');
  });

  it('returns null for unknown aliases', () => {
    expect(findByAlias('kazoo')).toBeNull();
    expect(findByAlias('')).toBeNull();
  });

  it('finds OCR-error variants', () => {
    expect(findByAlias('c1arinet')?.name).toBe('Bb Clarinet');
    expect(findByAlias('f1ute')?.name).toBe('Flute');
    expect(findByAlias('tr0mbone')?.name).toBe('Trombone');
  });
});

describe('Canonical Instruments — findByFuzzyMatch', () => {
  it('finds instrument when alias is substring of input', () => {
    const result = findByFuzzyMatch('1st Bb Clarinet in Concert');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Bb Clarinet');
  });

  it('prefers longer alias matches', () => {
    // "alto saxophone" should match over just "saxophone"
    const result = findByFuzzyMatch('1st Alto Saxophone');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Alto Saxophone');
  });

  it('finds bass clarinet over clarinet', () => {
    const result = findByFuzzyMatch('Bass Clarinet Part');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Bass Clarinet');
  });

  it('finds bass trombone over trombone', () => {
    const result = findByFuzzyMatch('Bass Trombone');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Bass Trombone');
  });

  it('returns null for completely unknown input', () => {
    expect(findByFuzzyMatch('quantum resonator')).toBeNull();
  });

  it('handles full score labels', () => {
    const result = findByFuzzyMatch('Full Score');
    expect(result).not.toBeNull();
    expect(result!.section).toBe('Score');
  });

  it('handles conductor labels', () => {
    const result = findByFuzzyMatch("Conductor's Score");
    expect(result).not.toBeNull();
    expect(result!.section).toBe('Score');
  });
});

describe('Canonical Instruments — Section + Transposition Helpers', () => {
  it('getSectionForLabel returns correct section', () => {
    expect(getSectionForLabel('Flute')).toBe('Woodwinds');
    expect(getSectionForLabel('Trumpet')).toBe('Brass');
    expect(getSectionForLabel('Timpani')).toBe('Percussion');
    expect(getSectionForLabel('Piano')).toBe('Keyboard');
    expect(getSectionForLabel('Violin')).toBe('Strings');
  });

  it('getSectionForLabel returns Other for unknown', () => {
    expect(getSectionForLabel('kazoo')).toBe('Other');
  });

  it('getTranspositionForLabel returns correct key', () => {
    expect(getTranspositionForLabel('Bb Clarinet')).toBe('Bb');
    expect(getTranspositionForLabel('Alto Sax')).toBe('Eb');
    expect(getTranspositionForLabel('Horn in F')).toBe('F');
    expect(getTranspositionForLabel('Flute')).toBe('C');
  });

  it('getTranspositionForLabel returns C for unknown', () => {
    expect(getTranspositionForLabel('kazoo')).toBe('C');
  });
});

describe('Canonical Instruments — getInstrumentsBySection', () => {
  it('returns all woodwinds', () => {
    const woodwinds = getInstrumentsBySection('Woodwinds');
    expect(woodwinds.length).toBeGreaterThan(5);
    expect(woodwinds.every((i) => i.section === 'Woodwinds')).toBe(true);
  });

  it('returns all brass', () => {
    const brass = getInstrumentsBySection('Brass');
    expect(brass.length).toBeGreaterThan(5);
    expect(brass.every((i) => i.section === 'Brass')).toBe(true);
  });

  it('returns empty for Other (no canonical instruments in Other)', () => {
    const other = getInstrumentsBySection('Other');
    expect(other.length).toBe(0);
  });
});

describe('Canonical Instruments — getAllSections', () => {
  it('returns all 8 sections', () => {
    const sections = getAllSections();
    expect(sections).toHaveLength(8);
    expect(sections).toContain('Woodwinds');
    expect(sections).toContain('Brass');
    expect(sections).toContain('Percussion');
    expect(sections).toContain('Strings');
    expect(sections).toContain('Keyboard');
    expect(sections).toContain('Vocals');
    expect(sections).toContain('Score');
    expect(sections).toContain('Other');
  });
});

describe('Canonical Instruments — Registry Integrity', () => {
  it('has no empty aliases', () => {
    for (const inst of CANONICAL_INSTRUMENTS) {
      expect(inst.aliases.length).toBeGreaterThan(0);
      for (const alias of inst.aliases) {
        expect(alias.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all aliases are lowercase', () => {
    for (const inst of CANONICAL_INSTRUMENTS) {
      for (const alias of inst.aliases) {
        expect(alias).toBe(alias.toLowerCase());
      }
    }
  });

  it('has at least 40 instruments', () => {
    expect(CANONICAL_INSTRUMENTS.length).toBeGreaterThanOrEqual(40);
  });
});
