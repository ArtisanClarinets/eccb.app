/**
 * Comprehensive Work Fingerprint Tests (computeWorkFingerprintV2)
 *
 * Tests the v2 work fingerprint that includes title, composer, and arranger
 * for more accurate work-level duplicate detection.
 */
import { describe, it, expect } from 'vitest';
import { computeWorkFingerprintV2, computeWorkFingerprint } from '../duplicate-detection';

// =============================================================================
// Basic Fingerprint Generation
// =============================================================================
describe('computeWorkFingerprintV2 - Basic Generation', () => {
  it('produces a 64-character hex hash', () => {
    const fp = computeWorkFingerprintV2('Stars and Stripes Forever', 'John Philip Sousa', 'Frank Erickson');
    expect(fp.hash).toHaveLength(64);
    expect(fp.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns normalized fields alongside hash', () => {
    const fp = computeWorkFingerprintV2('  Test Title  ', '  Composer Name  ', '  Arranger Name  ');
    expect(fp.normalizedTitle).toBe('test title');
    expect(fp.normalizedComposer).toBe('composer name');
    expect(fp.normalizedArranger).toBe('arranger name');
  });

  it('is deterministic for identical inputs', () => {
    const a = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    const b = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    expect(a.hash).toBe(b.hash);
    expect(a.normalizedTitle).toBe(b.normalizedTitle);
    expect(a.normalizedComposer).toBe(b.normalizedComposer);
    expect(a.normalizedArranger).toBe(b.normalizedArranger);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeWorkFingerprintV2('Title A', 'Composer A', 'Arranger A');
    const b = computeWorkFingerprintV2('Title B', 'Composer B', 'Arranger B');
    expect(a.hash).not.toBe(b.hash);
  });
});

// =============================================================================
// Title Variation Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Title Variations', () => {
  it('produces different hash when title varies', () => {
    const a = computeWorkFingerprintV2('The Stars and Stripes Forever', 'Sousa', null);
    const b = computeWorkFingerprintV2('Stars and Stripes Forever', 'Sousa', null);
    expect(a.hash).not.toBe(b.hash);
  });

  it('produces same hash for same title with different spacing', () => {
    const a = computeWorkFingerprintV2('Stars   and   Stripes', 'Sousa', null);
    const b = computeWorkFingerprintV2('Stars and Stripes', 'Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for same title with different case', () => {
    const a = computeWorkFingerprintV2('STARS AND STRIPES FOREVER', 'Sousa', null);
    const b = computeWorkFingerprintV2('stars and stripes forever', 'Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for same title with leading/trailing whitespace', () => {
    const a = computeWorkFingerprintV2('  Stars and Stripes Forever  ', 'Sousa', null);
    const b = computeWorkFingerprintV2('Stars and Stripes Forever', 'Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hash for substantially different titles', () => {
    const a = computeWorkFingerprintV2('First Suite in E-flat', 'Gustav Holst', null);
    const b = computeWorkFingerprintV2('Second Suite in F', 'Gustav Holst', null);
    expect(a.hash).not.toBe(b.hash);
  });

  it('produces different hash for title with different article', () => {
    const a = computeWorkFingerprintV2('The Washington Post', 'Sousa', null);
    const b = computeWorkFingerprintV2('Washington Post', 'Sousa', null);
    expect(a.hash).not.toBe(b.hash);
  });
});

// =============================================================================
// Composer Variation Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Composer Variations', () => {
  it('produces different hash when composer varies', () => {
    const a = computeWorkFingerprintV2('March', 'John Philip Sousa', null);
    const b = computeWorkFingerprintV2('March', 'Karl King', null);
    expect(a.hash).not.toBe(b.hash);
  });

  it('produces same hash for same composer with different case', () => {
    const a = computeWorkFingerprintV2('March', 'JOHN PHILIP SOUSA', null);
    const b = computeWorkFingerprintV2('March', 'john philip sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for same composer with extra whitespace', () => {
    const a = computeWorkFingerprintV2('March', 'John   Philip   Sousa', null);
    const b = computeWorkFingerprintV2('March', 'John Philip Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for same composer with leading/trailing whitespace', () => {
    const a = computeWorkFingerprintV2('March', '  John Philip Sousa  ', null);
    const b = computeWorkFingerprintV2('March', 'John Philip Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('handles composer with middle initial variations', () => {
    const a = computeWorkFingerprintV2('March', 'J. P. Sousa', null);
    const b = computeWorkFingerprintV2('March', 'J P Sousa', null);
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hash for different composer name formats', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', null);
    const b = computeWorkFingerprintV2('March', 'John Philip Sousa', null);
    expect(a.hash).not.toBe(b.hash);
  });
});

// =============================================================================
// Arranger Variation Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Arranger Variations', () => {
  it('produces different hash when arranger varies', () => {
    const a = computeWorkFingerprintV2('Semper Fidelis', 'Sousa', 'Frank Erickson');
    const b = computeWorkFingerprintV2('Semper Fidelis', 'Sousa', 'Frederick Fennell');
    expect(a.hash).not.toBe(b.hash);
  });

  it('produces different hash for original vs arranged version', () => {
    const original = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', null);
    const arranged = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    expect(original.hash).not.toBe(arranged.hash);
  });

  it('produces same hash for same arranger with different case', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', 'FRANK ERICKSON');
    const b = computeWorkFingerprintV2('March', 'Sousa', 'frank erickson');
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for same arranger with extra whitespace', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', 'Frank   Erickson');
    const b = computeWorkFingerprintV2('March', 'Sousa', 'Frank Erickson');
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for null and empty string arranger', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', null);
    const b = computeWorkFingerprintV2('March', 'Sousa', '');
    expect(a.hash).toBe(b.hash);
  });

  it('produces same hash for undefined and empty string arranger', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', undefined);
    const b = computeWorkFingerprintV2('March', 'Sousa', '');
    expect(a.hash).toBe(b.hash);
  });

  it('handles arranger with middle initial variations', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', 'F. Erickson');
    const b = computeWorkFingerprintV2('March', 'Sousa', 'F Erickson');
    expect(a.hash).toBe(b.hash);
  });
});

