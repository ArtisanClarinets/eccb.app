/**
 * Tests for Duplicate Detection
 */
import { describe, it, expect } from 'vitest';
import {
  computeSha256,
  computeWorkFingerprint,
  computeWorkFingerprintV2,
  computePartFingerprint,
  checkSourceDuplicate,
  checkWorkDuplicate,
  resolveDeduplicationPolicy,
} from '../duplicate-detection';

// =============================================================================
// computeSha256
// =============================================================================
describe('computeSha256', () => {
  it('produces a 64-char hex string', () => {
    const hash = computeSha256(Buffer.from('hello world'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeSha256(Buffer.from('test data'));
    const b = computeSha256(Buffer.from('test data'));
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    const a = computeSha256(Buffer.from('file A'));
    const b = computeSha256(Buffer.from('file B'));
    expect(a).not.toBe(b);
  });

  it('accepts Uint8Array', () => {
    const hash = computeSha256(new Uint8Array([1, 2, 3]));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// =============================================================================
// computeWorkFingerprint
// =============================================================================
describe('computeWorkFingerprint', () => {
  it('produces a 16-char hex hash', () => {
    const fp = computeWorkFingerprint('Stars and Stripes Forever', 'John Philip Sousa');
    expect(fp.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('normalizes title for matching', () => {
    const fp = computeWorkFingerprint('  Stars  and  STRIPES  Forever  ', 'Sousa');
    expect(fp.normalizedTitle).toBe('stars and stripes forever');
  });

  it('normalizes composer for matching', () => {
    const fp = computeWorkFingerprint('Title', '  John Philip  SOUSA  ');
    expect(fp.normalizedComposer).toBe('john philip sousa');
  });

  it('is deterministic', () => {
    const a = computeWorkFingerprint('Title', 'Composer');
    const b = computeWorkFingerprint('Title', 'Composer');
    expect(a.hash).toBe(b.hash);
  });

  it('differs for different titles', () => {
    const a = computeWorkFingerprint('Title A', 'Composer');
    const b = computeWorkFingerprint('Title B', 'Composer');
    expect(a.hash).not.toBe(b.hash);
  });

  it('handles null/undefined composer', () => {
    const fp = computeWorkFingerprint('Title', null);
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is case-insensitive', () => {
    const a = computeWorkFingerprint('Title', 'SOUSA');
    const b = computeWorkFingerprint('title', 'sousa');
    expect(a.hash).toBe(b.hash);
  });

  it('strips punctuation for matching', () => {
    const a = computeWorkFingerprint("Sousa's March", 'J. P. Sousa');
    const b = computeWorkFingerprint('Sousas March', 'J P Sousa');
    expect(a.hash).toBe(b.hash);
  });
});

// =============================================================================
// computePartFingerprint
// =============================================================================
describe('computePartFingerprint', () => {
  it('produces a 16-char hex string', () => {
    const fp = computePartFingerprint('sess-1', 'Bb Clarinet', '1st', 1, 4);
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic', () => {
    const a = computePartFingerprint('sess-1', 'Trumpet', '2nd', 5, 8);
    const b = computePartFingerprint('sess-1', 'Trumpet', '2nd', 5, 8);
    expect(a).toBe(b);
  });

  it('differs for different sessions', () => {
    const a = computePartFingerprint('sess-1', 'Trumpet', '1st', 1, 4);
    const b = computePartFingerprint('sess-2', 'Trumpet', '1st', 1, 4);
    expect(a).not.toBe(b);
  });

  it('differs for different chair designations', () => {
    const a = computePartFingerprint('sess-1', 'Trumpet', '1st', 1, 4);
    const b = computePartFingerprint('sess-1', 'Trumpet', '2nd', 1, 4);
    expect(a).not.toBe(b);
  });

  it('handles null chair', () => {
    const fp = computePartFingerprint('sess-1', 'Piano', null, 1, 10);
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });
});

// =============================================================================
// checkSourceDuplicate
// =============================================================================
describe('checkSourceDuplicate', () => {
  it('returns NEW_PIECE when no existing session matches', () => {
    const result = checkSourceDuplicate('abc123', null);
    expect(result.policy).toBe('NEW_PIECE');
    expect(result.isDuplicate).toBe(false);
    expect(result.matchingSessionId).toBeNull();
  });

  it('returns SKIP_DUPLICATE when a match exists', () => {
    const existing = { id: 'rec-1', uploadSessionId: 'sess-old' };
    const result = checkSourceDuplicate('abc123', existing);
    expect(result.policy).toBe('SKIP_DUPLICATE');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingSessionId).toBe('sess-old');
  });
});

// =============================================================================
// checkWorkDuplicate
// =============================================================================
describe('checkWorkDuplicate', () => {
  it('returns NEW_PIECE when no existing piece matches', () => {
    const fp = computeWorkFingerprint('New Title', 'New Composer');
    const result = checkWorkDuplicate(fp, null);
    expect(result.policy).toBe('NEW_PIECE');
    expect(result.isDuplicate).toBe(false);
    expect(result.matchingPieceId).toBeNull();
  });

  it('returns EXCEPTION_REVIEW when a match exists', () => {
    const fp = computeWorkFingerprint('Stars and Stripes', 'Sousa');
    const existing = { id: 'piece-1', title: 'Stars and Stripes Forever' };
    const result = checkWorkDuplicate(fp, existing);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingPieceId).toBe('piece-1');
    expect(result.reason).toContain('Stars and Stripes Forever');
  });
});

// =============================================================================
// resolveDeduplicationPolicy
// =============================================================================
describe('resolveDeduplicationPolicy', () => {
  const newPiece = {
    policy: 'NEW_PIECE' as const,
    isDuplicate: false,
    matchingSessionId: null,
    matchingPieceId: null,
    reason: 'No match',
  };

  const sourceMatch = {
    policy: 'SKIP_DUPLICATE' as const,
    isDuplicate: true,
    matchingSessionId: 'sess-old',
    matchingPieceId: null,
    reason: 'Source match',
  };

  const workMatch = {
    policy: 'EXCEPTION_REVIEW' as const,
    isDuplicate: true,
    matchingSessionId: null,
    matchingPieceId: 'piece-1',
    reason: 'Work match',
  };

  it('returns NEW_PIECE when both checks are clean', () => {
    const result = resolveDeduplicationPolicy(newPiece, newPiece);
    expect(result.policy).toBe('NEW_PIECE');
    expect(result.isDuplicate).toBe(false);
  });

  it('returns source SKIP_DUPLICATE over work match', () => {
    const result = resolveDeduplicationPolicy(sourceMatch, workMatch);
    expect(result.policy).toBe('SKIP_DUPLICATE');
    expect(result.matchingSessionId).toBe('sess-old');
  });

  it('returns work EXCEPTION_REVIEW when source is clean', () => {
    const result = resolveDeduplicationPolicy(newPiece, workMatch);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
    expect(result.matchingPieceId).toBe('piece-1');
  });

  it('prioritizes source match over everything', () => {
    const result = resolveDeduplicationPolicy(sourceMatch, newPiece);
    expect(result.policy).toBe('SKIP_DUPLICATE');
  });
});

// =============================================================================
// computeWorkFingerprintV2 — arranger-aware fingerprint (regression A6)
// =============================================================================
describe('computeWorkFingerprintV2', () => {
  it('returns a 16-char hex hash', () => {
    const fp = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', null);
    expect(fp.hash).toHaveLength(16);
    expect(fp.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('includes arranger so arrangement hash differs from original', () => {
    const original = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', null);
    const arranged = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    expect(original.hash).not.toBe(arranged.hash);
  });

  it('treats null arranger same as empty string arranger', () => {
    const a = computeWorkFingerprintV2('Stars and Stripes Forever', 'Sousa', null);
    const b = computeWorkFingerprintV2('Stars and Stripes Forever', 'Sousa', '');
    expect(a.hash).toBe(b.hash);
  });

  it('is case- and whitespace-insensitive across all three fields', () => {
    const a = computeWorkFingerprintV2('Stars And Stripes Forever', 'Sousa', 'John Moss');
    const b = computeWorkFingerprintV2('stars and stripes forever', 'sousa', 'john moss');
    expect(a.hash).toBe(b.hash);
  });

  it('is deterministic', () => {
    const a = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    const b = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', 'Frank Erickson');
    expect(a.hash).toBe(b.hash);
  });

  it('exposes normalizedArranger field', () => {
    const fp = computeWorkFingerprintV2('Test', 'Composer', '  My Arranger  ');
    expect(fp.normalizedArranger).toBe('my arranger');
  });

  it('two different arrangers → two different hashes for same title+composer', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', 'Erickson');
    const b = computeWorkFingerprintV2('March', 'Sousa', 'Fennell');
    expect(a.hash).not.toBe(b.hash);
  });
});
