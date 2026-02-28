/**
 * Tests for Metadata Normalizer
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  normalizePersonName,
  normalizePublisher,
  normalizeChair,
  normalizeTransposition,
  normalizeInstrument,
  generatePartFingerprint,
  normalizeExtractedMetadata,
} from '../metadata-normalizer';
import type { ExtractedMetadata, CuttingInstruction } from '../../../types/smart-upload';

// =============================================================================
// normalizeTitle
// =============================================================================
describe('normalizeTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTitle('  Stars   and   Stripes  ')).toBe('Stars and Stripes');
  });

  it('title-cases words', () => {
    expect(normalizeTitle('the stars and stripes forever')).toBe('The Stars and Stripes Forever');
  });

  it('lowercases articles/prepositions mid-title', () => {
    const result = normalizeTitle('FLIGHT OF THE BUMBLEBEE');
    expect(result).toBe('Flight of the Bumblebee');
  });

  it('capitalizes the first word even if it is an article', () => {
    expect(normalizeTitle('a midsummer night')).toBe('A Midsummer Night');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
    expect(normalizeTitle('')).toBe('');
  });
});

// =============================================================================
// normalizePersonName
// =============================================================================
describe('normalizePersonName', () => {
  it('proper-cases simple names', () => {
    expect(normalizePersonName('john philip sousa')).toBe('John Philip Sousa');
  });

  it('handles "Last, First" format', () => {
    expect(normalizePersonName('Sousa, John Philip')).toBe('John Philip Sousa');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizePersonName('  gustav   holst  ')).toBe('Gustav Holst');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizePersonName(null)).toBe('');
    expect(normalizePersonName(undefined)).toBe('');
  });
});

// =============================================================================
// normalizePublisher
// =============================================================================
describe('normalizePublisher', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePublisher('  Hal  Leonard  ')).toBe('Hal Leonard');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizePublisher(null)).toBe('');
    expect(normalizePublisher(undefined)).toBe('');
  });
});

// =============================================================================
// normalizeChair
// =============================================================================
describe('normalizeChair', () => {
  it('converts numeric 1-4 to ordinal', () => {
    expect(normalizeChair(1)).toBe('1st');
    expect(normalizeChair(2)).toBe('2nd');
    expect(normalizeChair(3)).toBe('3rd');
    expect(normalizeChair(4)).toBe('4th');
  });

  it('normalizes string ordinals', () => {
    expect(normalizeChair('1st')).toBe('1st');
    expect(normalizeChair('2nd')).toBe('2nd');
    expect(normalizeChair('3rd')).toBe('3rd');
    expect(normalizeChair('4th')).toBe('4th');
  });

  it('normalizes English words', () => {
    expect(normalizeChair('first')).toBe('1st');
    expect(normalizeChair('SECOND')).toBe('2nd');
    expect(normalizeChair('Third')).toBe('3rd');
    expect(normalizeChair('Fourth')).toBe('4th');
  });

  it('normalizes Roman numerals', () => {
    expect(normalizeChair('I')).toBe('1st');
    expect(normalizeChair('ii')).toBe('2nd');
    expect(normalizeChair('III')).toBe('3rd');
    expect(normalizeChair('iv')).toBe('4th');
  });

  it('handles special designations', () => {
    expect(normalizeChair('Aux')).toBe('Aux');
    expect(normalizeChair('Solo')).toBe('Solo');
  });

  it('returns null for empty/null/undefined', () => {
    expect(normalizeChair(null)).toBeNull();
    expect(normalizeChair(undefined)).toBeNull();
    expect(normalizeChair('')).toBeNull();
  });
});

// =============================================================================
// normalizeTransposition
// =============================================================================
describe('normalizeTransposition', () => {
  it('normalizes flat variants to canonical form', () => {
    expect(normalizeTransposition('Bb')).toBe('Bb');
    expect(normalizeTransposition('b-flat')).toBe('Bb');
    expect(normalizeTransposition('B♭')).toBe('Bb');
    expect(normalizeTransposition('Eb')).toBe('Eb');
    expect(normalizeTransposition('e-flat')).toBe('Eb');
    expect(normalizeTransposition('E♭')).toBe('Eb');
  });

  it('normalizes single letters', () => {
    expect(normalizeTransposition('F')).toBe('F');
    expect(normalizeTransposition('G')).toBe('G');
    expect(normalizeTransposition('D')).toBe('D');
    expect(normalizeTransposition('A')).toBe('A');
  });

  it('defaults to C for null/empty/unknown', () => {
    expect(normalizeTransposition(null)).toBe('C');
    expect(normalizeTransposition(undefined)).toBe('C');
    expect(normalizeTransposition('')).toBe('C');
    expect(normalizeTransposition('Z')).toBe('C');
  });
});

// =============================================================================
// normalizeInstrument
// =============================================================================
describe('normalizeInstrument', () => {
  it('maps known instruments to canonical names', () => {
    const result = normalizeInstrument('Bb Clarinet');
    expect(result.canonicalName).toBe('Bb Clarinet');
    expect(result.section).toBe('Woodwinds');
    expect(result.transposition).toBe('Bb');
  });

  it('handles fuzzy/partial match', () => {
    const result = normalizeInstrument('1st Trumpet in Bb');
    expect(result.canonicalName).toBe('Trumpet');
    expect(result.section).toBe('Brass');
    expect(result.transposition).toBe('Bb');
  });

  it('falls back for unknown instruments', () => {
    const result = normalizeInstrument('kazoo');
    expect(result.canonicalName).toBe('kazoo');
    expect(result.section).toBe('Other');
  });

  it('returns "Unknown" for empty strings', () => {
    const result = normalizeInstrument('');
    expect(result.canonicalName).toBe('Unknown');
  });
});

// =============================================================================
// generatePartFingerprint
// =============================================================================
describe('generatePartFingerprint', () => {
  it('produces deterministic output', () => {
    const a = generatePartFingerprint('sess-1', 'Bb Clarinet', '1st', 1, 4);
    const b = generatePartFingerprint('sess-1', 'Bb Clarinet', '1st', 1, 4);
    expect(a).toBe(b);
  });

  it('differs for different session IDs', () => {
    const a = generatePartFingerprint('sess-1', 'Bb Clarinet', '1st', 1, 4);
    const b = generatePartFingerprint('sess-2', 'Bb Clarinet', '1st', 1, 4);
    expect(a).not.toBe(b);
  });

  it('differs for different chairs', () => {
    const a = generatePartFingerprint('sess-1', 'Trumpet', '1st', 1, 4);
    const b = generatePartFingerprint('sess-1', 'Trumpet', '2nd', 1, 4);
    expect(a).not.toBe(b);
  });

  it('handles null chair', () => {
    const fp = generatePartFingerprint('sess-1', 'Trumpet', null, 1, 4);
    expect(fp).toContain('no-chair');
  });
});

// =============================================================================
// normalizeExtractedMetadata
// =============================================================================
describe('normalizeExtractedMetadata', () => {
  const makeMetadata = (overrides: Partial<ExtractedMetadata> = {}): ExtractedMetadata => ({
    title: 'the stars and stripes FOREVER',
    composer: 'Sousa, John Philip',
    arranger: 'smith, bob',
    publisher: '  Hal  Leonard  ',
    ensembleType: '  Concert Band  ',
    confidenceScore: 92,
    fileType: 'FULL_SCORE',
    isMultiPart: true,
    ...overrides,
  });

  const makeCuttingInstructions = (): CuttingInstruction[] => [
    {
      instrument: 'Bb Clarinet',
      partName: 'Clarinet 1',
      section: 'Woodwinds',
      transposition: 'Bb',
      partNumber: 1,
      pageRange: [1, 4],
    },
    {
      instrument: '1st Trumpet',
      partName: 'Trumpet 1',
      section: 'Brass',
      transposition: 'Bb',
      partNumber: 1,
      pageRange: [5, 8],
    },
  ];

  it('normalizes title', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.title.raw).toBe('the stars and stripes FOREVER');
    expect(result.title.normalized).toBe('The Stars and Stripes Forever');
  });

  it('normalizes composer from Last,First format', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.composer.raw).toBe('Sousa, John Philip');
    expect(result.composer.normalized).toBe('John Philip Sousa');
  });

  it('normalizes arranger', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.arranger.normalized).toBe('Bob Smith');
  });

  it('normalizes publisher', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.publisher.normalized).toBe('Hal Leonard');
  });

  it('normalizes ensemble type', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.ensembleType.normalized).toBe('Concert Band');
  });

  it('creates normalized parts from cutting instructions', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.parts).toHaveLength(2);

    const cl = result.parts[0];
    expect(cl.canonicalInstrument).toBe('Bb Clarinet');
    expect(cl.section).toBe('Woodwinds');
    expect(cl.transposition).toBe('Bb');
    expect(cl.chair).toBe('1st');
    expect(cl.pageRange).toEqual([1, 4]);
    expect(cl.fingerprint).toBeTruthy();
  });

  it('preserves fileType and isMultiPart', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata(), makeCuttingInstructions());
    expect(result.fileType).toBe('FULL_SCORE');
    expect(result.isMultiPart).toBe(true);
  });

  it('handles metadata without cutting instructions', () => {
    const result = normalizeExtractedMetadata('sess-1', makeMetadata());
    expect(result.parts).toHaveLength(0);
  });

  it('uses embedded cutting instructions if none provided separately', () => {
    const meta = makeMetadata({
      cuttingInstructions: makeCuttingInstructions(),
    });
    const result = normalizeExtractedMetadata('sess-1', meta);
    expect(result.parts).toHaveLength(2);
  });

  it('handles missing optional fields gracefully', () => {
    const meta = makeMetadata({
      composer: undefined,
      arranger: undefined,
      publisher: undefined,
      ensembleType: undefined,
      subtitle: undefined,
    });
    const result = normalizeExtractedMetadata('sess-1', meta, makeCuttingInstructions());
    expect(result.composer.normalized).toBeUndefined();
    expect(result.arranger.normalized).toBeUndefined();
    expect(result.publisher.normalized).toBeUndefined();
    expect(result.ensembleType.normalized).toBeUndefined();
  });
});