// =============================================================================
// Normalization Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Normalization', () => {
  it('normalizes to lowercase', () => {
    const fp = computeWorkFingerprintV2('TITLE', 'COMPOSER', 'ARRANGER');
    expect(fp.normalizedTitle).toBe('title');
    expect(fp.normalizedComposer).toBe('composer');
    expect(fp.normalizedArranger).toBe('arranger');
  });

  it('trims leading and trailing whitespace', () => {
    const fp = computeWorkFingerprintV2('  title  ', '  composer  ', '  arranger  ');
    expect(fp.normalizedTitle).toBe('title');
    expect(fp.normalizedComposer).toBe('composer');
    expect(fp.normalizedArranger).toBe('arranger');
  });

  it('collapses multiple spaces to single space', () => {
    const fp = computeWorkFingerprintV2('the   title   here', 'composer   name', 'arranger   name');
    expect(fp.normalizedTitle).toBe('the title here');
    expect(fp.normalizedComposer).toBe('composer name');
    expect(fp.normalizedArranger).toBe('arranger name');
  });

  it('collapses tabs and newlines to single space', () => {
    const fp = computeWorkFingerprintV2('the\ttitle', 'composer\nname', 'arranger\r\nname');
    expect(fp.normalizedTitle).toBe('the title');
    expect(fp.normalizedComposer).toBe('composer name');
    expect(fp.normalizedArranger).toBe('arranger name');
  });

  it('strips punctuation for matching', () => {
    const a = computeWorkFingerprintV2("Sousa's March!", 'J. P. Sousa.', 'Dr. Erickson,');
    const b = computeWorkFingerprintV2('Sousas March', 'J P Sousa', 'Dr Erickson');
    expect(a.hash).toBe(b.hash);
  });

  it('removes apostrophes from names', () => {
    const a = computeWorkFingerprintV2("'Title'", "O'Connor", "D'Angelo");
    const b = computeWorkFingerprintV2('title', 'oconnor', 'dangelo');
    expect(a.hash).toBe(b.hash);
  });

  it('removes hyphens from names', () => {
    const a = computeWorkFingerprintV2('The Well-Tempered Clavier', 'J.-S. Bach', 'Arranger-Name');
    const b = computeWorkFingerprintV2('the welltempered clavier', 'js bach', 'arrangername');
    expect(a.hash).toBe(b.hash);
  });

  it('removes periods from initials', () => {
    const a = computeWorkFingerprintV2('March', 'J.P. Sousa', 'F.M. Erickson');
    const b = computeWorkFingerprintV2('march', 'jp sousa', 'fm erickson');
    expect(a.hash).toBe(b.hash);
  });
});

