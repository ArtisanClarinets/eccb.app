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
}

// =============================================================================
// Policy Engine
// =============================================================================

/**
 * Determine the next pipeline route based on current session signals.
 */
export function determineRoute(
  signals: RoutingSignals,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS
): RoutingResult {
  const reasons: string[] = [];

  // ── Terminal / already-committed guard ─────────────────────────────
  if (
    signals.workflowStatus === 'APPROVED' ||
    signals.workflowStatus === 'COMMITTED' ||
    signals.workflowStatus === 'REJECTED'
  ) {
    return { route: 'EXCEPTION_REVIEW', reasons: ['Session is in a terminal state'] };
  }

  // ── Explicit human review flag ────────────────────────────────────
  if (signals.requiresHumanReview) {
    reasons.push('Session explicitly flagged for human review');
    return { route: 'EXCEPTION_REVIEW', reasons };
  }

  // ── OCR needed? ───────────────────────────────────────────────────
  if (
    signals.textCoverage < thresholds.minTextCoverage &&
    signals.ocrStatus === 'NOT_NEEDED'
  ) {
    reasons.push(
      `Text coverage (${(signals.textCoverage * 100).toFixed(0)}%) ` +
      `below threshold (${(thresholds.minTextCoverage * 100).toFixed(0)}%)`
    );
    return { route: 'OCR_REQUIRED', reasons };
  }

  // OCR in progress — caller should wait
  if (signals.ocrStatus === 'QUEUED' || signals.ocrStatus === 'IN_PROGRESS') {
    reasons.push('OCR is still in progress');
    return { route: 'OCR_REQUIRED', reasons };
  }

  // ── Second pass needed? ───────────────────────────────────────────
  const needsSecondPass = shouldRunSecondPass(signals, thresholds, reasons);
  if (needsSecondPass && signals.secondPassStatus === 'NOT_NEEDED') {
    return { route: 'SECOND_PASS_REQUIRED', reasons };
  }

  // Second pass in progress — caller should wait
  if (
    signals.secondPassStatus === 'QUEUED' ||
    signals.secondPassStatus === 'IN_PROGRESS'
  ) {
    reasons.push('Second pass is still in progress');
    return { route: 'SECOND_PASS_REQUIRED', reasons };
  }

  // ── Exception review? ─────────────────────────────────────────────
  const reviewReasons = collectReviewReasons(signals, thresholds);
  if (reviewReasons.length > 0) {
    return { route: 'EXCEPTION_REVIEW', reasons: reviewReasons };
  }

  // ── Auto-commit eligible? ─────────────────────────────────────────
  if (canAutoCommit(signals, thresholds, reasons)) {
    return { route: 'AUTO_COMMIT', reasons: reasons.length > 0 ? reasons : ['All criteria met'] };
  }

  // ── Default: text-only processing path ────────────────────────────
  return { route: 'TEXT_ONLY', reasons: ['Default text-only processing path'] };
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
  reasons: string[]
): boolean {
  if (signals.secondPassStatus !== 'NOT_NEEDED') return false;

  let needed = false;

  if (
    signals.segmentationConfidence !== null &&
    signals.segmentationConfidence < thresholds.minSkipSecondPassConfidence
  ) {
    reasons.push(
      `Segmentation confidence (${signals.segmentationConfidence}%) ` +
      `below threshold (${thresholds.minSkipSecondPassConfidence}%)`
    );
    needed = true;
  }

  if (signals.metadataConfidence < thresholds.minSkipSecondPassConfidence) {
    reasons.push(
      `Metadata confidence (${signals.metadataConfidence}%) ` +
      `below threshold (${thresholds.minSkipSecondPassConfidence}%)`
    );
    needed = true;
  }

  if (signals.hasMetadataConflicts) {
    reasons.push('Unresolved metadata conflicts remain');
    needed = true;
  }

  return needed;
}

/**
 * Collect reasons a session should go to exception review.
 */
function collectReviewReasons(
  signals: RoutingSignals,
  thresholds: PolicyThresholds
): string[] {
  const reasons: string[] = [];

  if (signals.hasDuplicateFlag) {
    reasons.push('Duplicate detection flagged this session');
  }

  if (signals.validPartCount < thresholds.minPartsForAutoCommit) {
    reasons.push(
      `Only ${signals.validPartCount} valid parts (need ${thresholds.minPartsForAutoCommit})`
    );
  }

  if (!thresholds.autonomousModeEnabled) {
    reasons.push('Autonomous mode is disabled');
  }

  // After second pass, if confidence is still very low
  if (
    signals.secondPassStatus === 'COMPLETE' &&
    signals.metadataConfidence < thresholds.minAutoCommitConfidence
  ) {
    reasons.push(
      `Post-second-pass confidence (${signals.metadataConfidence}%) ` +
      `still below auto-commit threshold (${thresholds.minAutoCommitConfidence}%)`
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
  reasons: string[]
): boolean {
  if (!thresholds.autonomousModeEnabled) return false;

  const secondPassDone =
    signals.secondPassStatus === 'COMPLETE' || signals.secondPassStatus === 'NOT_NEEDED';
  const commitReady =
    signals.commitStatus === 'NOT_STARTED' || signals.commitStatus === 'FAILED';
  const confidentEnough = signals.metadataConfidence >= thresholds.minAutoCommitConfidence;
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
    reasons.push('All auto-commit criteria satisfied');
    return true;
  }

  return false;
}

// =============================================================================
// Convenience: decide whether OCR is needed based on text coverage alone
// =============================================================================

/**
 * Quick check: should OCR be triggered for this page coverage?
 */
export function needsOcr(
  textCoverage: number,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS
): boolean {
  return textCoverage < thresholds.minTextCoverage;
}

/**
 * Quick check: should a second pass be triggered for this confidence?
 */
export function needsSecondPass(
  metadataConfidence: number,
  segmentationConfidence: number | null,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS
): boolean {
  if (metadataConfidence < thresholds.minSkipSecondPassConfidence) return true;
  if (
    segmentationConfidence !== null &&
    segmentationConfidence < thresholds.minSkipSecondPassConfidence
  ) return true;
  return false;
}
