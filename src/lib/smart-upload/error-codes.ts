/**
 * Smart Upload Error Code System
 *
 * Structured error tracking for audit trails, operational metrics, and debugging.
 * All errors from the smart upload pipeline should use these codes for consistency.
 *
 * Code Format: SU-[CATEGORY][NUMBER]
 * Categories:
 *   - CONFIG: Configuration/initialization errors (000-099)
 *   - INTAKE: File upload/intake errors (100-199)
 *   - PROCESS: First-pass processing errors (200-299)
 *   - SEGMENT: Segmentation/boundary detection (300-399)
 *   - LLM: LLM provider/model errors (400-499)
 *   - VERIFY: Second-pass verification errors (500-599)
 *   - SPLIT: PDF splitting/part generation (600-699)
 *   - STORAGE: File storage/S3 errors (700-799)
 *   - AUTH: Authentication/authorization (800-899)
 *   - UNKNOWN: Unclassified errors (900-999)
 */

export enum SmartUploadErrorCode {
  // =========================================================================
  // CONFIG Errors (000-099)
  // =========================================================================
  CONFIG_MISSING_ENV = 'SU-001',
  CONFIG_INVALID_SCHEMA = 'SU-002',
  CONFIG_LLM_MISSING_API_KEY = 'SU-003',
  CONFIG_LLM_PROVIDER_UNAVAILABLE = 'SU-004',
  CONFIG_INVALID_MODEL = 'SU-005',
  CONFIG_INVALID_SETTINGS = 'SU-006',

  // =========================================================================
  // INTAKE Errors (100-199)
  // =========================================================================
  INTAKE_FILE_TOO_LARGE = 'SU-101',
  INTAKE_FILE_INVALID_MIME = 'SU-102',
  INTAKE_FILE_CORRUPTED = 'SU-103',
  INTAKE_NO_PDF_PROVIDED = 'SU-104',
  INTAKE_PDF_PARSING_FAILED = 'SU-105',
  INTAKE_STORAGE_UPLOAD_FAILED = 'SU-106',
  INTAKE_STORAGE_UNAVAILABLE = 'SU-107',

  // =========================================================================
  // PROCESS Errors (200-299): First-pass processor
  // =========================================================================
  PROCESS_SESSION_NOT_FOUND = 'SU-201',
  PROCESS_INVALID_STATE = 'SU-202',
  PROCESS_RENDERING_FAILED = 'SU-203',
  PROCESS_TEXT_EXTRACTION_FAILED = 'SU-204',
  PROCESS_OCR_FAILED = 'SU-205',
  PROCESS_PAGE_TOO_LARGE = 'SU-206',
  PROCESS_BUDGET_EXCEEDED = 'SU-207',
  PROCESS_RATE_LIMITED = 'SU-208',

  // =========================================================================
  // SEGMENT Errors (300-399): Deterministic segmentation
  // =========================================================================
  SEGMENT_NO_TEXT_LAYER = 'SU-301',
  SEGMENT_DETECTION_FAILED = 'SU-302',
  SEGMENT_CONFIDENCE_LOW = 'SU-303',
  SEGMENT_GARBAGE_OUTPUT = 'SU-304',
  SEGMENT_GAPS_DETECTED = 'SU-305',
  SEGMENT_INVALID_BOUNDARIES = 'SU-306',

  // =========================================================================
  // LLM Errors (400-499)
  // =========================================================================
  LLM_PROVIDER_TIMEOUT = 'SU-401',
  LLM_PROVIDER_UNAVAILABLE = 'SU-402',
  LLM_PROVIDER_QUOTA = 'SU-403',
  LLM_API_ERROR = 'SU-404',
  LLM_INVALID_RESPONSE = 'SU-405',
  LLM_MODEL_NOT_FOUND = 'SU-406',
  LLM_INSUFFICIENT_CONTEXT = 'SU-407',
  LLM_CAPABILITY_MISMATCH = 'SU-408', // Model doesn't support vision/PDF required by task
  LLM_AUTH_FAILED = 'SU-409',

  // =========================================================================
  // VERIFY Errors (500-599): Second-pass verification
  // =========================================================================
  VERIFY_SESSION_INELIGIBLE = 'SU-501',
  VERIFY_GAPS_BLOCK_PROCESSING = 'SU-502',
  VERIFY_PDF_INACCESSIBLE = 'SU-503',
  VERIFY_RENDERING_FAILED = 'SU-504',
  VERIFY_LLM_FAILED = 'SU-505',
  VERIFY_TIMEOUT = 'SU-506',
  VERIFY_RESPONSE_INVALID = 'SU-507',

  // =========================================================================
  // SPLIT Errors (600-699): PDF splitting and part extraction
  // =========================================================================
  SPLIT_CUTTING_INSTRUCTIONS_INVALID = 'SU-601',
  SPLIT_PDF_FAILED = 'SU-602',
  SPLIT_PAGE_OUT_OF_RANGE = 'SU-603',
  SPLIT_OUTPUT_ENCODING_FAILED = 'SU-604',
  SPLIT_EMPTY_PART = 'SU-605',
  SPLIT_STORAGE_FAILURE = 'SU-606',

  // =========================================================================
  // STORAGE Errors (700-799)
  // =========================================================================
  STORAGE_UPLOAD_FAILED = 'SU-701',
  STORAGE_DOWNLOAD_FAILED = 'SU-702',
  STORAGE_DELETE_FAILED = 'SU-703',
  STORAGE_NOT_FOUND = 'SU-704',
  STORAGE_PERMISSION_DENIED = 'SU-705',
  STORAGE_CONNECTION_TIMEOUT = 'SU-706',
  STORAGE_INVALID_PATH = 'SU-707',

  // =========================================================================
  // AUTH Errors (800-899)
  // =========================================================================
  AUTH_UNAUTHORIZED = 'SU-801',
  AUTH_FORBIDDEN = 'SU-802',
  AUTH_SESSION_EXPIRED = 'SU-803',

  // =========================================================================
  // UNKNOWN (900-999)
  // =========================================================================
  UNKNOWN_ERROR = 'SU-999',
}

export interface SmartUploadErrorContext {
  code: SmartUploadErrorCode;
  message: string;
  details?: Record<string, unknown>;
  sessionId?: string;
  timestamp: number;
  component?: string; // Which subsystem: processor, worker, renderer, etc.
  fatal?: boolean; // Whether error is unrecoverable
  retryable?: boolean; // Whether operation can be retried
  recommendation?: string; // Action for operator
}

export class SmartUploadError extends Error {
  public readonly code: SmartUploadErrorCode;
  public readonly context: SmartUploadErrorContext;

  constructor(
    code: SmartUploadErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      sessionId?: string;
      component?: string;
      fatal?: boolean;
      retryable?: boolean;
      recommendation?: string;
    },
  ) {
    super(message);
    this.name = 'SmartUploadError';
    this.code = code;
    this.context = {
      code,
      message,
      timestamp: Date.now(),
      ...options,
    };
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Map generic errors to smart upload error codes and context.
 * Used in catch blocks to normalize error reporting.
 */
export function normalizeError(
  err: unknown,
  context: Partial<SmartUploadErrorContext> = {},
): SmartUploadErrorContext {
  const code =
    err instanceof SmartUploadError
      ? err.code
      : context.code || SmartUploadErrorCode.UNKNOWN_ERROR;

  const message =
    err instanceof SmartUploadError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);

  return {
    code,
    message,
    timestamp: Date.now(),
    ...context,
  };
}