// =============================================================================
// Special Characters and Unicode Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Special Characters and Unicode', () => {
  it('handles unicode characters in title', () => {
    const fp = computeWorkFingerprintV2('Café Music', 'Composer', null);
    expect(fp.normalizedTitle).toBe('caf music');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles accented characters in composer names', () => {
    const fp = computeWorkFingerprintV2('Title', 'José García', 'François Müller');
    expect(fp.normalizedComposer).toBe('jos garca');
    expect(fp.normalizedArranger).toBe('franois mller');
  });

  it('handles umlauts in German names', () => {
    const a = computeWorkFingerprintV2('Title', 'Händel', 'Müller');
    const b = computeWorkFingerprintV2('title', 'hndel', 'mller');
    expect(a.hash).toBe(b.hash);
  });

  it('handles musical symbols in title', () => {
    const fp = computeWorkFingerprintV2('Symphony No. 5 in C♯ minor', 'Composer', null);
    expect(fp.normalizedTitle).toBe('symphony no 5 in c minor');
  });

  it('handles special quote characters', () => {
    const a = computeWorkFingerprintV2('"Quoted" Title', 'Composer', null);
    const b = computeWorkFingerprintV2('quoted title', 'composer', null);
    expect(a.hash).toBe(b.hash);
  });

  it('handles em-dash and en-dash by stripping them', () => {
    const a = computeWorkFingerprintV2('Title—Subtitle', 'Composer', null);
    const b = computeWorkFingerprintV2('Title–Subtitle', 'Composer', null);
    const c = computeWorkFingerprintV2('titlesubtitle', 'composer', null);
    // Em-dash and en-dash are stripped (not replaced with space), so both become 'titlesubtitle'
    expect(a.hash).toBe(c.hash);
    expect(b.hash).toBe(c.hash);
  });

  it('handles numeric titles', () => {
    const fp = computeWorkFingerprintV2('1812 Overture', 'Tchaikovsky', null);
    expect(fp.normalizedTitle).toBe('1812 overture');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles parentheses and brackets', () => {
    const a = computeWorkFingerprintV2('Title (Subtitle)', 'Composer', null);
    const b = computeWorkFingerprintV2('Title [Subtitle]', 'Composer', null);
    const c = computeWorkFingerprintV2('title subtitle', 'composer', null);
    expect(a.hash).toBe(c.hash);
    expect(b.hash).toBe(c.hash);
  });

  it('handles Cyrillic characters', () => {
    const fp = computeWorkFingerprintV2('Пётр Ильич Чайковский', 'Композитор', null);
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
  });

  it('handles Japanese characters', () => {
    const fp = computeWorkFingerprintV2('交響曲', '作曲家', null);
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
  });
});

