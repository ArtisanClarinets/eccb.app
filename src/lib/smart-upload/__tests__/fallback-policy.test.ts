/**
 * Tests for Fallback Policy — Pipeline Routing Engine
 */
import { describe, it, expect } from 'vitest';
import {
  determineRoute,
  needsOcr,
  needsSecondPass,
  DEFAULT_THRESHOLDS,
  type RoutingSignals,
  type PolicyThresholds,
} from '../fallback-policy';

/**
 * Build a RoutingSignals object with sane defaults, overriding as needed.
 */
function makeSignals(overrides: Partial<RoutingSignals> = {}): RoutingSignals {
  return {
    textCoverage: 0.8,
    metadataConfidence: 90,
    segmentationConfidence: 90,
    validPartCount: 5,
    hasMetadataConflicts: false,
    hasDuplicateFlag: false,
    requiresHumanReview: false,
    ocrStatus: 'NOT_NEEDED',
    secondPassStatus: 'NOT_NEEDED',
    commitStatus: 'NOT_STARTED',
    workflowStatus: 'PROCESSED',
    ...overrides,
  };
}

// =============================================================================
// Terminal State Guards
// =============================================================================
describe('determineRoute — Terminal states', () => {
  it('returns EXCEPTION_REVIEW for APPROVED workflow', () => {
    const result = determineRoute(makeSignals({ workflowStatus: 'APPROVED' }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
    expect(result.reasons).toContain('Session is in a terminal state');
  });

  it('returns EXCEPTION_REVIEW for COMMITTED workflow', () => {
    const result = determineRoute(makeSignals({ workflowStatus: 'COMMITTED' }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });

  it('returns EXCEPTION_REVIEW for REJECTED workflow', () => {
    const result = determineRoute(makeSignals({ workflowStatus: 'REJECTED' }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });
});

// =============================================================================
// Human Review Flag
// =============================================================================
describe('determineRoute — Human review flag', () => {
  it('returns EXCEPTION_REVIEW when requiresHumanReview is true', () => {
    const result = determineRoute(makeSignals({ requiresHumanReview: true }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
    expect(result.reasons).toContain('Session explicitly flagged for human review');
  });
});

// =============================================================================
// OCR Routing
// =============================================================================
describe('determineRoute — OCR routing', () => {
  it('returns OCR_REQUIRED when text coverage is below threshold', () => {
    const result = determineRoute(makeSignals({ textCoverage: 0.1 }));
    expect(result.route).toBe('OCR_REQUIRED');
  });

  it('returns OCR_REQUIRED when OCR is in progress (QUEUED)', () => {
    const result = determineRoute(makeSignals({ ocrStatus: 'QUEUED' }));
    expect(result.route).toBe('OCR_REQUIRED');
    expect(result.reasons).toContain('OCR is still in progress');
  });

  it('returns OCR_REQUIRED when OCR is IN_PROGRESS', () => {
    const result = determineRoute(makeSignals({ ocrStatus: 'IN_PROGRESS' }));
    expect(result.route).toBe('OCR_REQUIRED');
  });

  it('does not require OCR when text coverage is adequate', () => {
    const result = determineRoute(makeSignals({ textCoverage: 0.8 }));
    expect(result.route).not.toBe('OCR_REQUIRED');
  });
});

// =============================================================================
// Second Pass Routing
// =============================================================================
describe('determineRoute — Second pass routing', () => {
  it('returns SECOND_PASS_REQUIRED when metadata confidence is low', () => {
    const result = determineRoute(
      makeSignals({ metadataConfidence: 50, segmentationConfidence: 50 })
    );
    expect(result.route).toBe('SECOND_PASS_REQUIRED');
  });

  it('returns SECOND_PASS_REQUIRED when segmentation confidence is low', () => {
    const result = determineRoute(
      makeSignals({ segmentationConfidence: 60 })
    );
    expect(result.route).toBe('SECOND_PASS_REQUIRED');
  });

  it('returns SECOND_PASS_REQUIRED when metadata conflicts exist', () => {
    const result = determineRoute(
      makeSignals({ hasMetadataConflicts: true })
    );
    expect(result.route).toBe('SECOND_PASS_REQUIRED');
  });

  it('returns SECOND_PASS_REQUIRED when second pass is in progress', () => {
    const result = determineRoute(
      makeSignals({ secondPassStatus: 'QUEUED' })
    );
    expect(result.route).toBe('SECOND_PASS_REQUIRED');
  });
});

// =============================================================================
// Auto-Commit Route
// =============================================================================
describe('determineRoute — Auto-commit', () => {
  it('returns AUTO_COMMIT when all criteria are met', () => {
    const result = determineRoute(makeSignals());
    expect(result.route).toBe('AUTO_COMMIT');
  });

  it('returns AUTO_COMMIT for completed second pass with high confidence', () => {
    const result = determineRoute(
      makeSignals({ secondPassStatus: 'COMPLETE', metadataConfidence: 95 })
    );
    expect(result.route).toBe('AUTO_COMMIT');
  });

  it('blocks auto-commit when autonomous mode is disabled', () => {
    const thresholds: PolicyThresholds = { ...DEFAULT_THRESHOLDS, autonomousModeEnabled: false };
    const result = determineRoute(makeSignals(), thresholds);
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });

  it('blocks auto-commit when duplicate flag is set', () => {
    const result = determineRoute(makeSignals({ hasDuplicateFlag: true }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });

  it('blocks auto-commit when not enough parts', () => {
    const result = determineRoute(makeSignals({ validPartCount: 0 }));
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });

  it('blocks auto-commit when post-second-pass confidence is low', () => {
    const result = determineRoute(
      makeSignals({
        secondPassStatus: 'COMPLETE',
        metadataConfidence: 60,
      })
    );
    expect(result.route).toBe('EXCEPTION_REVIEW');
  });
});

// =============================================================================
// Default Text-Only Route
// =============================================================================
describe('determineRoute — Text-only default', () => {
  it('returns TEXT_ONLY when confidence too low for auto-commit but not needing second pass', () => {
    // Confidence is above second-pass threshold (85) but below auto-commit (80)?
    // Actually confidence 90 is above both. Let's construct a scenario:
    // autonomous mode off but we can't use that (goes to EXCEPTION).
    // Let's use: commitStatus already COMMITTED → goes to exception.
    // Actually, the default fallthrough is TEXT_ONLY when canAutoCommit fails.
    // If autonomous mode is disabled it goes to EXCEPTION_REVIEW.
    // Let's just disable autonomous with high-confidence, nope that's exception.
    // TEXT_ONLY is the fallthrough when nothing else matches but auto-commit criteria fail.
    // Let's test: fail auto-commit but pass all other gates by setting commitStatus to COMMITTED
    // Nope, commitStatus COMMITTED means it already passed.
    // The simplest case: high confidence, but commitStatus is IN_PROGRESS (can't commit again).
    const result = determineRoute(
      makeSignals({ commitStatus: 'IN_PROGRESS' })
    );
    expect(result.route).toBe('TEXT_ONLY');
  });
});

// =============================================================================
// Custom Thresholds
// =============================================================================
describe('determineRoute — Custom thresholds', () => {
  it('uses custom minTextCoverage', () => {
    const thresholds: PolicyThresholds = { ...DEFAULT_THRESHOLDS, minTextCoverage: 0.9 };
    const result = determineRoute(makeSignals({ textCoverage: 0.85 }), thresholds);
    expect(result.route).toBe('OCR_REQUIRED');
  });

  it('uses custom minAutoCommitConfidence', () => {
    const thresholds: PolicyThresholds = { ...DEFAULT_THRESHOLDS, minAutoCommitConfidence: 99 };
    const result = determineRoute(makeSignals({ metadataConfidence: 95 }), thresholds);
    // 95 < 99 → after second pass not needed (still >= 85), should be auto-commit if pass
    // Actually 95 >= 85 so second pass not needed. For auto-commit need 99, so falls through.
    // With no review reasons (parts ok, no dupes, autonomous on), but confidence 95 < 99 won't meet auto-commit.
    // The session will fall through to TEXT_ONLY
    expect(result.route).toBe('TEXT_ONLY');
  });
});

// =============================================================================
// Convenience Functions
// =============================================================================
describe('needsOcr', () => {
  it('returns true when coverage is below default threshold (0.3)', () => {
    expect(needsOcr(0.1)).toBe(true);
    expect(needsOcr(0.29)).toBe(true);
  });

  it('returns false when coverage is adequate', () => {
    expect(needsOcr(0.3)).toBe(false);
    expect(needsOcr(0.5)).toBe(false);
    expect(needsOcr(1.0)).toBe(false);
  });

  it('respects custom thresholds', () => {
    expect(needsOcr(0.5, { ...DEFAULT_THRESHOLDS, minTextCoverage: 0.6 })).toBe(true);
    expect(needsOcr(0.5, { ...DEFAULT_THRESHOLDS, minTextCoverage: 0.4 })).toBe(false);
  });
});

describe('needsSecondPass', () => {
  it('returns true when metadata confidence is low', () => {
    expect(needsSecondPass(50, 90)).toBe(true);
  });

  it('returns true when segmentation confidence is low', () => {
    expect(needsSecondPass(90, 50)).toBe(true);
  });

  it('returns false when both are above threshold', () => {
    expect(needsSecondPass(90, 90)).toBe(false);
  });

  it('handles null segmentation confidence', () => {
    expect(needsSecondPass(90, null)).toBe(false);
    expect(needsSecondPass(50, null)).toBe(true);
  });
});
