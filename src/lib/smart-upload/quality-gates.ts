/**
 * Shared Quality Gates for Smart Upload
 *
 * Used by BOTH first-pass (smart-upload-processor.ts) and second-pass
 * (smart-upload-worker.ts) to ensure consistent auto-commit eligibility.
 *
 * If ANY gate fails, the session must remain in PENDING_REVIEW with
 * requiresHumanReview=true, and the failing reasons are logged.
 */

import type { ExtractedMetadata, ParsedPartRecord } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

export interface QualityGateInput {
  /** Parsed part records (split PDFs) produced by the pipeline. */
  parsedParts: ParsedPartRecord[];
  /** The extracted (or adjudicated) metadata — must contain cuttingInstructions. */
  metadata: ExtractedMetadata;
  /** Total page count of the original PDF. */
  totalPages: number;
  /** Configurable max pages for a non-score part. Default 12. */
  maxPagesPerPart: number;
  /** segmentationConfidence from first-pass (carried forward into second pass). */
  segmentationConfidence?: number;
  /** Minimum segmentation confidence threshold. Default 70. */
  segmentationConfidenceThreshold?: number;
}

export interface QualityGateResult {
  /** True when one or more gates failed — auto-commit must be blocked. */
  failed: boolean;
  /** Human-readable reason strings (empty array when all gates pass). */
  reasons: string[];
  /**
   * finalConfidence = min(extractionConfidence, segmentationConfidence).
   * If segmentationConfidence is unavailable, equals extractionConfidence.
   */
  finalConfidence: number;
}

// =============================================================================
// Constants
// =============================================================================

const FORBIDDEN_LABELS = new Set([
  'null',
  'none',
  'n/a',
  'na',
  'unknown',
  'undefined',
  '',
  'untitled',
  'blank',
  'cover',
  'placeholder',
]);

const SCORE_SECTIONS = new Set([
  'Score',
  'score',
  'FULL_SCORE',
  'CONDUCTOR_SCORE',
  'CONDENSED_SCORE',
]);

const SCORE_INSTRUMENT_HINTS = new Set([
  'full score',
  'conductor score',
  'condensed score',
  'score',
]);

const DEFAULT_SEG_CONFIDENCE_THRESHOLD = 70;

// =============================================================================
// Helpers
// =============================================================================

/** Returns true when the label should be treated as absent/unknown/forbidden. */
export function isForbiddenLabel(s: string | undefined | null): boolean {
  if (!s) return true;
  return FORBIDDEN_LABELS.has(s.trim().toLowerCase());
}

/** Returns true when a part represents blank/spacer pages with no real instrument. */
function isBlankOrSpacerPart(
  instrument: string | undefined | null,
  partName: string | undefined | null,
): boolean {
  const instrumentNorm = (instrument ?? '').trim().toLowerCase();
  const partNameNorm = (partName ?? '').trim().toLowerCase();

  return (
    instrumentNorm.includes('blank') ||
    instrumentNorm.includes('spacer') ||
    instrumentNorm.includes('separator') ||
    partNameNorm.includes('blank') ||
    partNameNorm.includes('spacer') ||
    partNameNorm.includes('separator') ||
    partNameNorm === 'blank pages' ||
    partNameNorm === 'blank page'
  );
}

