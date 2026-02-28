/**
 * Tests for Session Error Codes
 */
import { describe, it, expect } from 'vitest';
import {
  SmartUploadErrorCode,
  FailureStage,
  isRetriable,
  isTerminal,
  createSessionFailure,
  classifyError,
} from '../session-errors';

describe('Session Errors — Error Code Classification', () => {
  it('storage download is retriable', () => {
    expect(isRetriable(SmartUploadErrorCode.STORAGE_DOWNLOAD_FAILED)).toBe(true);
  });

  it('model timeout is retriable', () => {
    expect(isRetriable(SmartUploadErrorCode.MODEL_TIMEOUT)).toBe(true);
  });

  it('model rate limited is retriable', () => {
    expect(isRetriable(SmartUploadErrorCode.MODEL_RATE_LIMITED)).toBe(true);
  });

  it('model server error is retriable', () => {
    expect(isRetriable(SmartUploadErrorCode.MODEL_SERVER_ERROR)).toBe(true);
  });

  it('commit TX failed is retriable', () => {
    expect(isRetriable(SmartUploadErrorCode.COMMIT_TX_FAILED)).toBe(true);
  });

  it('PDF invalid is terminal', () => {
    expect(isTerminal(SmartUploadErrorCode.PDF_INVALID)).toBe(true);
  });

  it('PDF encrypted is terminal', () => {
    expect(isTerminal(SmartUploadErrorCode.PDF_ENCRYPTED)).toBe(true);
  });

  it('model auth failed is terminal', () => {
    expect(isTerminal(SmartUploadErrorCode.MODEL_AUTH_FAILED)).toBe(true);
  });

  it('commit duplicate is terminal', () => {
    expect(isTerminal(SmartUploadErrorCode.COMMIT_DUPLICATE)).toBe(true);
  });

  it('internal error is neither retriable nor terminal (unknown default)', () => {
    expect(isRetriable(SmartUploadErrorCode.INTERNAL_ERROR)).toBe(false);
    expect(isTerminal(SmartUploadErrorCode.INTERNAL_ERROR)).toBe(false);
  });
});

describe('Session Errors — createSessionFailure', () => {
  it('creates a structured failure record', () => {
    const failure = createSessionFailure(
      SmartUploadErrorCode.MODEL_TIMEOUT,
      FailureStage.METADATA_EXTRACTION,
      'Request timed out after 30s'
    );

    expect(failure.code).toBe('MODEL_TIMEOUT');
    expect(failure.stage).toBe('METADATA_EXTRACTION');
    expect(failure.message).toBe('Request timed out after 30s');
    expect(failure.retriable).toBe(true);
    expect(failure.timestamp).toBeDefined();
    expect(new Date(failure.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('marks terminal failures as non-retriable', () => {
    const failure = createSessionFailure(
      SmartUploadErrorCode.PDF_CORRUPT,
      FailureStage.UPLOAD,
      'File is corrupted'
    );

    expect(failure.retriable).toBe(false);
  });
});

describe('Session Errors — classifyError', () => {
  it('classifies 401 errors as auth failures', () => {
    const code = classifyError(new Error('401 Unauthorized'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_AUTH_FAILED);
  });

  it('classifies 403 errors as auth failures', () => {
    const code = classifyError(new Error('403 Forbidden'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_AUTH_FAILED);
  });

  it('classifies "invalid api key" as auth failures', () => {
    const code = classifyError(new Error('Invalid API key provided'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_AUTH_FAILED);
  });

  it('classifies 429 errors as rate limiting', () => {
    const code = classifyError(new Error('429 Too Many Requests'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_RATE_LIMITED);
  });

  it('classifies timeouts', () => {
    const code = classifyError(new Error('Request timed out'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_TIMEOUT);
  });

  it('classifies ECONNREFUSED as endpoint unreachable', () => {
    const code = classifyError(new Error('ECONNREFUSED'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_ENDPOINT_UNREACHABLE);
  });

  it('classifies fetch failed as endpoint unreachable', () => {
    const code = classifyError(new Error('fetch failed'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_ENDPOINT_UNREACHABLE);
  });

  it('classifies 500 errors as server error', () => {
    const code = classifyError(new Error('500 Internal Server Error'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_SERVER_ERROR);
  });

  it('classifies JSON parse errors as schema invalid', () => {
    const code = classifyError(new Error('Unexpected token < in JSON'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.MODEL_SCHEMA_INVALID);
  });

  it('falls back to stage-specific defaults', () => {
    expect(classifyError(new Error('unknown'), FailureStage.STORAGE)).toBe(SmartUploadErrorCode.STORAGE_ERROR);
    expect(classifyError(new Error('unknown'), FailureStage.RENDER)).toBe(SmartUploadErrorCode.RENDER_FAILED);
    expect(classifyError(new Error('unknown'), FailureStage.OCR)).toBe(SmartUploadErrorCode.OCR_FAILED);
    expect(classifyError(new Error('unknown'), FailureStage.SPLITTING)).toBe(SmartUploadErrorCode.SPLIT_FAILED);
    expect(classifyError(new Error('unknown'), FailureStage.COMMIT)).toBe(SmartUploadErrorCode.COMMIT_TX_FAILED);
  });

  it('falls back to INTERNAL_ERROR for unknown stage', () => {
    const code = classifyError(new Error('something weird'), FailureStage.METADATA_EXTRACTION);
    expect(code).toBe(SmartUploadErrorCode.INTERNAL_ERROR);
  });

  it('handles non-Error objects', () => {
    const code = classifyError('simple string error', FailureStage.QUEUE);
    expect(code).toBe(SmartUploadErrorCode.INTERNAL_ERROR);
  });
});