// =============================================================================
// Edge Cases and Boundary Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Edge Cases', () => {
  it('handles empty string title', () => {
    const fp = computeWorkFingerprintV2('', 'Composer', null);
    expect(fp.normalizedTitle).toBe('');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty string composer', () => {
    const fp = computeWorkFingerprintV2('Title', '', null);
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles null composer', () => {
    const fp = computeWorkFingerprintV2('Title', null, null);
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles undefined composer', () => {
    const fp = computeWorkFingerprintV2('Title', undefined, null);
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles string of only whitespace', () => {
    const fp = computeWorkFingerprintV2('   ', '   ', '   ');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
  });

  it('handles string of only punctuation', () => {
    const fp = computeWorkFingerprintV2('!!!???...', '...', '---');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
  });

  it('handles very long title (truncation not expected)', () => {
    const longTitle = 'A'.repeat(10000);
    const fp = computeWorkFingerprintV2(longTitle, 'Composer', null);
    expect(fp.normalizedTitle).toBe(longTitle.toLowerCase());
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles very long composer name', () => {
    const longComposer = 'Name '.repeat(1000);
    const fp = computeWorkFingerprintV2('Title', longComposer, null);
    expect(fp.normalizedComposer).toBe('name '.repeat(1000).trim());
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles single character inputs', () => {
    const fp = computeWorkFingerprintV2('X', 'Y', 'Z');
    expect(fp.normalizedTitle).toBe('x');
    expect(fp.normalizedComposer).toBe('y');
    expect(fp.normalizedArranger).toBe('z');
  });

  it('handles mixed valid and invalid characters', () => {
    const fp = computeWorkFingerprintV2('Title!!!123', 'Composer###456', 'Arranger@@@789');
    expect(fp.normalizedTitle).toBe('title123');
    expect(fp.normalizedComposer).toBe('composer456');
    expect(fp.normalizedArranger).toBe('arranger789');
  });
});

// =============================================================================
// Backward Compatibility Tests
// =============================================================================
describe('computeWorkFingerprintV2 - Backward Compatibility', () => {
  it('produces different hash than v1 when arranger is present', () => {
    const v1 = computeWorkFingerprint('Title', 'Composer');
    const v2 = computeWorkFingerprintV2('Title', 'Composer', 'Arranger');
    expect(v1.hash).not.toBe(v2.hash);
  });

  it('produces different hash than v1 even with null arranger', () => {
    const v1 = computeWorkFingerprint('Title', 'Composer');
    const v2 = computeWorkFingerprintV2('Title', 'Composer', null);
    expect(v1.hash).not.toBe(v2.hash);
  });

  it('maintains same normalization as v1 for title and composer', () => {
    const v1 = computeWorkFingerprint('The Title Here', 'The Composer');
    const v2 = computeWorkFingerprintV2('The Title Here', 'The Composer', null);
    expect(v1.normalizedTitle).toBe(v2.normalizedTitle);
    expect(v1.normalizedComposer).toBe(v2.normalizedComposer);
  });
});

// =============================================================================
// Real-World Music Examples
// =============================================================================
describe('computeWorkFingerprintV2 - Real-World Examples', () => {
  it('handles Sousa marches consistently', () => {
    const a = computeWorkFingerprintV2('The Stars and Stripes Forever', 'John Philip Sousa', null);
    const b = computeWorkFingerprintV2('Stars and Stripes Forever', 'John Philip Sousa', null);
    expect(a.hash).not.toBe(b.hash);
  });

  it('distinguishes different Holst suites', () => {
    const first = computeWorkFingerprintV2('First Suite in E-flat for Military Band', 'Gustav Holst', null);
    const second = computeWorkFingerprintV2('Second Suite in F for Military Band', 'Gustav Holst', null);
    expect(first.hash).not.toBe(second.hash);
  });

  it('distinguishes same work with different arrangers', () => {
    const erickson = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    const fennell = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frederick Fennell');
    const original = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', null);
    expect(erickson.hash).not.toBe(fennell.hash);
    expect(erickson.hash).not.toBe(original.hash);
    expect(fennell.hash).not.toBe(original.hash);
  });

  it('handles classical works with Opus numbers', () => {
    const a = computeWorkFingerprintV2('Symphony No. 5 in C minor, Op. 67', 'Ludwig van Beethoven', null);
    const b = computeWorkFingerprintV2('Symphony No 5 in C minor Op 67', 'ludwig van beethoven', null);
    expect(a.hash).toBe(b.hash);
  });

  it('handles works with multiple movement designations', () => {
    const fp = computeWorkFingerprintV2(
      'Symphony No. 9: IV. Ode to Joy',
      'Ludwig van Beethoven',
      'Arranger Name'
    );
    expect(fp.normalizedTitle).toBe('symphony no 9 iv ode to joy');
  });

  it('handles contemporary band works', () => {
    const fp = computeWorkFingerprintV2(
      'Incantation and Dance (Revised 1999)',
      'John Barnes Chance',
      null
    );
    expect(fp.normalizedTitle).toBe('incantation and dance revised 1999');
  });
});