function isScoreLikePart(part: ParsedPartRecord): boolean {
  const section = (part.section ?? '').trim();
  const instrument = (part.instrument ?? '').trim().toLowerCase();
  const partName = (part.partName ?? '').trim().toLowerCase();

  return (
    SCORE_SECTIONS.has(section) ||
    SCORE_INSTRUMENT_HINTS.has(instrument) ||
    SCORE_INSTRUMENT_HINTS.has(partName)
  );
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

type NormalizedPageRange = {
  start: number;
  end: number;
  indexing: 'one' | 'zero';
};

function normalizePageRange(
  pageRange: unknown,
  totalPages: number,
): NormalizedPageRange | null {
  if (
    !Array.isArray(pageRange) ||
    pageRange.length < 2 ||
    typeof pageRange[0] !== 'number' ||
    typeof pageRange[1] !== 'number' ||
    !Number.isFinite(pageRange[0]) ||
    !Number.isFinite(pageRange[1])
  ) {
    return null;
  }

  const rawStart = Math.trunc(pageRange[0]);
  const rawEnd = Math.trunc(pageRange[1]);

  if (rawStart > rawEnd) {
    return null;
  }

  // Heuristic:
  // - [1..N] => one-indexed
  // - [0..N-1] => zero-indexed
  // - mixed / impossible => null
  if (rawStart >= 1 && rawEnd <= totalPages) {
    return { start: rawStart, end: rawEnd, indexing: 'one' };
  }

  if (rawStart >= 0 && rawEnd <= totalPages - 1) {
    return { start: rawStart + 1, end: rawEnd + 1, indexing: 'zero' };
  }

  return null;
}

function findCoverageIssues(
  cuttingInstructions: NonNullable<ExtractedMetadata['cuttingInstructions']>,
  totalPages: number,
): {
  invalidRangeReason?: string;
  overlapReason?: string;
  uncoveredReason?: string;
} {
  if (totalPages <= 0 || cuttingInstructions.length === 0) {
    return {};
  }

  const coverage = new Array<number>(totalPages + 1).fill(0); // 1-indexed coverage
  let sawZeroIndexed = false;
  let sawOneIndexed = false;

  for (const instruction of cuttingInstructions) {
    const normalized = normalizePageRange(instruction.pageRange, totalPages);

    if (!normalized) {
      return {
        invalidRangeReason: `Cutting instruction "${instruction.partName}" has invalid or out-of-bounds pageRange`,
      };
    }

    if (normalized.indexing === 'zero') sawZeroIndexed = true;
    if (normalized.indexing === 'one') sawOneIndexed = true;

    for (let page = normalized.start; page <= normalized.end; page++) {
      coverage[page] += 1;
    }
  }

  if (sawZeroIndexed && sawOneIndexed) {
    return {
      invalidRangeReason: 'Cutting instructions contain mixed page indexing (0-indexed and 1-indexed)',
    };
  }

  const overlappingPages: number[] = [];
  const uncoveredPages: number[] = [];

  for (let page = 1; page <= totalPages; page++) {
    if (coverage[page] > 1) overlappingPages.push(page);
    if (coverage[page] === 0) uncoveredPages.push(page);
  }

  const result: {
    invalidRangeReason?: string;
    overlapReason?: string;
    uncoveredReason?: string;
  } = {};

  if (overlappingPages.length > 0) {
    result.overlapReason =
      overlappingPages.length <= 5
        ? `${overlappingPages.length} page(s) covered more than once: [${overlappingPages.join(', ')}]`
        : `${overlappingPages.length} pages covered more than once (overlap detected)`;
  }

  if (uncoveredPages.length > 0) {
    result.uncoveredReason =
      uncoveredPages.length <= 5
        ? `${uncoveredPages.length} page(s) not covered by cutting instructions: [${uncoveredPages.join(', ')}]`
        : `${uncoveredPages.length} pages not covered by cutting instructions (of ${totalPages} total)`;
  }

  return result;
}

// =============================================================================
// Core Gate Runner
// =============================================================================

/**
 * Evaluate all quality gates. Returns whether any gate failed, why, and the
 * computed finalConfidence.
 *
 * This is the single source of truth for auto-commit eligibility checks;
 * both first-pass and second-pass workers call this function.
 */
export function evaluateQualityGates(input: QualityGateInput): QualityGateResult {
  const {
    parsedParts,
    metadata,
    totalPages,
    maxPagesPerPart,
    segmentationConfidence,
    segmentationConfidenceThreshold = DEFAULT_SEG_CONFIDENCE_THRESHOLD,
  } = input;

  const reasons: string[] = [];
  const cuttingInstructions = metadata.cuttingInstructions ?? [];

  // ── Gate 1: No part with a forbidden instrument or partName ──────────────
  const nullPart = parsedParts.find(
    (part) =>
      !isBlankOrSpacerPart(part.instrument, part.partName) &&
      (isForbiddenLabel(part.instrument) || isForbiddenLabel(part.partName)),
  );
  if (nullPart) {
    reasons.push(
      `Part with null/unknown label: instrument="${nullPart.instrument}" partName="${nullPart.partName}"`,
    );
  }

  // ── Gate 1b: Cutting instructions must also have valid labels ────────────
  const forbiddenCut = cuttingInstructions.find(
    (instruction) =>
      !isBlankOrSpacerPart(instruction.instrument, instruction.partName) &&
      (isForbiddenLabel(instruction.instrument) || isForbiddenLabel(instruction.partName)),
  );
  if (forbiddenCut) {
    reasons.push(
      `Cutting instruction with forbidden label: instrument="${forbiddenCut.instrument}" partName="${forbiddenCut.partName}"`,
    );
  }

  // ── Gate 1c: Every cutting instruction must have a valid pageRange ───────
  const missingRange = cuttingInstructions.find(
    (instruction) => normalizePageRange(instruction.pageRange, totalPages) === null,
  );
  if (missingRange) {
    reasons.push(
      `Cutting instruction "${missingRange.partName}" missing valid pageRange`,
    );
  }

  // ── Gate 2: No non-score PART that exceeds maxPagesPerPart ───────────────
  const oversizedPart = parsedParts.find(
    (part) => !isScoreLikePart(part) && part.pageCount > maxPagesPerPart,
  );
  if (oversizedPart) {
    reasons.push(
      `Non-score part "${oversizedPart.partName}" has ${oversizedPart.pageCount} pages (max ${maxPagesPerPart})`,
    );
  }

  // ── Gate 3: Multi-part PDFs with >10 pages must produce ≥2 parts ─────────
  const cutsCount = cuttingInstructions.length;
  if (metadata.isMultiPart && totalPages > 10 && cutsCount < 2) {
    reasons.push(
      `isMultiPart=true with ${totalPages} pages but only ${cutsCount} cutting instruction(s)`,
    );
  }

  // ── Gate 4: segmentationConfidence below threshold ───────────────────────
  if (
    typeof segmentationConfidence === 'number' &&
    Number.isFinite(segmentationConfidence) &&
    segmentationConfidence < segmentationConfidenceThreshold
  ) {
    reasons.push(
      `segmentationConfidence ${segmentationConfidence} < threshold ${segmentationConfidenceThreshold}`,
    );
  }

  // ── Gate 5: Page coverage and overlap checks ─────────────────────────────
  if (cuttingInstructions.length > 0 && !missingRange) {
    const coverageIssues = findCoverageIssues(cuttingInstructions, totalPages);

    if (coverageIssues.invalidRangeReason) {
      reasons.push(coverageIssues.invalidRangeReason);
    }
    if (coverageIssues.overlapReason) {
      reasons.push(coverageIssues.overlapReason);
    }
    if (coverageIssues.uncoveredReason) {
      reasons.push(coverageIssues.uncoveredReason);
    }
  }

  // ── Gate 6: If we have cutting instructions, splitting should have produced parts ──
  if (cuttingInstructions.length > 0 && parsedParts.length === 0) {
    reasons.push('Cutting instructions exist but no parsed parts were produced');
  }

  // ── Compute finalConfidence ──────────────────────────────────────────────
  const extractionConfidence = clampConfidence(metadata.confidenceScore ?? 0);
  const normalizedSegmentationConfidence =
    typeof segmentationConfidence === 'number' && Number.isFinite(segmentationConfidence)
      ? clampConfidence(segmentationConfidence)
      : undefined;

  const finalConfidence =
    typeof normalizedSegmentationConfidence === 'number'
      ? Math.min(extractionConfidence, normalizedSegmentationConfidence)
      : extractionConfidence;

  return {
    failed: reasons.length > 0,
    reasons: dedupeReasons(reasons),
    finalConfidence,
  };
}