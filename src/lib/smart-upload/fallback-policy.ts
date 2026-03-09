/**
 * Fallback Policy — Centralized routing decisions for the Smart Upload pipeline.
 *
 * This module decides which path a session takes through the autonomous
 * ingest workflow. Workers and routes should never duplicate this logic.
 *
 * Paths:
 *   1. Text-only     — text layer is rich enough for direct segmentation
 *   2. OCR           — text layer is absent or too sparse
 *   3. Second-pass   — segmentation or metadata confidence is too low
 *   4. Auto-commit   — all signals pass thresholds, autonomous commit
 *   5. Exception     — session requires human review
 */

import type { SecondPassStatus } from '../../types/smart-upload';
import type { OcrStatus, CommitStatus, WorkflowStatus } from './state';

// =============================================================================
// Thresholds (configurable via runtime settings in the future)
// =============================================================================

export interface PolicyThresholds {
  /** Minimum fraction (0–1) of pages with meaningful text before OCR is needed. */
  minTextCoverage: number;
  /** Minimum confidence score (0–100) for auto-commit without second pass. */
  minAutoCommitConfidence: number;
  /** Minimum confidence score (0–100) to skip second pass. */
  minSkipSecondPassConfidence: number;
  /** Minimum number of valid cutting instructions for auto-commit. */
  minPartsForAutoCommit: number;
  /** Whether autonomous commit is globally enabled. */
  autonomousModeEnabled: boolean;
}

/** Sensible production defaults. */
export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  minTextCoverage: 0.3,
  minAutoCommitConfidence: 80,
  minSkipSecondPassConfidence: 85,
  minPartsForAutoCommit: 1,
  autonomousModeEnabled: true,
};

// =============================================================================
// Decision Types
// =============================================================================

export type PipelineRoute =
  | 'TEXT_ONLY'
  | 'OCR_REQUIRED'
  | 'SECOND_PASS_REQUIRED'
  | 'AUTO_COMMIT'
  | 'EXCEPTION_REVIEW';

export interface RoutingResult {
  route: PipelineRoute;
  /** Human-readable reasons for the routing decision. */
  reasons: string[];
}

// =============================================================================
// Input Signals
// =============================================================================

