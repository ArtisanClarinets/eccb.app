/**
 * State Machine — Canonical state transitions for Smart Upload workflows.
 *
 * This module defines the allowed transitions for every status dimension
 * in the SmartUploadSession lifecycle. No worker or route should write
 * a status string directly — they must go through the helpers here.
 */

import type { ParseStatus, SecondPassStatus } from '../../types/smart-upload';

// =============================================================================
// Status Enums (canonical values stored in DB)
// =============================================================================

/**
 * Top-level workflow status (maps to SmartUploadStatus Prisma enum + runtime
 * extensions). The Prisma enum currently has PENDING_REVIEW | APPROVED | REJECTED.
 * Runtime code also uses PROCESSING, PROCESSED, READY_TO_COMMIT, COMMITTED, FAILED.
 */
export type WorkflowStatus =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'PENDING_REVIEW'
  | 'READY_TO_COMMIT'
  | 'COMMITTING'
  | 'APPROVED'    // = committed via manual approval
  | 'COMMITTED'   // = committed via autonomous path
  | 'REJECTED'
  | 'FAILED';

/**
 * OCR sub-status.
 */
export type OcrStatus =
  | 'NOT_NEEDED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED';

/**
 * Commit sub-status.
 */
export type CommitStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED';

// =============================================================================
// Transition Maps
// =============================================================================

/**
 * Allowed next states for each WorkflowStatus.
 */
const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  UPLOADED:         ['QUEUED', 'FAILED'],
  QUEUED:           ['PROCESSING', 'FAILED'],
  PROCESSING:       ['PROCESSED', 'PENDING_REVIEW', 'FAILED'],
  PROCESSED:        ['READY_TO_COMMIT', 'PENDING_REVIEW', 'FAILED'],
  PENDING_REVIEW:   ['APPROVED', 'REJECTED', 'READY_TO_COMMIT', 'FAILED'],
  READY_TO_COMMIT:  ['COMMITTING', 'PENDING_REVIEW', 'FAILED'],
  COMMITTING:       ['APPROVED', 'COMMITTED', 'FAILED'],
  APPROVED:         [],  // terminal
  COMMITTED:        [],  // terminal
  REJECTED:         [],  // terminal
  FAILED:           ['QUEUED', 'PROCESSING'],  // allow retry
};

/**
 * Allowed next states for ParseStatus.
 */
const PARSE_TRANSITIONS: Record<ParseStatus, readonly ParseStatus[]> = {
  NOT_PARSED:   ['PARSING'],
  PARSING:      ['PARSED', 'PARSE_FAILED'],
  PARSED:       [],  // terminal success
  PARSE_FAILED: ['PARSING'],  // retry
};

/**
 * Allowed next states for SecondPassStatus.
 */
const SECOND_PASS_TRANSITIONS: Record<SecondPassStatus, readonly SecondPassStatus[]> = {
  NOT_NEEDED:   ['QUEUED'],
  QUEUED:       ['IN_PROGRESS', 'FAILED'],
  IN_PROGRESS:  ['COMPLETE', 'FAILED'],
  COMPLETE:     [],  // terminal
  FAILED:       ['QUEUED'],  // retry
};

/**
 * Allowed next states for OcrStatus.
 */
const OCR_TRANSITIONS: Record<OcrStatus, readonly OcrStatus[]> = {
  NOT_NEEDED:   ['QUEUED'],
  QUEUED:       ['IN_PROGRESS', 'FAILED'],
  IN_PROGRESS:  ['COMPLETE', 'FAILED'],
  COMPLETE:     [],  // terminal
  FAILED:       ['QUEUED'],  // retry
};

/**
 * Allowed next states for CommitStatus.
 */
const COMMIT_TRANSITIONS: Record<CommitStatus, readonly CommitStatus[]> = {
  NOT_STARTED:  ['QUEUED'],
  QUEUED:       ['IN_PROGRESS', 'FAILED'],
  IN_PROGRESS:  ['COMPLETE', 'FAILED'],
  COMPLETE:     [],  // terminal
  FAILED:       ['QUEUED'],  // retry
};

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check whether a status transition is allowed.
 */
