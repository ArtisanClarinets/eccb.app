/**
 * Session Errors — Machine-readable error codes for Smart Upload failures.
 *
 * Every terminal and retriable failure has a stable code that can be stored
 * in the session record, surfaced in admin UI, and consumed by the fallback
 * policy engine without string matching against human-readable messages.
 */

// =============================================================================
// Error Code Enum
// =============================================================================

/**
 * Canonical, machine-readable error codes for Smart Upload failures.
 *
 * Convention:
 *   - Prefix reflects the pipeline stage that failed.
 *   - Codes are SCREAMING_SNAKE_CASE strings for DB storage and JSON safety.
 */
export const SmartUploadErrorCode = {
  // ── Upload / intake ──────────────────────────────────────────────────
  /** Uploaded file is not a valid PDF. */
  PDF_INVALID: 'PDF_INVALID',
  /** PDF is encrypted or password-protected. */
  PDF_ENCRYPTED: 'PDF_ENCRYPTED',
  /** PDF is corrupt or unreadable. */
  PDF_CORRUPT: 'PDF_CORRUPT',
  /** File exceeds maximum size limit. */
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // ── Storage ──────────────────────────────────────────────────────────
  /** Original file could not be downloaded from storage. */
  STORAGE_DOWNLOAD_FAILED: 'STORAGE_DOWNLOAD_FAILED',
  /** Part file could not be uploaded to storage. */
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  /** Storage returned an unexpected error. */
  STORAGE_ERROR: 'STORAGE_ERROR',

  // ── PDF rendering / text extraction ──────────────────────────────────
  /** PDF page rendering failed. */
  RENDER_FAILED: 'RENDER_FAILED',
  /** Text extraction produced no usable content. */
  TEXT_EXTRACTION_EMPTY: 'TEXT_EXTRACTION_EMPTY',

  // ── OCR ──────────────────────────────────────────────────────────────
  /** OCR engine is unavailable (e.g. tesseract not installed). */
  OCR_UNAVAILABLE: 'OCR_UNAVAILABLE',
  /** OCR processing failed on one or more pages. */
  OCR_FAILED: 'OCR_FAILED',
  /** OCR returned no readable text. */
  OCR_EMPTY: 'OCR_EMPTY',

  // ── LLM / model ─────────────────────────────────────────────────────
  /** LLM provider returned an authentication error. */
  MODEL_AUTH_FAILED: 'MODEL_AUTH_FAILED',
  /** LLM provider endpoint could not be reached. */
  MODEL_ENDPOINT_UNREACHABLE: 'MODEL_ENDPOINT_UNREACHABLE',
  /** LLM response timed out. */
  MODEL_TIMEOUT: 'MODEL_TIMEOUT',
  /** LLM response was not valid JSON or did not match the expected schema. */
  MODEL_SCHEMA_INVALID: 'MODEL_SCHEMA_INVALID',
  /** LLM returned an empty or null response. */
  MODEL_EMPTY_RESPONSE: 'MODEL_EMPTY_RESPONSE',
  /** LLM returned a valid response but the content was unusable. */
  MODEL_UNUSABLE_RESPONSE: 'MODEL_UNUSABLE_RESPONSE',
  /** LLM rate limit was exceeded. */
  MODEL_RATE_LIMITED: 'MODEL_RATE_LIMITED',
  /** LLM provider returned a server error (5xx). */
  MODEL_SERVER_ERROR: 'MODEL_SERVER_ERROR',

  // ── Segmentation / boundary detection ────────────────────────────────
  /** Boundary detection produced conflicting or overlapping ranges. */
  BOUNDARY_CONFLICT: 'BOUNDARY_CONFLICT',
  /** No part boundaries could be detected. */
  BOUNDARY_NOT_FOUND: 'BOUNDARY_NOT_FOUND',
  /** Cutting instructions reference pages outside the document range. */
  BOUNDARY_OUT_OF_RANGE: 'BOUNDARY_OUT_OF_RANGE',

  // ── Splitting ────────────────────────────────────────────────────────
  /** PDF splitting produced an empty or malformed output. */
  SPLIT_FAILED: 'SPLIT_FAILED',
  /** Split produced zero parts. */
  SPLIT_EMPTY: 'SPLIT_EMPTY',

  // ── Second pass / verification ───────────────────────────────────────
  /** Second-pass verification failed (LLM error). */
  SECOND_PASS_FAILED: 'SECOND_PASS_FAILED',
  /** Adjudicator failed to reconcile first-pass and second-pass results. */
  ADJUDICATION_FAILED: 'ADJUDICATION_FAILED',

  // ── Commit ───────────────────────────────────────────────────────────
  /** Session was already committed (idempotency guard). */
  COMMIT_DUPLICATE: 'COMMIT_DUPLICATE',
  /** DB transaction failed during commit. */
  COMMIT_TX_FAILED: 'COMMIT_TX_FAILED',
  /** Commit could not find or create required related records. */
  COMMIT_RELATION_FAILED: 'COMMIT_RELATION_FAILED',

  // ── Queue / infra ────────────────────────────────────────────────────
  /** Job could not be enqueued (Redis/BullMQ error). */
  QUEUE_FAILED: 'QUEUE_FAILED',
  /** Worker received an unknown job type. */
  UNKNOWN_JOB_TYPE: 'UNKNOWN_JOB_TYPE',

  // ── Catch-all ────────────────────────────────────────────────────────
  /** An unexpected internal error occurred. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type SmartUploadErrorCode =
  (typeof SmartUploadErrorCode)[keyof typeof SmartUploadErrorCode];

// =============================================================================
// Failure Stage
// =============================================================================

/**
 * The pipeline stage at which a failure occurred.
 */
export const FailureStage = {
  UPLOAD: 'UPLOAD',
  STORAGE: 'STORAGE',
  RENDER: 'RENDER',
  TEXT_EXTRACTION: 'TEXT_EXTRACTION',
  OCR: 'OCR',
  METADATA_EXTRACTION: 'METADATA_EXTRACTION',
  BOUNDARY_DETECTION: 'BOUNDARY_DETECTION',
  SPLITTING: 'SPLITTING',
  SECOND_PASS: 'SECOND_PASS',
  ADJUDICATION: 'ADJUDICATION',
  COMMIT: 'COMMIT',
  QUEUE: 'QUEUE',
} as const;

export type FailureStage = (typeof FailureStage)[keyof typeof FailureStage];

// =============================================================================
// Retryability classification
// =============================================================================

/** Error codes that are safe to retry (transient failures). */
const RETRIABLE_CODES = new Set<SmartUploadErrorCode>([
  SmartUploadErrorCode.STORAGE_DOWNLOAD_FAILED,
  SmartUploadErrorCode.STORAGE_UPLOAD_FAILED,
  SmartUploadErrorCode.STORAGE_ERROR,
  SmartUploadErrorCode.MODEL_TIMEOUT,
  SmartUploadErrorCode.MODEL_RATE_LIMITED,
  SmartUploadErrorCode.MODEL_SERVER_ERROR,
  SmartUploadErrorCode.MODEL_ENDPOINT_UNREACHABLE,
  SmartUploadErrorCode.OCR_FAILED,
  SmartUploadErrorCode.COMMIT_TX_FAILED,
  SmartUploadErrorCode.QUEUE_FAILED,
]);

/** Error codes that are terminal (no retry will help). */
const TERMINAL_CODES = new Set<SmartUploadErrorCode>([
  SmartUploadErrorCode.PDF_INVALID,
  SmartUploadErrorCode.PDF_ENCRYPTED,
  SmartUploadErrorCode.PDF_CORRUPT,
  SmartUploadErrorCode.FILE_TOO_LARGE,
  SmartUploadErrorCode.MODEL_AUTH_FAILED,
  SmartUploadErrorCode.COMMIT_DUPLICATE,
  SmartUploadErrorCode.UNKNOWN_JOB_TYPE,
]);

/**
 * Determine whether a failure code is retriable.
 * Unknown codes default to non-retriable (safe default).
 */
export function isRetriable(code: SmartUploadErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/**
 * Determine whether a failure code is terminal (no retry will fix it).
 */
export function isTerminal(code: SmartUploadErrorCode): boolean {
  return TERMINAL_CODES.has(code);
}

// =============================================================================
// Structured error helper
// =============================================================================

/**
 * A structured error record suitable for DB storage and API serialization.
 */
export interface SessionFailure {
  code: SmartUploadErrorCode;
  stage: FailureStage;
  message: string;
  retriable: boolean;
  timestamp: string;
}

/**
 * Create a structured failure record for a session.
 */
export function createSessionFailure(
  code: SmartUploadErrorCode,
  stage: FailureStage,
  message: string
): SessionFailure {
  return {
    code,
    stage,
    message,
    retriable: isRetriable(code),
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Error-to-code classifier
// =============================================================================

/**
 * Map a caught runtime error to a SmartUploadErrorCode based on heuristics.
 * This is a best-effort classifier for wrapped errors from external services.
 */
export function classifyError(
  error: unknown,
  stage: FailureStage
): SmartUploadErrorCode {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Auth / API key problems
  if (/unauthorized|forbidden|401|403|invalid.?api.?key/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_AUTH_FAILED;
  }

  // Rate limiting
  if (/rate.?limit|429|too many requests/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_RATE_LIMITED;
  }

  // Timeout
  if (/timeout|timed?\s?out|econnaborted/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_TIMEOUT;
  }

  // Network / endpoint
  if (/econnrefused|enotfound|network|dns|socket hang up|fetch failed/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_ENDPOINT_UNREACHABLE;
  }

  // Server error
  if (/500|502|503|504|internal server error|service unavailable/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_SERVER_ERROR;
  }

  // JSON / schema parse
  if (/json|parse|schema|unexpected token|invalid response/i.test(lower)) {
    return SmartUploadErrorCode.MODEL_SCHEMA_INVALID;
  }

  // Stage-specific defaults
  switch (stage) {
    case FailureStage.STORAGE:
      return SmartUploadErrorCode.STORAGE_ERROR;
    case FailureStage.RENDER:
      return SmartUploadErrorCode.RENDER_FAILED;
    case FailureStage.OCR:
      return SmartUploadErrorCode.OCR_FAILED;
    case FailureStage.SPLITTING:
      return SmartUploadErrorCode.SPLIT_FAILED;
    case FailureStage.COMMIT:
      return SmartUploadErrorCode.COMMIT_TX_FAILED;
    default:
      return SmartUploadErrorCode.INTERNAL_ERROR;
  }
}