export interface RoutingSignals {
  /** Fraction of pages (0–1) that have extractable text. */
  textCoverage: number;
  /** Overall confidence score from metadata extraction (0–100). */
  metadataConfidence: number;
  /** Segmentation / boundary detection confidence (0–100). null if not yet computed. */
  segmentationConfidence: number | null;
  /** Number of valid cutting instructions produced. */
  validPartCount: number;
  /** Whether any metadata conflicts remain unresolved. */
  hasMetadataConflicts: boolean;
  /** Whether duplicate detection flagged a potential issue. */
  hasDuplicateFlag: boolean;
  /** Whether the session was explicitly flagged for human review. */
  requiresHumanReview: boolean;
  /** Current OCR sub-status. */
  ocrStatus: OcrStatus;
  /** Current second-pass sub-status. */
  secondPassStatus: SecondPassStatus;
  /** Current commit sub-status. */
  commitStatus: CommitStatus;
  /** Current workflow status. */
  workflowStatus: WorkflowStatus;
  /**
   * Whether cutting instructions were produced by deterministic (text-layer)
   * segmentation rather than the LLM. When true, a second pass is wasteful
   * because the instructions come from hard evidence, not model inference.
   */
  deterministicSegmentation?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

/**
 * Effective confidence is the true confidence floor for automation.
 * If segmentation confidence exists, it constrains the outcome.
 */
function getEffectiveConfidence(signals: RoutingSignals): number {
  const metadataConfidence = clampConfidence(signals.metadataConfidence);

  if (signals.segmentationConfidence === null || signals.segmentationConfidence === undefined) {
    return metadataConfidence;
  }

  const segmentationConfidence = clampConfidence(signals.segmentationConfidence);
  return Math.min(metadataConfidence, segmentationConfidence);
}

// =============================================================================
// Policy Engine
// =============================================================================

/**
 * Determine the next pipeline route based on current session signals.
 */
export function determineRoute(
  signals: RoutingSignals,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): RoutingResult {
  const reasons: string[] = [];

  const normalizedSignals: RoutingSignals = {
    ...signals,
    textCoverage: clampFraction(signals.textCoverage),
    metadataConfidence: clampConfidence(signals.metadataConfidence),
    segmentationConfidence:
      signals.segmentationConfidence === null || signals.segmentationConfidence === undefined
        ? null
        : clampConfidence(signals.segmentationConfidence),
    validPartCount: Math.max(0, Math.trunc(signals.validPartCount)),
  };

  // ── Terminal / already-committed guard ─────────────────────────────
  if (
    normalizedSignals.workflowStatus === 'APPROVED' ||
    normalizedSignals.workflowStatus === 'COMMITTED' ||
    normalizedSignals.workflowStatus === 'REJECTED'
  ) {
    return {
      route: 'EXCEPTION_REVIEW',
      reasons: ['Session is in a terminal state'],
    };
  }

  // ── Explicit human review flag ────────────────────────────────────
  if (normalizedSignals.requiresHumanReview) {
    reasons.push('Session explicitly flagged for human review');
    return { route: 'EXCEPTION_REVIEW', reasons };
  }

  // ── OCR needed? ───────────────────────────────────────────────────
  if (
    normalizedSignals.textCoverage < thresholds.minTextCoverage &&
    normalizedSignals.ocrStatus === 'NOT_NEEDED'
  ) {
    const percentCoverage = (normalizedSignals.textCoverage * 100).toFixed(0);
    const minRequired = (thresholds.minTextCoverage * 100).toFixed(0);
    reasons.push(
      `[TEXT_COVERAGE_LOW] Extractable text on ${percentCoverage}% of pages, below minimum ${minRequired}%`,
    );
    return { route: 'OCR_REQUIRED', reasons };
  }

  if (
    normalizedSignals.ocrStatus === 'QUEUED' ||
    normalizedSignals.ocrStatus === 'IN_PROGRESS'
  ) {
    reasons.push('[OCR_IN_PROGRESS] OCR processing still in progress');
    return { route: 'OCR_REQUIRED', reasons };
  }

  // ── Second pass needed? ───────────────────────────────────────────
  const needsSecondPass = shouldRunSecondPass(normalizedSignals, thresholds, reasons);
  if (needsSecondPass && normalizedSignals.secondPassStatus === 'NOT_NEEDED') {
    return { route: 'SECOND_PASS_REQUIRED', reasons: dedupeReasons(reasons) };
  }

  if (
    normalizedSignals.secondPassStatus === 'QUEUED' ||
    normalizedSignals.secondPassStatus === 'IN_PROGRESS'
  ) {
    reasons.push('Second pass is still in progress');
    return { route: 'SECOND_PASS_REQUIRED', reasons: dedupeReasons(reasons) };
  }

  // ── Exception review? ─────────────────────────────────────────────
  const reviewReasons = collectReviewReasons(normalizedSignals, thresholds);
  if (reviewReasons.length > 0) {
    return { route: 'EXCEPTION_REVIEW', reasons: dedupeReasons(reviewReasons) };
  }

  // ── Auto-commit eligible? ─────────────────────────────────────────
  if (canAutoCommit(normalizedSignals, thresholds, reasons)) {
    return {
      route: 'AUTO_COMMIT',
      reasons: dedupeReasons(reasons.length > 0 ? reasons : ['All criteria met']),
    };
  }

  // ── Default: text-only processing path ────────────────────────────
  return {
    route: 'TEXT_ONLY',
    reasons: ['Default text-only processing path'],
  };
}

// =============================================================================
// Sub-decisions
// =============================================================================

/**
 * Whether a second pass should be triggered.
 */
function shouldRunSecondPass(
  signals: RoutingSignals,
  thresholds: PolicyThresholds,
  reasons: string[],
): boolean {
  if (signals.secondPassStatus !== 'NOT_NEEDED') return false;

  let needed = false;

  const metadataConfidence = clampConfidence(signals.metadataConfidence);
  const segmentationConfidence =
    signals.segmentationConfidence === null ? null : clampConfidence(signals.segmentationConfidence);

  // Deterministic segmentation can suppress segmentation-based second pass,
  // but it must NOT suppress metadata-conflict-driven review/adjudication.
  const skipSegmentationDrivenSecondPass =
    Boolean(signals.deterministicSegmentation) &&
    signals.validPartCount >= thresholds.minPartsForAutoCommit;

  if (!skipSegmentationDrivenSecondPass) {
    if (
      segmentationConfidence !== null &&
      segmentationConfidence < thresholds.minSkipSecondPassConfidence
    ) {
      reasons.push(
        `[SEGMENTATION_LOW_CONFIDENCE] Boundary detection confidence ${segmentationConfidence}%, below threshold ${thresholds.minSkipSecondPassConfidence}%`,
      );
      needed = true;
    }
  } else {
    reasons.push(
      `[DETERMINISTIC_SEGMENTATION] Skipping confidence-driven second pass — deterministic boundaries detected with ${signals.validPartCount} part(s)`,
    );
  }

  if (metadataConfidence < thresholds.minSkipSecondPassConfidence) {
    reasons.push(
      `[METADATA_LOW_CONFIDENCE] Title/Composer confidence ${metadataConfidence}%, below threshold ${thresholds.minSkipSecondPassConfidence}%`,
    );
    needed = true;
  }

  if (signals.hasMetadataConflicts) {
    reasons.push('[METADATA_CONFLICTS] Unresolved metadata conflicts in extracted boundaries');
    needed = true;
  }

  return needed;
}

/**
 * Collect reasons a session should go to exception review.
 */
function collectReviewReasons(
  signals: RoutingSignals,
  thresholds: PolicyThresholds,
): string[] {
  const reasons: string[] = [];
  const effectiveConfidence = getEffectiveConfidence(signals);

  if (signals.hasDuplicateFlag) {
    reasons.push('[DUPLICATE_DETECTED] Potential duplicate match in library');
  }

  if (signals.validPartCount < thresholds.minPartsForAutoCommit) {
    reasons.push(
      `[INSUFFICIENT_PARTS] Only ${signals.validPartCount} part(s) extracted, need ${thresholds.minPartsForAutoCommit}`,
    );
  }

  if (!thresholds.autonomousModeEnabled) {
    reasons.push('[AUTONOMOUS_MODE_DISABLED] Autonomous commit is globally disabled');
  }

  if (
    signals.secondPassStatus === 'COMPLETE' &&
    effectiveConfidence < thresholds.minAutoCommitConfidence
  ) {
    reasons.push(
      `[CONFIDENCE_BELOW_AUTOCOMMIT] Effective confidence ${effectiveConfidence}% after second pass, below auto-commit threshold ${thresholds.minAutoCommitConfidence}%`,
    );
  }

  return reasons;
}

/**
 * Whether the session meets all criteria for autonomous commit.
 */
function canAutoCommit(
  signals: RoutingSignals,
  thresholds: PolicyThresholds,
  reasons: string[],
): boolean {
  if (!thresholds.autonomousModeEnabled) return false;

  const effectiveConfidence = getEffectiveConfidence(signals);

  const secondPassDone =
    signals.secondPassStatus === 'COMPLETE' || signals.secondPassStatus === 'NOT_NEEDED';
  const commitReady =
    signals.commitStatus === 'NOT_STARTED' || signals.commitStatus === 'FAILED';
  const confidentEnough = effectiveConfidence >= thresholds.minAutoCommitConfidence;
  const hasParts = signals.validPartCount >= thresholds.minPartsForAutoCommit;
  const noDupes = !signals.hasDuplicateFlag;
  const noConflicts = !signals.hasMetadataConflicts;
  const noReview = !signals.requiresHumanReview;

  if (
    secondPassDone &&
    commitReady &&
    confidentEnough &&
    hasParts &&
    noDupes &&
    noConflicts &&
    noReview
  ) {
    reasons.push(
      `[AUTO_COMMIT_OK] All criteria satisfied: confidence=${effectiveConfidence}%, parts=${signals.validPartCount}, no conflicts/dupes/reviews pending`,
    );
    return true;
  }

  return false;
}

// =============================================================================
// Convenience helpers
// =============================================================================

/**
 * Quick check: should OCR be triggered for this page coverage?
 */
export function needsOcr(
  textCoverage: number,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): boolean {
  return clampFraction(textCoverage) < thresholds.minTextCoverage;
}

/**
 * Quick check: should a second pass be triggered for this confidence?
 */
export function needsSecondPass(
  metadataConfidence: number,
  segmentationConfidence: number | null,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): boolean {
  const normalizedMetadataConfidence = clampConfidence(metadataConfidence);
  const normalizedSegmentationConfidence =
    segmentationConfidence === null ? null : clampConfidence(segmentationConfidence);

  if (normalizedMetadataConfidence < thresholds.minSkipSecondPassConfidence) return true;
  if (
    normalizedSegmentationConfidence !== null &&
    normalizedSegmentationConfidence < thresholds.minSkipSecondPassConfidence
  ) {
    return true;
  }
  return false;
}