export function isValidTransition<T extends string>(
  transitions: Record<T, readonly T[]>,
  from: T,
  to: T
): boolean {
  const allowed = transitions[from];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

/**
 * Assert a transition is valid, throwing if not.
 */
export function assertTransition<T extends string>(
  dimensionName: string,
  transitions: Record<T, readonly T[]>,
  from: T,
  to: T
): void {
  if (!isValidTransition(transitions, from, to)) {
    throw new Error(
      `Invalid ${dimensionName} transition: ${from} → ${to}. ` +
      `Allowed: [${(transitions[from] ?? []).join(', ')}]`
    );
  }
}

// -- Workflow --

export function isValidWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return isValidTransition(WORKFLOW_TRANSITIONS, from, to);
}

export function assertWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  assertTransition('workflow', WORKFLOW_TRANSITIONS, from, to);
}

// -- Parse --

export function isValidParseTransition(from: ParseStatus, to: ParseStatus): boolean {
  return isValidTransition(PARSE_TRANSITIONS, from, to);
}

export function assertParseTransition(from: ParseStatus, to: ParseStatus): void {
  assertTransition('parseStatus', PARSE_TRANSITIONS, from, to);
}

// -- Second Pass --

export function isValidSecondPassTransition(from: SecondPassStatus, to: SecondPassStatus): boolean {
  return isValidTransition(SECOND_PASS_TRANSITIONS, from, to);
}

export function assertSecondPassTransition(from: SecondPassStatus, to: SecondPassStatus): void {
  assertTransition('secondPassStatus', SECOND_PASS_TRANSITIONS, from, to);
}

// -- OCR --

export function isValidOcrTransition(from: OcrStatus, to: OcrStatus): boolean {
  return isValidTransition(OCR_TRANSITIONS, from, to);
}

export function assertOcrTransition(from: OcrStatus, to: OcrStatus): void {
  assertTransition('ocrStatus', OCR_TRANSITIONS, from, to);
}

// -- Commit --

export function isValidCommitTransition(from: CommitStatus, to: CommitStatus): boolean {
  return isValidTransition(COMMIT_TRANSITIONS, from, to);
}

export function assertCommitTransition(from: CommitStatus, to: CommitStatus): void {
  assertTransition('commitStatus', COMMIT_TRANSITIONS, from, to);
}

// =============================================================================
// Decision Helpers
// =============================================================================

/**
 * Whether a session can have OCR queued.
 */
export function canQueueOcr(ocrStatus: OcrStatus): boolean {
  return ocrStatus === 'NOT_NEEDED' || ocrStatus === 'FAILED';
}

/**
 * Whether a session can have a second pass queued.
 */
export function canQueueSecondPass(secondPassStatus: SecondPassStatus): boolean {
  return secondPassStatus === 'NOT_NEEDED' || secondPassStatus === 'FAILED';
}

/**
 * Whether a session can be auto-committed.
 */
export function canAutoCommit(
  workflowStatus: WorkflowStatus,
  commitStatus: CommitStatus,
  secondPassStatus: SecondPassStatus,
  autoApproved: boolean
): boolean {
  // Must be processed or ready to commit
  const eligibleWorkflow = workflowStatus === 'PROCESSED' || workflowStatus === 'READY_TO_COMMIT';
  // Must not already be committed or in progress
  const eligibleCommit = commitStatus === 'NOT_STARTED' || commitStatus === 'FAILED';
  // Second pass must be complete or not needed
  const secondPassDone = secondPassStatus === 'COMPLETE' || secondPassStatus === 'NOT_NEEDED';
  // Must be auto-approved
  return eligibleWorkflow && eligibleCommit && secondPassDone && autoApproved;
}

/**
 * Whether a session should enter manual review (exception path).
 */
export function canEnterReview(
  workflowStatus: WorkflowStatus,
  requiresHumanReview: boolean
): boolean {
  const eligible = workflowStatus === 'PROCESSED' || workflowStatus === 'READY_TO_COMMIT';
  return eligible && requiresHumanReview;
}

/**
 * Whether a commit can be retried.
 */
export function canRetryCommit(commitStatus: CommitStatus): boolean {
  return commitStatus === 'FAILED';
}

/**
 * Whether a workflow is in a terminal state.
 */
export function isTerminalWorkflow(status: WorkflowStatus): boolean {
  return status === 'APPROVED' || status === 'COMMITTED' || status === 'REJECTED';
}

/**
 * Whether a workflow is in a failed state (retriable terminal).
 */
export function isFailedWorkflow(status: WorkflowStatus): boolean {
  return status === 'FAILED';
}
