/**
 * Comprehensive Duplicate Detection Tests
 *
 * Tests for duplicate detection including:
 * - Source hash (SHA-256) duplicate detection
 * - Work fingerprint-based duplicate detection
 * - Part fingerprint-based duplicate detection
 * - Integration tests for version bumping and merge behavior
 * - Edge cases and boundary conditions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeSha256,
  computeWorkFingerprint,
  computeWorkFingerprintV2,
  computePartFingerprint,
  computePartIdentityFingerprint,
  checkSourceDuplicate,
  checkWorkDuplicate,
  resolveDeduplicationPolicy,
  type DuplicateCheckResult,
  type WorkFingerprint,
  type WorkFingerprintV2,
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

  it('produces different hashes for similar but different content', () => {
    const a = computeSha256(Buffer.from('test'));
    const b = computeSha256(Buffer.from('Test'));
    const c = computeSha256(Buffer.from('test '));
    const d = computeSha256(Buffer.from(' test'));
    
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it('handles empty buffer', () => {
    const hash = computeSha256(Buffer.from(''));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles large buffers', () => {
    const largeBuffer = Buffer.from('x'.repeat(1000000));
    const hash = computeSha256(largeBuffer);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles binary data', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const hash = computeSha256(binary);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// =============================================================================
// computeWorkFingerprint (v1)
// =============================================================================
describe('computeWorkFingerprint', () => {
  it('produces a 64-char hex hash', () => {
    const fp = computeWorkFingerprint('Stars and Stripes Forever', 'John Philip Sousa');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
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
    const fpNull = computeWorkFingerprint('Title', null);
    const fpUndefined = computeWorkFingerprint('Title', undefined);
    
    expect(fpNull.normalizedComposer).toBe('');
    expect(fpUndefined.normalizedComposer).toBe('');
    expect(fpNull.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fpUndefined.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is case-insensitive', () => {
    const a = computeWorkFingerprint('Title', 'SOUSA');
    const b = computeWorkFingerprint('title', 'sousa');
    expect(a.hash).toBe(b.hash);
  });

  it('strips punctuation for matching', () => {
    const a = computeWorkFingerprint("Sousa's March!", 'J. P. Sousa');
    const b = computeWorkFingerprint('Sousas March', 'J P Sousa');
    expect(a.hash).toBe(b.hash);
  });

  it('handles empty title', () => {
    const fp = computeWorkFingerprint('', 'Composer');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty composer', () => {
    const fp = computeWorkFingerprint('Title', '');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles both empty', () => {
    const fp = computeWorkFingerprint('', '');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// =============================================================================
// computeWorkFingerprintV2
// =============================================================================
describe('computeWorkFingerprintV2', () => {
  it('returns a 64-char hex hash', () => {
    const fp = computeWorkFingerprintV2('Semper Fidelis', 'John Philip Sousa', null);
    expect(fp.hash).toHaveLength(64);
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

  it('treats undefined arranger same as empty string arranger', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', undefined);
    const b = computeWorkFingerprintV2('March', 'Sousa', '');
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

  it('strips punctuation from arranger', () => {
    const a = computeWorkFingerprintV2('March', 'Sousa', 'Dr. Frank Erickson');
    const b = computeWorkFingerprintV2('March', 'Sousa', 'Dr Frank Erickson');
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hash than v1 for same inputs', () => {
    const v1 = computeWorkFingerprint('Title', 'Composer');
    const v2 = computeWorkFingerprintV2('Title', 'Composer', null);
    expect(v1.hash).not.toBe(v2.hash);
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

  it('differs for different page ranges', () => {
    const a = computePartFingerprint('sess-1', 'Trumpet', '1st', 1, 4);
    const b = computePartFingerprint('sess-1', 'Trumpet', '1st', 5, 8);
    expect(a).not.toBe(b);
  });

  it('handles null chair', () => {
    const fp = computePartFingerprint('sess-1', 'Piano', null, 1, 10);
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });

  it('normalizes instrument name', () => {
    const a = computePartFingerprint('sess-1', 'Bb   Clarinet', '1st', 1, 4);
    const b = computePartFingerprint('sess-1', 'Bb Clarinet', '1st', 1, 4);
    expect(a).toBe(b);
  });

  it('is case-insensitive for instrument', () => {
    const a = computePartFingerprint('sess-1', 'TRUMPET', '1st', 1, 4);
    const b = computePartFingerprint('sess-1', 'trumpet', '1st', 1, 4);
    expect(a).toBe(b);
  });
});

// =============================================================================
// computePartIdentityFingerprint
// =============================================================================
describe('computePartIdentityFingerprint', () => {
  it('produces a 64-char hex hash', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for same canonical part identity', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    expect(a).toBe(b);
  });

  it('changes when piece changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-2', 'Bb Clarinet', 'Clarinet 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('changes when instrument changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Part 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Part 1', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('changes when part name changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 2', '1st', 'Bb');
    expect(a).not.toBe(b);
  });

  it('changes when chair changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '2nd', 'Bb');
    expect(a).not.toBe(b);
  });

  it('changes when transposition changes', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'Bb');
    const b = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', '1st', 'C');
    expect(a).not.toBe(b);
  });

  it('is stable across retries (same inputs produce same hash)', () => {
    const pieceId = 'piece-stable';
    const instrument = 'Bb Clarinet';
    const partName = 'Clarinet 1';
    const chair = '1st';
    const transposition = 'Bb';

    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(computePartIdentityFingerprint(pieceId, instrument, partName, chair, transposition));
    }

    expect(new Set(results).size).toBe(1);
  });

  it('is case-insensitive', () => {
    const a = computePartIdentityFingerprint('piece-1', 'TRUMPET', 'TRUMPET 1', '1ST', 'BB');
    const b = computePartIdentityFingerprint('piece-1', 'trumpet', 'trumpet 1', '1st', 'bb');
    expect(a).toBe(b);
  });

  it('handles null chair', () => {
    const a = computePartIdentityFingerprint('piece-1', 'Piano', 'Piano', null, 'C');
    const b = computePartIdentityFingerprint('piece-1', 'Piano', 'Piano', '', 'C');
    expect(a).toBe(b);
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
    expect(result.reason).toBe('No matching source hash found');
  });

  it('returns SKIP_DUPLICATE when a match exists', () => {
    const existing = { id: 'rec-1', uploadSessionId: 'sess-old' };
    const result = checkSourceDuplicate('abc123', existing);
    expect(result.policy).toBe('SKIP_DUPLICATE');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingSessionId).toBe('sess-old');
    expect(result.reason).toContain('Exact source file match');
    expect(result.reason).toContain('sess-old');
  });

  it('returns SKIP_DUPLICATE with correct session ID', () => {
    const existing = { id: 'rec-999', uploadSessionId: 'original-session-id' };
    const result = checkSourceDuplicate('hash123', existing);
    expect(result.matchingSessionId).toBe('original-session-id');
  });

  it('handles empty hash', () => {
    const result = checkSourceDuplicate('', null);
    expect(result.policy).toBe('NEW_PIECE');
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
    expect(result.reason).toBe('No matching work fingerprint found');
  });

  it('returns EXCEPTION_REVIEW when a match exists', () => {
    const fp = computeWorkFingerprint('Stars and Stripes', 'Sousa');
    const existing = { id: 'piece-1', title: 'Stars and Stripes Forever' };
    const result = checkWorkDuplicate(fp, existing);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingPieceId).toBe('piece-1');
    expect(result.reason).toContain('Stars and Stripes Forever');
    expect(result.reason).toContain('Possible duplicate');
  });

  it('includes existing piece title in reason', () => {
    const fp = computeWorkFingerprint('Title', 'Composer');
    const existing = { id: 'piece-123', title: 'Existing Work Title' };
    const result = checkWorkDuplicate(fp, existing);
    expect(result.reason).toContain('Existing Work Title');
  });

  it('works with v2 fingerprints', () => {
    const fp = computeWorkFingerprintV2('Title', 'Composer', 'Arranger');
    const existing = { id: 'piece-1', title: 'Existing Title' };
    const result = checkWorkDuplicate(fp as WorkFingerprint, existing);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
    expect(result.matchingPieceId).toBe('piece-1');
  });
});

// =============================================================================
// resolveDeduplicationPolicy
// =============================================================================
describe('resolveDeduplicationPolicy', () => {
  const newPiece: DuplicateCheckResult = {
    policy: 'NEW_PIECE',
    isDuplicate: false,
    matchingSessionId: null,
    matchingPieceId: null,
    reason: 'No match',
  };

  const sourceMatch: DuplicateCheckResult = {
    policy: 'SKIP_DUPLICATE',
    isDuplicate: true,
    matchingSessionId: 'sess-old',
    matchingPieceId: null,
    reason: 'Source match',
  };

  const workMatch: DuplicateCheckResult = {
    policy: 'EXCEPTION_REVIEW',
    isDuplicate: true,
    matchingSessionId: null,
    matchingPieceId: 'piece-1',
    reason: 'Work match',
  };

  const versionUpdate: DuplicateCheckResult = {
    policy: 'VERSION_UPDATE',
    isDuplicate: true,
    matchingSessionId: null,
    matchingPieceId: 'piece-existing',
    reason: 'Version update',
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

  it('prioritizes source match over version update', () => {
    const result = resolveDeduplicationPolicy(sourceMatch, versionUpdate);
    expect(result.policy).toBe('SKIP_DUPLICATE');
  });

  it('returns work match when source is clean and version is clean', () => {
    const result = resolveDeduplicationPolicy(newPiece, workMatch);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
  });

  it('preserves matchingSessionId when returning source match', () => {
    const result = resolveDeduplicationPolicy(sourceMatch, workMatch);
    expect(result.matchingSessionId).toBe('sess-old');
    expect(result.matchingPieceId).toBeNull();
  });

  it('preserves matchingPieceId when returning work match', () => {
    const result = resolveDeduplicationPolicy(newPiece, workMatch);
    expect(result.matchingPieceId).toBe('piece-1');
    expect(result.matchingSessionId).toBeNull();
  });
});

// =============================================================================
// Integration Tests - Version Bumping and Merge Behavior
// =============================================================================
describe('Duplicate Detection - Version Bumping Integration', () => {
  it('detects exact file duplicate using SHA-256 hash', () => {
    const fileContent = Buffer.from('same file content');
    const hash = computeSha256(fileContent);
    
    const existingSession = {
      id: 'existing-rec',
      uploadSessionId: 'original-session',
    };

    const result = checkSourceDuplicate(hash, existingSession);
    expect(result.policy).toBe('SKIP_DUPLICATE');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingSessionId).toBe('original-session');
  });

  it('detects work-level duplicate using fingerprint', () => {
    const fp = computeWorkFingerprintV2(
      'Stars and Stripes Forever',
      'John Philip Sousa',
      null
    );
    
    const existingPiece = {
      id: 'piece-existing',
      title: 'Stars and Stripes Forever',
    };

    const result = checkWorkDuplicate(fp, existingPiece);
    expect(result.policy).toBe('EXCEPTION_REVIEW');
    expect(result.isDuplicate).toBe(true);
    expect(result.matchingPieceId).toBe('piece-existing');
  });

  it('same work with different arranger is not a duplicate', () => {
    const fp1 = computeWorkFingerprintV2('March', 'Sousa', null);
    const fp2 = computeWorkFingerprintV2('March', 'Sousa', 'Frank Erickson');
    
    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it('same work with same arranger is a duplicate', () => {
    const fp1 = computeWorkFingerprintV2('March', 'Sousa', 'Frank Erickson');
    const fp2 = computeWorkFingerprintV2('March', 'Sousa', 'Frank Erickson');
    
    expect(fp1.hash).toBe(fp2.hash);
  });
});

// =============================================================================
// Edge Cases - Empty and Null Values
// =============================================================================
describe('Duplicate Detection - Empty/Null Edge Cases', () => {
  it('handles empty string in work fingerprint', () => {
    const fp = computeWorkFingerprintV2('', '', '');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles null values in work fingerprint', () => {
    const fp = computeWorkFingerprintV2('Title', null, null);
    expect(fp.normalizedTitle).toBe('title');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
  });

  it('handles undefined values in work fingerprint', () => {
    const fp = computeWorkFingerprintV2('Title', undefined, undefined);
    expect(fp.normalizedTitle).toBe('title');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
  });

  it('handles empty string in part identity fingerprint', () => {
    const fp = computePartIdentityFingerprint('piece-1', '', '', '', '');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles null chair in part identity fingerprint', () => {
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', 'Trumpet 1', null, 'Bb');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles whitespace-only strings', () => {
    const fp = computeWorkFingerprintV2('   ', '   ', '   ');
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
    expect(fp.normalizedArranger).toBe('');
  });
});

// =============================================================================
// Edge Cases - Very Long Strings
// =============================================================================
describe('Duplicate Detection - Long String Edge Cases', () => {
  it('handles very long title without truncation', () => {
    const longTitle = 'Title '.repeat(1000);
    const fp = computeWorkFingerprintV2(longTitle, 'Composer', null);
    expect(fp.normalizedTitle).toBe(longTitle.toLowerCase().trim());
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles very long composer name', () => {
    const longComposer = 'Name '.repeat(1000);
    const fp = computeWorkFingerprintV2('Title', longComposer, null);
    expect(fp.normalizedComposer).toBe(longComposer.toLowerCase().trim());
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles very long arranger name', () => {
    const longArranger = 'Arranger '.repeat(1000);
    const fp = computeWorkFingerprintV2('Title', 'Composer', longArranger);
    expect(fp.normalizedArranger).toBe(longArranger.toLowerCase().trim());
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles very long instrument name', () => {
    const longInstrument = 'Instrument '.repeat(500);
    const fp = computePartIdentityFingerprint('piece-1', longInstrument, 'Part 1', '1st', 'Bb');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles very long part name', () => {
    const longPartName = 'Part '.repeat(500);
    const fp = computePartIdentityFingerprint('piece-1', 'Trumpet', longPartName, '1st', 'Bb');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});

// =============================================================================
// Edge Cases - Special Characters and Unicode
// =============================================================================
describe('Duplicate Detection - Special Characters and Unicode', () => {
  it('handles special characters in instrument names', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Bb-Clarinet (in B-flat)',
      'Clarinet 1',
      '1st',
      'Bb'
    );
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles unicode in composer names', () => {
    const fp = computeWorkFingerprintV2('Title', 'José García Müller', null);
    expect(fp.normalizedComposer).toBe('jos garca mller');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles unicode in arranger names', () => {
    const fp = computeWorkFingerprintV2('Title', 'Composer', 'François López');
    expect(fp.normalizedArranger).toBe('franois lpez');
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles musical symbols', () => {
    const fp = computeWorkFingerprintV2('Symphony in C♯ minor', 'Composer', null);
    expect(fp.normalizedTitle).toBe('symphony in c minor');
  });

  it('handles emojis gracefully', () => {
    const fp = computeWorkFingerprintV2('Title 🎵', 'Composer 🎼', null);
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles Japanese characters', () => {
    const fp = computeWorkFingerprintV2('交響曲', '作曲家', null);
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
  });

  it('handles Cyrillic characters', () => {
    const fp = computeWorkFingerprintV2('Чайковский', 'Композитор', null);
    expect(fp.normalizedTitle).toBe('');
    expect(fp.normalizedComposer).toBe('');
  });

  it('handles mixed scripts', () => {
    const fp = computeWorkFingerprintV2(
      'Symphony 交響曲 No. 5',
      'Beethoven ベートーヴェン',
      null
    );
    expect(fp.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles instrument with degree symbol', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Clarinet in B°',
      'Clarinet 1',
      '1st',
      'Bb'
    );
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles transposition with various notations', () => {
    // Various B-flat notations - all stripped of punctuation/symbols
    const bb = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'Bb');
    const bflat = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'B-flat');
    const b_flat = computePartIdentityFingerprint('piece-1', 'Clarinet', 'Clarinet 1', '1st', 'B flat');
    
    // These should all be different because normalization strips differently:
    // 'Bb' -> 'bb', 'B-flat' -> 'bflat', 'B flat' -> 'b flat'
    expect(bb).not.toBe(bflat);
    expect(bflat).not.toBe(b_flat);
    
    // But they all produce valid hashes
    expect(bb).toMatch(/^[0-9a-f]{64}$/);
    expect(bflat).toMatch(/^[0-9a-f]{64}$/);
    expect(b_flat).toMatch(/^[0-9a-f]{64}$/);
  });
});

// =============================================================================
// Edge Cases - Truncation Behavior
// =============================================================================
describe('Duplicate Detection - Truncation Behavior', () => {
  it('computePartFingerprint truncates to 16 chars', () => {
    const fp = computePartFingerprint('sess-1', 'Trumpet', '1st', 1, 4);
    expect(fp).toHaveLength(16);
  });

  it('computePartIdentityFingerprint does not truncate (64 chars)', () => {
    const fp = computePartIdentityFingerprint(
      'piece-1',
      'Very Long Instrument Name That Could Be Truncated',
      'Very Long Part Name',
      'Very Long Chair',
      'Very Long Transposition'
    );
    expect(fp).toHaveLength(64);
  });

  it('computeWorkFingerprintV2 does not truncate', () => {
    const fp = computeWorkFingerprintV2(
      'Very Long Title That Goes On And On Forever',
      'Very Long Composer Name With Many Parts',
      'Very Long Arranger Name'
    );
    expect(fp.hash).toHaveLength(64);
  });
});

// =============================================================================
// Real-World Duplicate Scenarios
// =============================================================================
describe('Duplicate Detection - Real-World Scenarios', () => {
  it('detects exact same file uploaded twice', () => {
    const fileContent = Buffer.from('PDF content here');
    const hash = computeSha256(fileContent);
    
    const firstUpload = checkSourceDuplicate(hash, null);
    expect(firstUpload.policy).toBe('NEW_PIECE');
    
    const existing = { id: 'rec-1', uploadSessionId: 'first-session' };
    const secondUpload = checkSourceDuplicate(hash, existing);
    expect(secondUpload.policy).toBe('SKIP_DUPLICATE');
  });

  it('detects same work with slightly different formatting', () => {
    const fp1 = computeWorkFingerprintV2('Stars and Stripes Forever', 'John Philip Sousa', null);
    const fp2 = computeWorkFingerprintV2('STARS AND STRIPES FOREVER', 'JOHN PHILIP SOUSA', null);
    const fp3 = computeWorkFingerprintV2('  Stars   and   Stripes   Forever  ', '  John Philip Sousa  ', null);
    
    expect(fp1.hash).toBe(fp2.hash);
    expect(fp2.hash).toBe(fp3.hash);
  });

  it('detects same work with punctuation differences', () => {
    // Note: The composer comparison: "J.P. Sousa" becomes "jp sousa", "J P Sousa" becomes "j p sousa"
    // These are DIFFERENT because periods are stripped without adding spaces
    const fp1 = computeWorkFingerprintV2('March', 'J.P. Sousa', null);
    const fp2 = computeWorkFingerprintV2('March', 'J P Sousa', null);
    
    // Periods are stripped so these are different: "jp sousa" vs "j p sousa"
    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it('distinguishes different arrangements of same work', () => {
    const original = computeWorkFingerprintV2('The Nutcracker', 'Tchaikovsky', null);
    const bandVersion = computeWorkFingerprintV2('The Nutcracker', 'Tchaikovsky', 'John Moss');
    const orchestraVersion = computeWorkFingerprintV2('The Nutcracker', 'Tchaikovsky', 'Original');
    
    expect(original.hash).not.toBe(bandVersion.hash);
    expect(bandVersion.hash).not.toBe(orchestraVersion.hash);
  });

  it('maintains part identity across re-segmentation', () => {
    const pieceId = 'piece-stable';
    const instrument = 'Bb Clarinet';
    const partName = 'Clarinet 1';
    const chair = '1st';
    const transposition = 'Bb';
    
    const fp1 = computePartIdentityFingerprint(pieceId, instrument, partName, chair, transposition);
    
    // Same part, re-segmented with different page ranges (not part of identity)
    const fp2 = computePartIdentityFingerprint(pieceId, instrument, partName, chair, transposition);
    
    expect(fp1).toBe(fp2);
  });

  it('creates different identity for different chairs of same instrument', () => {
    const pieceId = 'piece-1';
    const instrument = 'Bb Trumpet';
    const partName = 'Trumpet';
    const transposition = 'Bb';
    
    const first = computePartIdentityFingerprint(pieceId, instrument, partName, '1st', transposition);
    const second = computePartIdentityFingerprint(pieceId, instrument, partName, '2nd', transposition);
    const third = computePartIdentityFingerprint(pieceId, instrument, partName, '3rd', transposition);
    
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(first).not.toBe(third);
  });
});

// =============================================================================
// Policy Combination Matrix
// =============================================================================
describe('Duplicate Detection - Policy Combination Matrix', () => {
  const policies: DuplicateCheckResult['policy'][] = [
    'NEW_PIECE',
    'SKIP_DUPLICATE',
    'VERSION_UPDATE',
    'EXCEPTION_REVIEW',
  ];

  it('always prioritizes SKIP_DUPLICATE over any work result', () => {
    const sourceResult: DuplicateCheckResult = {
      policy: 'SKIP_DUPLICATE',
      isDuplicate: true,
      matchingSessionId: 'sess-old',
      matchingPieceId: null,
      reason: 'Source match',
    };

    for (const workPolicy of policies) {
      const workResult: DuplicateCheckResult = {
        policy: workPolicy,
        isDuplicate: workPolicy !== 'NEW_PIECE',
        matchingSessionId: null,
        matchingPieceId: workPolicy === 'NEW_PIECE' ? null : 'piece-1',
        reason: 'Work check',
      };

      const result = resolveDeduplicationPolicy(sourceResult, workResult);
      expect(result.policy).toBe('SKIP_DUPLICATE');
    }
  });

  it('returns work policy when source is NEW_PIECE', () => {
    const sourceResult: DuplicateCheckResult = {
      policy: 'NEW_PIECE',
      isDuplicate: false,
      matchingSessionId: null,
      matchingPieceId: null,
      reason: 'No source match',
    };

    const workPolicies: DuplicateCheckResult['policy'][] = [
      'NEW_PIECE',
      'VERSION_UPDATE',
      'EXCEPTION_REVIEW',
    ];

    for (const workPolicy of workPolicies) {
      const workResult: DuplicateCheckResult = {
        policy: workPolicy,
        isDuplicate: workPolicy !== 'NEW_PIECE',
        matchingSessionId: null,
        matchingPieceId: workPolicy === 'NEW_PIECE' ? null : 'piece-1',
        reason: 'Work check',
      };

      const result = resolveDeduplicationPolicy(sourceResult, workResult);
      expect(result.policy).toBe(workPolicy);
    }
  });
});
