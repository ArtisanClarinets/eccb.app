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
  'null', 'none', 'n/a', 'na', 'unknown', 'undefined', '',
  'untitled', 'blank', 'cover', 'placeholder',
]);

const SCORE_SECTIONS = new Set([
  'Score', 'score', 'FULL_SCORE', 'CONDUCTOR_SCORE', 'CONDENSED_SCORE',
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
  const pn = (partName ?? '').trim().toLowerCase();
  return (
    pn.includes('blank') ||
    pn.includes('spacer') ||
    pn.includes('separator') ||
    pn === 'blank pages' ||
    pn === 'blank page'
  );
}

// =============================================================================
// Core Gate Runner
// =============================================================================

/**
 * Evaluate all quality gates. Returns whether any gate failed, why, and the
 * computed finalConfidence.
 *
 * This is the **single source of truth** for auto-commit eligibility checks;
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

  // ── Gate 1: No part with a forbidden instrument or partName ──────────────
  // Exception: blank/spacer pages legitimately have no instrument.
  const nullPart = parsedParts.find(
    (p) =>
      !isBlankOrSpacerPart(p.instrument, p.partName) &&
      (isForbiddenLabel(p.instrument) || isForbiddenLabel(p.partName)),
  );
  if (nullPart) {
    reasons.push(
      `Part with null/unknown label: instrument="${nullPart.instrument}" partName="${nullPart.partName}"`,
    );
  }

  // ── Gate 1b: Cutting instructions must also have valid labels ────────────
  const cuttingInstructions = metadata.cuttingInstructions ?? [];
  const forbiddenCut = cuttingInstructions.find(
    (ci) =>
      !isBlankOrSpacerPart(ci.instrument, ci.partName) &&
      (isForbiddenLabel(ci.instrument) || isForbiddenLabel(ci.partName)),
  );
  if (forbiddenCut) {
    reasons.push(
      `Cutting instruction with forbidden label: instrument="${forbiddenCut.instrument}" partName="${forbiddenCut.partName}"`,
    );
  }

  // ── Gate 1c: Every cutting instruction must have a valid pageRange ───────
  const missingRange = cuttingInstructions.find(
    (ci) =>
      !Array.isArray(ci.pageRange) ||
      ci.pageRange.length < 2 ||
      typeof ci.pageRange[0] !== 'number' ||
      typeof ci.pageRange[1] !== 'number',
  );
  if (missingRange) {
    reasons.push(
      `Cutting instruction "${missingRange.partName}" missing valid pageRange`,
    );
  }

  // ── Gate 2: No non-score PART that exceeds maxPagesPerPart ───────────────
  const oversizedPart = parsedParts.find(
    (p) => !SCORE_SECTIONS.has(p.section) && p.pageCount > maxPagesPerPart,
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

  // ── Gate 5: Page coverage — all pages should be covered by cutting instructions
  if (cuttingInstructions.length > 0 && !missingRange) {
    const coveredPages = new Set<number>();
    for (const ci of cuttingInstructions) {
      if (Array.isArray(ci.pageRange) && ci.pageRange.length >= 2) {
        for (let p = ci.pageRange[0]; p <= ci.pageRange[1]; p++) {
          coveredPages.add(p);
        }
      }
    }
    // Check for uncovered pages (1-indexed)
    const uncovered: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!coveredPages.has(p)) uncovered.push(p);
    }
    if (uncovered.length > 0 && uncovered.length <= 5) {
      // A small number of uncovered pages is suspicious
      reasons.push(
        `${uncovered.length} page(s) not covered by cutting instructions: [${uncovered.join(', ')}]`,
      );
    } else if (uncovered.length > 5) {
      reasons.push(
        `${uncovered.length} pages not covered by cutting instructions (of ${totalPages} total)`,
      );
    }
  }

  // ── Gate 4: segmentationConfidence below threshold ───────────────────────
  if (
    typeof segmentationConfidence === 'number' &&
    segmentationConfidence < segmentationConfidenceThreshold
  ) {
    reasons.push(
      `segmentationConfidence ${segmentationConfidence} < threshold ${segmentationConfidenceThreshold}`,
    );
  }

  // ── Compute finalConfidence ──────────────────────────────────────────────
  const extractionConfidence = metadata.confidenceScore ?? 0;
  const finalConfidence =
    typeof segmentationConfidence === 'number'
      ? Math.min(extractionConfidence, segmentationConfidence)
      : extractionConfidence;

  return {
    failed: reasons.length > 0,
    reasons,
    finalConfidence,
  };
}
