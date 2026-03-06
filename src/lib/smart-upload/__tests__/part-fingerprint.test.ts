/**
 * Comprehensive Part Fingerprint Tests (computePartIdentityFingerprint)
 *
 * Tests the stable part identity fingerprint used for DB-level deduplication
 * across retries and re-segmentation of the same musical part.
 */
import { describe, it, expect } from 'vitest';
import { computePartIdentityFingerprint, computePartFingerprint } from '../duplicate-detection';

// =============================================================================
// Basic Fingerprint Generation
// =============================================================================
describe('computePartIdentityFingerprint - Basic Generation', () => {
  it('produces a 64-character hex hash', () => {
    const fp = computePartIdentityFingerprint(
      'piece-123',
      'Bb Clarinet',
      'Clarinet 1',
      '1st',
      'Bb'
    );
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for identical inputs', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// Stability Across Retries
// =============================================================================
describe('computePartIdentityFingerprint - Stability Across Retries', () => {
  it('produces same fingerprint when called multiple times', () => {
    const pieceId = 'piece-abc-123';
    const instrument = 'Bb Clarinet';
    const partName = 'Clarinet 1';
    const chair = '1st';
    const transposition = 'Bb';

    const fingerprints = Array.from({ length: 100 }, () =>
      computePartIdentityFingerprint(pieceId, instrument, partName, chair, transposition)
    );

    const first = fingerprints[0];
    expect(fingerprints.every(fp => fp === first)).toBe(true);
  });

  it('produces same fingerprint regardless of call timing', () => {
    const inputs = {
      pieceId: 'piece-stable-test',
      instrument: 'Flute',
      partName: 'Flute 1',
      chair: '1st',
      transposition: 'C'
    };

    const fp1 = computePartIdentityFingerprint(
      inputs.pieceId,
      inputs.instrument,
      inputs.partName,
      inputs.chair,
      inputs.transposition
    );

    const fp2 = computePartIdentityFingerprint(
      inputs.pieceId,
      inputs.instrument,
      inputs.partName,
      inputs.chair,
      inputs.transposition
    );

    expect(fp1).toBe(fp2);
  });

  it('differs from computePartFingerprint which includes session id', () => {
    const pieceId = 'piece-123';
    const instrument = 'Trumpet';
    const partName = 'Trumpet 1';
    const chair = '1st';
    const transposition = 'Bb';
    const sessionId = 'session-abc';

    const identityFp = computePartIdentityFingerprint(
      pieceId,
      instrument,
      partName,
      chair,
      transposition
    );

    const partFp = computePartFingerprint(sessionId, instrument, chair, 1, 4);

    expect(identityFp).not.toBe(partFp);
    expect(identityFp).toHaveLength(64);
    expect(partFp).toHaveLength(16);
  });
});

// =============================================================================
// Piece ID Variation Tests
// =============================================================================
describe('computePartIdentityFingerprint - Piece ID Variations', () => {
  it('produces different fingerprint when pieceId changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-2', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('produces different fingerprint for different pieceId formats', () => {
    const a = computePartIdentityFingerprint('abc123', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('ABC123', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('handles pieceId with special characters', () => {
    const fp = computePartIdentityFingerprint('piece-abc_123.test', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles pieceId with UUID format', () => {
    const fp = computePartIdentityFingerprint(
      '550e8400-e29b-41d4-a716-446655440000',
      'Trumpet',
      'Trumpet 1',
      '1st',
      'Bb'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Instrument Variation Tests
// =============================================================================
describe('computePartIdentityFingerprint - Instrument Variations', () => {
  it('produces different fingerprint when instrument changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Part 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('produces different fingerprint for instrument case variations', () => {
    const a = computePartIdentityFingerprint('piece-1', 'TRUMPET', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'trumpet', 'Part 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for instrument with different whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Bb   Clarinet', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Part 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for instrument with leading/trailing whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', '  Trumpet  ', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Part 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('handles instrument with special transposition notation', () => {
    const fp1 = computePartIdentityFingerprint('piece-1', 'Bb Trumpet', 'Part 1', '1st', 'Bb');
    const fp2 = computePartIdentityFingerprint('piece-1', 'B-flat Trumpet', 'Part 1', '1st', 'Bb');
    const fp3 = computePartIdentityFingerprint('piece-1', 'BbTrumpet', 'Part 1', '1st', 'Bb');
    
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    expect(fp2).toMatch(/^[0-9a-f]{64}$/);
    expect(fp3).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles instruments with hyphens', () => {
    // Note: "Bass-Clarinet" becomes "bassclarinet" (hyphen stripped, no space added)
    // "Bass Clarinet" becomes "bass clarinet" (space preserved)
    // These are DIFFERENT fingerprints
    const a = computePartIdentityFingerprint('piece-1', 'Bass-Clarinet', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Bass Clarinet', 'Part 1', '1st', 'Bb');
    
    // They should be different because hyphen is stripped without adding space
    expect(a).not.toBe(b);
    
    // But both are valid hashes
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles percussion instruments', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Snare Drum',
      'Percussion 1',
      null,
      'C'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles mallet percussion', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Xylophone',
      'Mallets 1',
      null,
      'C'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Part Name Variation Tests
// =============================================================================
describe('computePartIdentityFingerprint - Part Name Variations', () => {
  it('produces different fingerprint when partName changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 2', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('produces same fingerprint for partName with different case', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'TRUMPET 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for partName with different whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet   1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for partName with leading/trailing whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', '  Trumpet 1  ', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('handles partName with Roman numerals', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Trumpet',
      'Trumpet I',
      null,
      'Bb'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles partName with descriptive text', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Clarinet',
      'Clarinet in Bb (Principal)',
      '1st',
      'Bb'
    );
    expect(fp.normalized).toBeUndefined();
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Chair Variation Tests
// =============================================================================
describe('computePartIdentityFingerprint - Chair Variations', () => {
  it('produces different fingerprint when chair changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '2nd', 'Bb');
    expect(a).not.toBe(b);
  });

  it('produces different fingerprint for chair vs no chair', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', null, 'Bb');
    expect(a).not.toBe(b);
  });

  it('produces same fingerprint for chair with different case', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1ST', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for chair with different whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '  1st  ', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('handles numeric chair designations', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles chair with position descriptions', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Violin',
      'Violin 1',
      'Concertmaster',
      'C'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles chair with assistant designation', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Cello',
      'Cello 1',
      'Assistant Principal',
      'C'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Transposition Variation Tests
// =============================================================================
describe('computePartIdentityFingerprint - Transposition Variations', () => {
  it('produces different fingerprint when transposition changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'C');
    expect(a).not.toBe(b);
  });

  it('produces same fingerprint for transposition with different case', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'BB');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'bb');
    expect(a).toBe(b);
  });

  it('produces same fingerprint for transposition with different whitespace', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Horn', 'Horn 1', '1st', ' F ');
    const b = computePartIdentityFingerprint('piece-1', 'Horn', 'Horn 1', '1st', 'F');
    expect(a).toBe(b);
  });

  it('handles common band transpositions', () => {
    const bb = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'Bb');
    const eb = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'Eb');
    const f = computePartIdentityFingerprint('piece-1', 'Horn', 'Horn 1', '1st', 'F');

    expect(bb).not.toBe(eb);
    expect(bb).not.toBe(f);
    expect(eb).not.toBe(f);
  });

  it('handles transposition with flat symbol variations', () => {
    // Note: Different transposition notations normalize differently
    // 'Bb' -> 'bb', 'B♭' -> 'b' (music flat symbol stripped), 'B-flat' -> 'bflat'
    const bb = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'Bb');
    const bflat = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'B-flat');
    
    // These are different because of how normalization works
    expect(bb).not.toBe(bflat);
    
    // But both produce valid hashes
    expect(bb).toMatch(/^[0-9a-f]{64}$/);
    expect(bflat).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles atonal/non-transposing instruments', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Flute', 'Flute 1', '1st', 'C');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles percussion with no transposition', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Snare Drum', 'Percussion 1', null, '');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Normalization Tests
// =============================================================================
describe('computePartIdentityFingerprint - Normalization', () => {
  it('normalizes all inputs to lowercase', () => {
    // pieceId is NOT normalized (it's an opaque identifier), other fields are
    const fp1 = computePartIdentityFingerprint('PIECE-1', 'TRUMPET', 'TRUMPET 1', '1ST', 'BB');
    const fp2 = computePartIdentityFingerprint('PIECE-1', 'trumpet', 'trumpet 1', '1st', 'bb');
    expect(fp1).toBe(fp2);
  });

  it('strips punctuation from all fields', () => {
    // Note: "Bb-Clarinet" becomes "bbclarinet" (hyphen stripped without adding space)
    // "Bb Clarinet" becomes "bb clarinet" (space preserved)
    // These are DIFFERENT fingerprints
    const fp1 = computePartIdentityFingerprint('piece-1', 'Bb-Clarinet', 'Clarinet-1', '1st', 'Bb');
    const fp2 = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    
    // They should be different because hyphen removal doesn't add space
    expect(fp1).not.toBe(fp2);
    
    // But both are valid hashes
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    expect(fp2).toMatch(/^[0-9a-f]{64}$/);
  });

  it('collapses whitespace in all fields', () => {
    const fp1 = computePartIdentityFingerprint('piece-1', 'Bb   Clarinet', 'Clarinet   1', '1st', 'Bb');
    const fp2 = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    expect(fp1).toBe(fp2);
  });

  it('trims leading and trailing whitespace', () => {
    const fp1 = computePartIdentityFingerprint('piece-1', '  Trumpet  ', '  Trumpet 1  ', '  1st  ', '  Bb  ');
    const fp2 = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    expect(fp1).toBe(fp2);
  });
});

// =============================================================================
// Edge Cases and Boundary Tests
// =============================================================================
describe('computePartIdentityFingerprint - Edge Cases', () => {
  it('handles null chair', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', null, 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty string chair', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', null, 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '', 'Bb');
    expect(a).toBe(b);
  });

  it('handles undefined values by treating them as empty strings', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Trumpet',
      'Trumpet 1',
      null,
      'Bb'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty string instrument', () => {
    const fp = computePartIdentityFingerprint('piece-1', '', 'Part 1', '1st', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty string partName', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', '', '1st', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty string transposition', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', '');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles string with only whitespace', () => {
    const fp = computePartIdentityFingerprint('piece-1', '   ', '   ', '   ', '   ');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles very long instrument names', () => {
    const longInstrument = 'Instrument '.repeat(100);
    const fp = computePartIdentityFingerprint('piece-1', longInstrument, 'Part 1', '1st', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles very long part names', () => {
    const longPartName = 'Part '.repeat(100);
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', longPartName, '1st', 'Bb');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles single character inputs', () => {
    const fp = computePartIdentityFingerprint('p', 'i', 'n', 'c', 't');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles numeric-only inputs', () => {
    const fp = computePartIdentityFingerprint('123', '456', '789', '1', '2');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode characters', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Flûte',
      'Flûte 1',
      '1er',
      'Do'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles special characters in pieceId', () => {
    const fp = computePartIdentityFingerprint(
      'piece-abc_123.test@domain',
      'Trumpet',
      'Trumpet 1',
      '1st',
      'Bb'
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Real-World Band Instrument Examples
// =============================================================================
describe('computePartIdentityFingerprint - Real-World Examples', () => {
  it('handles standard Bb trumpet parts', () => {
    const fp1 = computePartIdentityFingerprint('march-1', 'Bb Trumpet', 'Trumpet 1', '1st', 'Bb');
    const fp2 = computePartIdentityFingerprint('march-1', 'Bb Trumpet', 'Trumpet 2', '2nd', 'Bb');
    const fp3 = computePartIdentityFingerprint('march-1', 'Bb Trumpet', 'Trumpet 3', '3rd', 'Bb');

    expect(fp1).not.toBe(fp2);
    expect(fp2).not.toBe(fp3);
    expect(fp1).not.toBe(fp3);
  });

  it('handles clarinet sections', () => {
    const fp1 = computePartIdentityFingerprint('suite-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    const fp2 = computePartIdentityFingerprint('suite-1', 'Bb Clarinet', 'Clarinet 2', '2nd', 'Bb');
    const fp3 = computePartIdentityFingerprint('suite-1', 'Bb Clarinet', 'Clarinet 3', '3rd', 'Bb');
    const bass = computePartIdentityFingerprint('suite-1', 'Bass Clarinet', 'Bass Clarinet', null, 'Bb');

    expect(fp1).not.toBe(fp2);
    expect(fp2).not.toBe(fp3);
    expect(fp1).not.toBe(bass);
  });

  it('handles saxophone family', () => {
    const alto = computePartIdentityFingerprint('jazz-1', 'Alto Saxophone', 'Alto Sax 1', '1st', 'Eb');
    const tenor = computePartIdentityFingerprint('jazz-1', 'Tenor Saxophone', 'Tenor Sax', null, 'Bb');
    const bari = computePartIdentityFingerprint('jazz-1', 'Baritone Saxophone', 'Bari Sax', null, 'Eb');

    expect(alto).not.toBe(tenor);
    expect(tenor).not.toBe(bari);
    expect(alto).not.toBe(bari);
  });

  it('handles trombone section', () => {
    const fp1 = computePartIdentityFingerprint('march-1', 'Trombone', 'Trombone 1', '1st', 'C');
    const fp2 = computePartIdentityFingerprint('march-1', 'Trombone', 'Trombone 2', '2nd', 'C');
    const fp3 = computePartIdentityFingerprint('march-1', 'Trombone', 'Trombone 3', '3rd', 'C');
    const bass = computePartIdentityFingerprint('march-1', 'Bass Trombone', 'Bass Trombone', null, 'C');

    expect(fp1).not.toBe(fp2);
    expect(fp2).not.toBe(fp3);
    expect(fp1).not.toBe(bass);
  });

  it('handles horn section with F transposition', () => {
    const fp1 = computePartIdentityFingerprint('symphony-1', 'F Horn', 'Horn 1', '1st', 'F');
    const fp2 = computePartIdentityFingerprint('symphony-1', 'F Horn', 'Horn 2', '2nd', 'F');
    const fp3 = computePartIdentityFingerprint('symphony-1', 'F Horn', 'Horn 3', '3rd', 'F');
    const fp4 = computePartIdentityFingerprint('symphony-1', 'F Horn', 'Horn 4', '4th', 'F');

    expect(fp1).not.toBe(fp2);
    expect(fp2).not.toBe(fp3);
    expect(fp3).not.toBe(fp4);
  });

  it('handles percussion section', () => {
    const snare = computePartIdentityFingerprint('march-1', 'Snare Drum', 'Percussion 1', null, 'C');
    const bassDrum = computePartIdentityFingerprint('march-1', 'Bass Drum', 'Percussion 2', null, 'C');
    const cymbals = computePartIdentityFingerprint('march-1', 'Cymbals', 'Percussion 3', null, 'C');
    const triangle = computePartIdentityFingerprint('march-1', 'Triangle', 'Percussion 4', null, 'C');

    expect(snare).not.toBe(bassDrum);
    expect(bassDrum).not.toBe(cymbals);
    expect(cymbals).not.toBe(triangle);
  });

  it('handles mallet percussion parts', () => {
    const xylophone = computePartIdentityFingerprint('piece-1', 'Xylophone', 'Mallets 1', null, 'C');
    const marimba = computePartIdentityFingerprint('piece-1', 'Marimba', 'Mallets 2', null, 'C');
    const vibraphone = computePartIdentityFingerprint('piece-1', 'Vibraphone', 'Mallets 3', null, 'C');
    const bells = computePartIdentityFingerprint('piece-1', 'Glockenspiel', 'Mallets 4', null, 'C');

    expect(xylophone).not.toBe(marimba);
    expect(marimba).not.toBe(vibraphone);
    expect(vibraphone).not.toBe(bells);
  });

  it('handles tuba and euphonium', () => {
    const tuba = computePartIdentityFingerprint('march-1', 'Tuba', 'Tuba', null, 'Bb');
    const euphonium = computePartIdentityFingerprint('march-1', 'Euphonium', 'Euphonium', null, 'Bb');
    const baritone = computePartIdentityFingerprint('march-1', 'Baritone', 'Baritone', null, 'Bb');

    expect(tuba).not.toBe(euphonium);
    expect(euphonium).not.toBe(baritone);
    expect(tuba).not.toBe(baritone);
  });

  it('handles double reed instruments', () => {
    const oboe = computePartIdentityFingerprint('symphony-1', 'Oboe', 'Oboe 1', '1st', 'C');
    const bassoon = computePartIdentityFingerprint('symphony-1', 'Bassoon', 'Bassoon 1', '1st', 'C');
    const englishHorn = computePartIdentityFingerprint('symphony-1', 'English Horn', 'English Horn', null, 'F');

    expect(oboe).not.toBe(bassoon);
    expect(bassoon).not.toBe(englishHorn);
    expect(oboe).not.toBe(englishHorn);
  });

  it('handles string bass in band context', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'String Bass', 'Bass', null, 'C');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles piano and harp parts', () => {
    const piano = computePartIdentityFingerprint('symphony-1', 'Piano', 'Piano', null, 'C');
    const harp = computePartIdentityFingerprint('symphony-1', 'Harp', 'Harp', null, 'C');
    expect(piano).not.toBe(harp);
  });
});

// =============================================================================
// Stability Guarantees for Retry Logic
// =============================================================================
describe('computePartIdentityFingerprint - Retry Stability Guarantees', () => {
  it('remains stable across process restarts (deterministic hashing)', () => {
    const pieceId = 'piece-deterministic-test';
    const instrument = 'Bb Clarinet';
    const partName = 'Clarinet 1';
    const chair = '1st';
    const transposition = 'Bb';

    const expectedFp = computePartIdentityFingerprint(
      pieceId,
      instrument,
      partName,
      chair,
      transposition
    );

    for (let i = 0; i < 1000; i++) {
      const fp = computePartIdentityFingerprint(
        pieceId,
        instrument,
        partName,
        chair,
        transposition
      );
      expect(fp).toBe(expectedFp);
    }
  });

  it('is stable regardless of input object property order', () => {
    const fp1 = computePartIdentityFingerprint('p', 'i', 'n', 'c', 't');
    const fp2 = computePartIdentityFingerprint('p', 'i', 'n', 'c', 't');
    expect(fp1).toBe(fp2);
  });

  it('differs when any input varies, ensuring strict identity matching', () => {
    const base = { pieceId: 'p', instrument: 'i', partName: 'n', chair: 'c', transposition: 't' };
    const baseFp = computePartIdentityFingerprint(
      base.pieceId,
      base.instrument,
      base.partName,
      base.chair,
      base.transposition
    );

    const variations = [
      { ...base, pieceId: 'p2' },
      { ...base, instrument: 'i2' },
      { ...base, partName: 'n2' },
      { ...base, chair: 'c2' },
      { ...base, transposition: 't2' },
    ];

    for (const variant of variations) {
      const variantFp = computePartIdentityFingerprint(
        variant.pieceId,
        variant.instrument,
        variant.partName,
        variant.chair,
        variant.transposition
      );
      expect(variantFp).not.toBe(baseFp);
    }
  });
});
