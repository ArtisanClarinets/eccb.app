/**
 * Duplicate Detection — Prevent silent duplicates in the music library.
 *
 * Calculates source PDF hashes, work fingerprints, and part fingerprints
 * to decide whether an upload is a duplicate, a version, or a new piece.
 */

import { createHash } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type DuplicatePolicy =
  | 'NEW_PIECE'
  | 'SKIP_DUPLICATE'
  | 'VERSION_UPDATE'
  | 'EXCEPTION_REVIEW';

export interface DuplicateCheckResult {
  /** The policy decision. */
  policy: DuplicatePolicy;
  /** Whether a duplicate was detected. */
  isDuplicate: boolean;
  /** ID of the existing matching session, if any. */
  matchingSessionId: string | null;
  /** ID of the existing matching piece, if any. */
  matchingPieceId: string | null;
  /** Human-readable reason. */
  reason: string;
}

export interface WorkFingerprint {
  /** Normalized title used for matching. */
  normalizedTitle: string;
  /** Normalized composer name used for matching. */
  normalizedComposer: string;
  /** Combined SHA-256 hash of normalizedTitle + normalizedComposer. */
  hash: string;
}

export interface WorkFingerprintV2 extends WorkFingerprint {
  /** Normalized arranger name used for matching. */
  normalizedArranger: string;
}

// =============================================================================
// Hash Functions
// =============================================================================

/**
 * Compute a SHA-256 hash of a buffer. Used for source file dedup.
 */
export function computeSha256(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute a work fingerprint from normalized metadata fields.
 * Two uploads with the same title + composer should produce the same hash.
 */
export function computeWorkFingerprint(
  title: string,
  composer: string | undefined | null
): WorkFingerprint {
  const normalizedTitle = normalizeForFingerprint(title);
  const normalizedComposer = normalizeForFingerprint(composer ?? '');

  const combined = `${normalizedTitle}::${normalizedComposer}`;
  const hash = createHash('sha256').update(combined).digest('hex');

  return { normalizedTitle, normalizedComposer, hash };
}

/**
 * Compute a v2 work fingerprint that includes the arranger.
 * Preferred over computeWorkFingerprint for new commits — ensures that a
 * choral arrangement and the original orchestration are treated as distinct works.
 */
export function computeWorkFingerprintV2(
  title: string,
  composer: string | undefined | null,
  arranger: string | undefined | null
): WorkFingerprintV2 {
  const normalizedTitle    = normalizeForFingerprint(title);
  const normalizedComposer = normalizeForFingerprint(composer ?? '');
  const normalizedArranger = normalizeForFingerprint(arranger ?? '');

  const combined = `${normalizedTitle}::${normalizedComposer}::${normalizedArranger}`;
  const hash = createHash('sha256').update(combined).digest('hex');

  return { normalizedTitle, normalizedComposer, normalizedArranger, hash };
}

/**
 * Compute a part fingerprint from its identifying attributes.
 * Used to prevent duplicate MusicPart creation on retries.
 */
export function computePartFingerprint(
  sessionId: string,
  canonicalInstrument: string,
  chair: string | null,
  pageStart: number,
  pageEnd: number
): string {
  const parts = [
    sessionId,
    normalizeForFingerprint(canonicalInstrument),
    chair ?? 'no-chair',
    `p${pageStart}-${pageEnd}`,
  ];
  return createHash('sha256')
    .update(parts.join('::'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Stable part identity hash for DB-level dedupe.
 *
 * Unlike `computePartFingerprint`, this intentionally excludes the upload
 * session id and page ranges, so it stays stable across retries/re-segmentation
 * of the same musical part within the same piece.
 */
export function computePartIdentityFingerprint(
  pieceId: string,
  canonicalInstrument: string,
  partName: string,
  chair: string | null,
  transposition: string
): string {
  const parts = [
    pieceId,
    normalizeForFingerprint(canonicalInstrument),
    normalizeForFingerprint(partName),
    normalizeForFingerprint(chair ?? ''),
    normalizeForFingerprint(transposition),
  ];
  return createHash('sha256').update(parts.join('::')).digest('hex');
}

// =============================================================================
// Normalization for Fingerprinting
// =============================================================================

/**
 * Normalize a string for fingerprinting: lowercase, collapse whitespace,
 * strip punctuation, trim.
 */
function normalizeForFingerprint(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// Duplicate Check Logic
// =============================================================================

/**
 * Check for duplicates by source file hash.
 *
 * This is a pure function that compares hashes. The caller is responsible
 * for querying the database for existing sessions with the same hash.
 */
export function checkSourceDuplicate(
  sourceSha256: string,
  existingSession: { id: string; uploadSessionId: string } | null
): DuplicateCheckResult {
  if (!existingSession) {
    return {
      policy: 'NEW_PIECE',
      isDuplicate: false,
      matchingSessionId: null,
      matchingPieceId: null,
      reason: 'No matching source hash found',
    };
  }

  return {
    policy: 'SKIP_DUPLICATE',
    isDuplicate: true,
    matchingSessionId: existingSession.uploadSessionId,
    matchingPieceId: null,
    reason: `Exact source file match: session ${existingSession.uploadSessionId}`,
  };
}

/**
 * Check for duplicates by work fingerprint (title + composer).
 *
 * This is a pure function. The caller queries the DB for matching pieces.
 */
export function checkWorkDuplicate(
  fingerprint: WorkFingerprint,
  existingPiece: { id: string; title: string } | null
): DuplicateCheckResult {
  if (!existingPiece) {
    return {
      policy: 'NEW_PIECE',
      isDuplicate: false,
      matchingSessionId: null,
      matchingPieceId: null,
      reason: 'No matching work fingerprint found',
    };
  }

  return {
    policy: 'EXCEPTION_REVIEW',
    isDuplicate: true,
    matchingSessionId: null,
    matchingPieceId: existingPiece.id,
    reason: `Possible duplicate of "${existingPiece.title}" (work fingerprint match)`,
  };
}

/**
 * Combine source and work duplicate checks into a final policy decision.
 */
export function resolveDeduplicationPolicy(
  sourceResult: DuplicateCheckResult,
  workResult: DuplicateCheckResult
): DuplicateCheckResult {
  // Exact source match takes priority — skip
  if (sourceResult.isDuplicate) {
    return sourceResult;
  }

  // Work-level match — route to review
  if (workResult.isDuplicate) {
    return workResult;
  }

  // Both clean — new piece
  return {
    policy: 'NEW_PIECE',
    isDuplicate: false,
    matchingSessionId: null,
    matchingPieceId: null,
    reason: 'No duplicates detected',
  };
}
