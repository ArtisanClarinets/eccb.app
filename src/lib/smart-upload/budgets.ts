/**
 * Budget Tracking for Smart Upload Sessions
 *
 * Enforces per-session limits on LLM calls and input tokens to prevent
 * runaway costs, especially for large PDFs.
 *
 * Budget state is kept in-memory per session (no DB writes) since it only
 * needs to survive the lifetime of one processing job.
 */

import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

export interface BudgetLimits {
  /** Maximum number of LLM calls per session. 0 = unlimited. */
  maxLlmCalls: number;
  /** Maximum total input tokens per session. 0 = unlimited. */
  maxInputTokens: number;
}

export interface BudgetState {
  /** Number of LLM calls made so far. */
  llmCallCount: number;
  /** Total input (prompt) tokens consumed so far. */
  inputTokensConsumed: number;
}

export interface BudgetCheckResult {
  /** True if the budget allows another LLM call. */
  allowed: boolean;
  /** Reason string if denied. */
  reason?: string;
}

// =============================================================================
// Budget Tracker
// =============================================================================

export class SessionBudget {
  private readonly limits: BudgetLimits;
  private readonly state: BudgetState;
  private readonly sessionId: string;

  constructor(sessionId: string, limits: BudgetLimits) {
    this.sessionId = sessionId;
    this.limits = limits;
    this.state = { llmCallCount: 0, inputTokensConsumed: 0 };
  }

  /**
   * Check if the budget allows another LLM call.
   * Call this BEFORE making each LLM request.
   */
  check(): BudgetCheckResult {
    if (this.limits.maxLlmCalls > 0 && this.state.llmCallCount >= this.limits.maxLlmCalls) {
      const reason = `LLM call budget exhausted: ${this.state.llmCallCount}/${this.limits.maxLlmCalls} calls used`;
      logger.warn('Budget check denied — call limit reached', {
        sessionId: this.sessionId,
        ...this.state,
        ...this.limits,
      });
      return { allowed: false, reason };
    }

    if (
      this.limits.maxInputTokens > 0 &&
      this.state.inputTokensConsumed >= this.limits.maxInputTokens
    ) {
      const reason = `Input token budget exhausted: ${this.state.inputTokensConsumed}/${this.limits.maxInputTokens} tokens used`;
      logger.warn('Budget check denied — token limit reached', {
        sessionId: this.sessionId,
        ...this.state,
        ...this.limits,
      });
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Record an LLM call after it completes.
   * @param promptTokens Number of input/prompt tokens used by this call.
   */
  record(promptTokens: number = 0): void {
    this.state.llmCallCount += 1;
    this.state.inputTokensConsumed += promptTokens;

    logger.debug('Budget recorded LLM call', {
      sessionId: this.sessionId,
      callNumber: this.state.llmCallCount,
      promptTokens,
      totalTokens: this.state.inputTokensConsumed,
      remainingCalls: this.limits.maxLlmCalls > 0
        ? this.limits.maxLlmCalls - this.state.llmCallCount
        : 'unlimited',
    });
  }

  /** Return a snapshot of the current budget state. */
  snapshot(): BudgetState & BudgetLimits {
    return { ...this.state, ...this.limits };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a budget tracker from runtime settings.
 *
 * @param sessionId The upload session ID.
 * @param settings Parsed smart upload settings containing budget keys.
 */
export function createSessionBudget(
  sessionId: string,
  settings: {
    smart_upload_budget_max_llm_calls_per_session?: number;
    smart_upload_budget_max_input_tokens_per_session?: number;
  },
): SessionBudget {
  return new SessionBudget(sessionId, {
    maxLlmCalls: settings.smart_upload_budget_max_llm_calls_per_session ?? 5,
    maxInputTokens: settings.smart_upload_budget_max_input_tokens_per_session ?? 500_000,
  });
}
