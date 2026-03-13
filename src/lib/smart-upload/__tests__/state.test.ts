/**
 * Tests for Smart Upload State Machine
 */
import { describe, it, expect } from 'vitest';
import {
  isValidWorkflowTransition,
  assertWorkflowTransition,
  isValidParseTransition,
  assertParseTransition,
  isValidSecondPassTransition,
  isValidOcrTransition,
  isValidCommitTransition,
  canQueueOcr,
  canQueueSecondPass,
  canAutoCommit,
  canEnterReview,
  canRetryCommit,
  isTerminalWorkflow,
  isFailedWorkflow,
} from '../state';

describe('State Machine — Workflow Transitions', () => {
  it('allows PROCESSING → AUTO_COMMITTING', () => {
    expect(isValidWorkflowTransition('PROCESSING', 'AUTO_COMMITTING')).toBe(true);
  });

  it('allows AUTO_COMMITTING → AUTO_COMMITTED', () => {
    expect(isValidWorkflowTransition('AUTO_COMMITTING', 'AUTO_COMMITTED')).toBe(true);
  });

  it('rejects PROCESSING → AUTO_COMMITTED (skip steps)', () => {
    expect(isValidWorkflowTransition('PROCESSING', 'AUTO_COMMITTED')).toBe(false);
  });

  it('allows AUTO_COMMITTING → REQUIRES_REVIEW', () => {
    expect(isValidWorkflowTransition('AUTO_COMMITTING', 'REQUIRES_REVIEW')).toBe(true);
  });

  it('allows PROCESSING → REQUIRES_REVIEW', () => {
    expect(isValidWorkflowTransition('PROCESSING', 'REQUIRES_REVIEW')).toBe(true);
  });

  it('allows REQUIRES_REVIEW → MANUALLY_APPROVED', () => {
    expect(isValidWorkflowTransition('REQUIRES_REVIEW', 'MANUALLY_APPROVED')).toBe(true);
  });

  it('allows PROCESSING → FAILED', () => {
    expect(isValidWorkflowTransition('PROCESSING', 'FAILED')).toBe(true);
  });

  it('allows AUTO_COMMITTING → FAILED', () => {
    expect(isValidWorkflowTransition('AUTO_COMMITTING', 'FAILED')).toBe(true);
  });

  it('allows REQUIRES_REVIEW → REJECTED', () => {
    expect(isValidWorkflowTransition('REQUIRES_REVIEW', 'REJECTED')).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    expect(isValidWorkflowTransition('APPROVED', 'PROCESSING')).toBe(false);
    expect(isValidWorkflowTransition('AUTO_COMMITTED', 'PROCESSING')).toBe(false);
    expect(isValidWorkflowTransition('REJECTED', 'PROCESSING')).toBe(false);
  });

  it('allows retry from REQUIRES_REVIEW → FAILED', () => {
    expect(isValidWorkflowTransition('REQUIRES_REVIEW', 'FAILED')).toBe(true);
  });

  it('allows retry from FAILED → PROCESSING', () => {
    expect(isValidWorkflowTransition('FAILED', 'PROCESSING')).toBe(true);
  });

  it('assertWorkflowTransition throws on invalid transition', () => {
    expect(() => assertWorkflowTransition('PROCESSING', 'AUTO_COMMITTED')).toThrow(
      /Invalid workflow transition/
    );
  });

  it('assertWorkflowTransition does not throw on valid transition', () => {
    expect(() => assertWorkflowTransition('PROCESSING', 'AUTO_COMMITTING')).not.toThrow();
  });
});

describe('State Machine — Parse Transitions', () => {
  it('allows NOT_PARSED → PARSING', () => {
    expect(isValidParseTransition('NOT_PARSED', 'PARSING')).toBe(true);
  });

  it('allows PARSING → PARSED', () => {
    expect(isValidParseTransition('PARSING', 'PARSED')).toBe(true);
  });

  it('allows PARSING → PARSE_FAILED', () => {
    expect(isValidParseTransition('PARSING', 'PARSE_FAILED')).toBe(true);
  });

  it('allows retry PARSE_FAILED → PARSING', () => {
    expect(isValidParseTransition('PARSE_FAILED', 'PARSING')).toBe(true);
  });

  it('rejects NOT_PARSED → PARSED (skip)', () => {
    expect(isValidParseTransition('NOT_PARSED', 'PARSED')).toBe(false);
  });

  it('assertParseTransition throws on invalid', () => {
    expect(() => assertParseTransition('NOT_PARSED', 'PARSED')).toThrow(
      /Invalid parseStatus transition/
    );
  });
});

describe('State Machine — Second Pass Transitions', () => {
  it('allows NOT_NEEDED → QUEUED', () => {
    expect(isValidSecondPassTransition('NOT_NEEDED', 'QUEUED')).toBe(true);
  });

  it('allows QUEUED → IN_PROGRESS', () => {
    expect(isValidSecondPassTransition('QUEUED', 'IN_PROGRESS')).toBe(true);
  });

  it('allows IN_PROGRESS → COMPLETE', () => {
    expect(isValidSecondPassTransition('IN_PROGRESS', 'COMPLETE')).toBe(true);
  });

  it('allows retry FAILED → QUEUED', () => {
    expect(isValidSecondPassTransition('FAILED', 'QUEUED')).toBe(true);
  });

  it('rejects COMPLETE → anything', () => {
    expect(isValidSecondPassTransition('COMPLETE', 'QUEUED')).toBe(false);
    expect(isValidSecondPassTransition('COMPLETE', 'FAILED')).toBe(false);
  });
});

describe('State Machine — OCR Transitions', () => {
  it('allows NOT_NEEDED → QUEUED', () => {
    expect(isValidOcrTransition('NOT_NEEDED', 'QUEUED')).toBe(true);
  });

  it('allows IN_PROGRESS → COMPLETE', () => {
    expect(isValidOcrTransition('IN_PROGRESS', 'COMPLETE')).toBe(true);
  });

  it('allows retry from FAILED', () => {
    expect(isValidOcrTransition('FAILED', 'QUEUED')).toBe(true);
  });

  it('rejects COMPLETE → anything', () => {
    expect(isValidOcrTransition('COMPLETE', 'QUEUED')).toBe(false);
  });
});

describe('State Machine — Commit Transitions', () => {
  it('allows NOT_STARTED → QUEUED', () => {
    expect(isValidCommitTransition('NOT_STARTED', 'QUEUED')).toBe(true);
  });

  it('allows IN_PROGRESS → COMPLETE', () => {
    expect(isValidCommitTransition('IN_PROGRESS', 'COMPLETE')).toBe(true);
  });

  it('allows retry from FAILED', () => {
    expect(isValidCommitTransition('FAILED', 'QUEUED')).toBe(true);
  });

  it('rejects COMPLETE → anything', () => {
    expect(isValidCommitTransition('COMPLETE', 'QUEUED')).toBe(false);
  });
});

describe('State Machine — Decision Helpers', () => {
  it('canQueueOcr returns true for NOT_NEEDED', () => {
    expect(canQueueOcr('NOT_NEEDED')).toBe(true);
  });

  it('canQueueOcr returns true for FAILED', () => {
    expect(canQueueOcr('FAILED')).toBe(true);
  });

  it('canQueueOcr returns false for IN_PROGRESS', () => {
    expect(canQueueOcr('IN_PROGRESS')).toBe(false);
  });

  it('canQueueSecondPass returns true for NOT_NEEDED', () => {
    expect(canQueueSecondPass('NOT_NEEDED')).toBe(true);
  });

  it('canQueueSecondPass returns false for COMPLETE', () => {
    expect(canQueueSecondPass('COMPLETE')).toBe(false);
  });

  it('canAutoCommit returns true when all criteria met', () => {
    expect(canAutoCommit('PROCESSING', 'NOT_STARTED', 'NOT_NEEDED', true)).toBe(true);
  });

  it('canAutoCommit returns false when not auto-approved', () => {
    expect(canAutoCommit('PROCESSING', 'NOT_STARTED', 'NOT_NEEDED', false)).toBe(false);
  });

  it('canAutoCommit returns false when second pass incomplete', () => {
    expect(canAutoCommit('PROCESSING', 'NOT_STARTED', 'IN_PROGRESS', true)).toBe(false);
  });

  it('canAutoCommit returns false when already committed', () => {
    expect(canAutoCommit('PROCESSING', 'COMPLETE', 'NOT_NEEDED', true)).toBe(false);
  });

  it('canEnterReview returns true for eligible sessions', () => {
    expect(canEnterReview('PROCESSING', true)).toBe(true);
  });

  it('canEnterReview returns false when not flagged', () => {
    expect(canEnterReview('PROCESSING', false)).toBe(false);
  });

  it('canEnterReview returns false for terminal states', () => {
    expect(canEnterReview('APPROVED', true)).toBe(false);
  });

  it('canRetryCommit returns true for FAILED', () => {
    expect(canRetryCommit('FAILED')).toBe(true);
  });

  it('canRetryCommit returns false for NOT_STARTED', () => {
    expect(canRetryCommit('NOT_STARTED')).toBe(false);
  });

  it('isTerminalWorkflow identifies terminal states', () => {
    expect(isTerminalWorkflow('APPROVED')).toBe(true);
    expect(isTerminalWorkflow('AUTO_COMMITTED')).toBe(true);
    expect(isTerminalWorkflow('MANUALLY_APPROVED')).toBe(true);
    expect(isTerminalWorkflow('REJECTED')).toBe(true);
    expect(isTerminalWorkflow('PROCESSING')).toBe(false);
  });

  it('isFailedWorkflow identifies FAILED', () => {
    expect(isFailedWorkflow('FAILED')).toBe(true);
    expect(isFailedWorkflow('PROCESSING')).toBe(false);
  });
});
