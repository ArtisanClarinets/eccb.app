/**
 * Cutting Instructions Validation Service
 *
 * Validates and normalizes cutting instructions for the Smart Upload pipeline.
 * Handles page indexing, filename collisions, overlaps, and gaps.
 */

import { logger } from '@/lib/logger';
import type { CuttingInstruction } from '@/types/smart-upload';

export type { CuttingInstruction };

export interface NormalizedInstruction {
  partName: string;
  pageStart: number; // 0-indexed
  pageEnd: number; // 0-indexed
  originalIndex?: number;
  originalMetadata?: Partial<CuttingInstruction>;
}

export interface ValidationOptions {
  oneIndexed?: boolean;  // Input is 1-indexed, convert to 0-indexed
  allowOverlaps?: boolean;
  autoFixOverlaps?: boolean;
  detectGaps?: boolean;
}

export interface ValidationResult {
  instructions: CuttingInstruction[];
  warnings: string[];
  errors: string[];
  isValid: boolean;
  gaps?: Array<{ start: number; end: number }>;
  overlaps?: Array<{ part1: string; part2: string; overlap: [number, number] }>;
}

const VALID_SECTIONS = new Set<CuttingInstruction['section']>([
  'Woodwinds',
  'Brass',
  'Percussion',
  'Strings',
  'Keyboard',
  'Vocals',
  'Other',
  'Score',
]);

const VALID_TRANSPOSITIONS = new Set<CuttingInstruction['transposition']>([
  'Bb',
  'Eb',
  'F',
  'C',
  'D',
  'G',
  'A',
]);

const VALID_CHAIRS = new Set<NonNullable<CuttingInstruction['chair']>>([
  '1st',
  '2nd',
  '3rd',
  '4th',
  'Aux',
  'Solo',
]);

const VALID_PART_TYPES = new Set<NonNullable<CuttingInstruction['partType']>>([
  'PART',
  'FULL_SCORE',
  'CONDUCTOR_SCORE',
  'CONDENSED_SCORE',
]);

export function toZeroIndexed(range: [number, number]): [number, number] {
  return [Math.max(0, range[0] - 1), Math.max(0, range[1] - 1)];
}

export function toOneIndexed(range: [number, number]): [number, number] {
  return [range[0] + 1, range[1] + 1];
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function normalizePartName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInstrument(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unknown';
}

function normalizeSection(value: unknown): CuttingInstruction['section'] {
  return typeof value === 'string' && VALID_SECTIONS.has(value as CuttingInstruction['section'])
    ? (value as CuttingInstruction['section'])
    : 'Other';
}

function normalizeTransposition(value: unknown): CuttingInstruction['transposition'] {
  return typeof value === 'string' && VALID_TRANSPOSITIONS.has(value as CuttingInstruction['transposition'])
    ? (value as CuttingInstruction['transposition'])
    : 'C';
}

function normalizePartNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeChair(value: unknown): CuttingInstruction['chair'] | undefined {
  if (value === null) return null;
  return typeof value === 'string' && VALID_CHAIRS.has(value as NonNullable<CuttingInstruction['chair']>)
    ? (value as NonNullable<CuttingInstruction['chair']>)
    : undefined;
}

function normalizePartType(value: unknown): CuttingInstruction['partType'] | undefined {
  return typeof value === 'string' && VALID_PART_TYPES.has(value as NonNullable<CuttingInstruction['partType']>)
    ? (value as NonNullable<CuttingInstruction['partType']>)
    : undefined;
}

function normalizeLabelConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildOriginalMetadata(instruction: Record<string, unknown>): Partial<CuttingInstruction> {
  const metadata: Partial<CuttingInstruction> = {
    instrument: normalizeInstrument(instruction.instrument),
    section: normalizeSection(instruction.section),
    transposition: normalizeTransposition(instruction.transposition),
    partNumber: normalizePartNumber(instruction.partNumber),
  };

  const chair = normalizeChair(instruction.chair);
  if (chair !== undefined) metadata.chair = chair;

  const partType = normalizePartType(instruction.partType);
  if (partType !== undefined) metadata.partType = partType;

  const labelConfidence = normalizeLabelConfidence(instruction.labelConfidence);
  if (labelConfidence !== undefined) metadata.labelConfidence = labelConfidence;

  return metadata;
}

function parsePageRange(
  instruction: Record<string, unknown>,
  index: number,
  partName: string,
  errors: string[],
): { pageStart: number; pageEnd: number } | null {
  if ('pageRange' in instruction && Array.isArray(instruction.pageRange) && instruction.pageRange.length >= 2) {
    const start = instruction.pageRange[0];
    const end = instruction.pageRange[1];

    if (!isFiniteInteger(start)) {
      errors.push(`Instruction ${index} (${partName}): pageRange[0] must be a finite integer`);
      return null;
    }

    if (!isFiniteInteger(end)) {
      errors.push(`Instruction ${index} (${partName}): pageRange[1] must be a finite integer`);
      return null;
    }

    return { pageStart: start, pageEnd: end };
  }

  if ('pageStart' in instruction && 'pageEnd' in instruction) {
    if (!isFiniteInteger(instruction.pageStart)) {
      errors.push(`Instruction ${index} (${partName}): pageStart must be an integer`);
      return null;
    }

    if (!isFiniteInteger(instruction.pageEnd)) {
      errors.push(`Instruction ${index} (${partName}): pageEnd must be an integer`);
      return null;
    }

    return {
      pageStart: instruction.pageStart,
      pageEnd: instruction.pageEnd,
    };
  }

  errors.push(`Instruction ${index} (${partName}): Missing pageRange or pageStart/pageEnd`);
  return null;
}

/**
 * Validates and normalizes cutting instructions.
 *
 * @param rawInstructions - Array of raw instruction objects from LLM
 * @param totalPages - Total number of pages in the PDF
 * @param options - Validation options
 * @returns ValidationResult with normalized instructions, warnings, and errors
 */
export function validateAndNormalizeInstructions(
  rawInstructions: unknown[],
  totalPages: number,
  options: ValidationOptions = {},
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const normalizedInstructions: NormalizedInstruction[] = [];

  if (!Array.isArray(rawInstructions)) {
    errors.push('Instructions must be an array');
    return {
      instructions: [],
      warnings,
      errors,
      isValid: false,
    };
  }

  if (rawInstructions.length === 0) {
    warnings.push('No cutting instructions provided');
    return {
      instructions: [],
      warnings,
      errors,
      isValid: true,
    };
  }

  if (totalPages <= 0) {
    errors.push(`Invalid totalPages: ${totalPages}. Must be greater than 0`);
    return {
      instructions: [],
      warnings,
      errors,
      isValid: false,
    };
  }

  // Step 1: Validate and normalize each instruction
  for (let i = 0; i < rawInstructions.length; i++) {
    const raw = rawInstructions[i];

    if (raw === null || typeof raw !== 'object') {
      errors.push(`Instruction ${i}: Must be an object`);
      continue;
    }

    const instruction = raw as Record<string, unknown>;

    if (!('partName' in instruction)) {
      errors.push(`Instruction ${i}: Missing or invalid partName`);
      continue;
    }

    const partName = normalizePartName(instruction.partName);
    if (!partName) {
      errors.push(`Instruction ${i}: partName cannot be empty`);
      continue;
    }

    const parsedRange = parsePageRange(instruction, i, partName, errors);
    if (!parsedRange) {
      continue;
    }

    normalizedInstructions.push({
      partName,
      pageStart: parsedRange.pageStart,
      pageEnd: parsedRange.pageEnd,
      originalIndex: i,
      originalMetadata: buildOriginalMetadata(instruction),
    });
  }

  if (normalizedInstructions.length === 0 && errors.length > 0) {
    return {
      instructions: [],
      warnings,
      errors,
      isValid: false,
    };
  }

  // Step 2: Convert 1-indexed to 0-indexed if needed
  let processedInstructions = normalizedInstructions;
  if (options.oneIndexed) {
    processedInstructions = convertOneToZeroIndexed(processedInstructions);
    logger.info('Converted 1-indexed to 0-indexed instructions', {
      count: processedInstructions.length,
    });
  }

  // Step 3: Clamp ranges to valid page bounds
  processedInstructions = clampRanges(processedInstructions, totalPages);

  // Step 4: Ensure pageStart <= pageEnd
  for (const instruction of processedInstructions) {
    if (instruction.pageStart > instruction.pageEnd) {
      errors.push(
        `Part "${instruction.partName}": pageStart (${instruction.pageStart}) cannot be greater than pageEnd (${instruction.pageEnd})`,
      );
    }
  }

  // Step 5: Detect overlaps
  let overlaps = detectOverlaps(processedInstructions);
  if (overlaps.length > 0) {
    if (!options.allowOverlaps && !options.autoFixOverlaps) {
      for (const overlap of overlaps) {
        errors.push(
          `Overlap detected between "${overlap.part1}" and "${overlap.part2}" on pages ${overlap.overlap[0]}-${overlap.overlap[1]}`,
        );
      }
    } else {
      for (const overlap of overlaps) {
        warnings.push(
          `Overlap detected between "${overlap.part1}" and "${overlap.part2}" on pages ${overlap.overlap[0]}-${overlap.overlap[1]}`,
        );
      }
    }

    if (options.autoFixOverlaps) {
      processedInstructions = splitOverlappingRanges(processedInstructions);
      overlaps = detectOverlaps(processedInstructions);
      warnings.push('Auto-fixed overlapping ranges');
    }
  }

  // Step 6: Detect gaps
  let gaps: Array<{ start: number; end: number }> | undefined;
  if (options.detectGaps) {
    gaps = detectGaps(processedInstructions, totalPages);
    if (gaps.length > 0) {
      for (const gap of gaps) {
        warnings.push(`Gap detected: pages ${gap.start}-${gap.end} are not covered by any part`);
      }
    }
  }

  const isValid = errors.length === 0 && processedInstructions.length > 0;

  logger.info('Cutting instructions validation complete', {
    totalInstructions: processedInstructions.length,
    errors: errors.length,
    warnings: warnings.length,
    overlaps: overlaps.length,
    gaps: gaps?.length ?? 0,
    isValid,
  });

  const finalInstructions: CuttingInstruction[] = processedInstructions.map((processed, idx) => {
    const original = processed.originalMetadata;

    const instruction: CuttingInstruction = {
      instrument: original?.instrument ?? 'Unknown',
      partName: processed.partName,
      section: normalizeSection(original?.section),
      transposition: normalizeTransposition(original?.transposition),
      partNumber: original?.partNumber ?? idx + 1,
      pageRange: [processed.pageStart, processed.pageEnd] as [number, number],
    };

    if (original?.chair !== undefined) {
      instruction.chair = normalizeChair(original.chair) ?? undefined;
    }
    if (original?.partType !== undefined) {
      instruction.partType = normalizePartType(original.partType);
    }
    if (original?.labelConfidence !== undefined) {
      instruction.labelConfidence = normalizeLabelConfidence(original.labelConfidence);
    }

    return instruction;
  });

  return {
    instructions: finalInstructions,
    warnings,
    errors,
    isValid,
    gaps,
    overlaps: overlaps.length > 0 ? overlaps : undefined,
  };
}

/**
 * Converts 1-indexed page numbers to 0-indexed.
 *
 * @param instructions - Array of cutting instructions
 * @returns Instructions with 0-indexed page numbers
 */
function convertOneToZeroIndexed(instructions: NormalizedInstruction[]): NormalizedInstruction[] {
  return instructions.map((instruction) => {
    const [pageStart, pageEnd] = toZeroIndexed([
      instruction.pageStart,
      instruction.pageEnd,
    ] as [number, number]);

    return {
      ...instruction,
      pageStart,
      pageEnd,
    };
  });
}

/**
 * Clamps page ranges to valid bounds [0, totalPages-1].
 *
 * @param instructions - Array of cutting instructions
 * @param totalPages - Total number of pages in the PDF
 * @returns Instructions with clamped page ranges
 */
function clampRanges(
  instructions: NormalizedInstruction[],
  totalPages: number,
): NormalizedInstruction[] {
  return instructions.map((instruction) => ({
    ...instruction,
    pageStart: Math.max(0, Math.min(instruction.pageStart, totalPages - 1)),
    pageEnd: Math.max(0, Math.min(instruction.pageEnd, totalPages - 1)),
  }));
}

/**
 * Detects overlapping page ranges between parts.
 *
 * @param instructions - Array of cutting instructions
 * @returns Array of overlapping part pairs with overlap ranges
 */
export function detectOverlaps(
  instructions: NormalizedInstruction[],
): Array<{ part1: string; part2: string; overlap: [number, number] }> {
  const overlaps: Array<{ part1: string; part2: string; overlap: [number, number] }> = [];

  for (let i = 0; i < instructions.length; i++) {
    for (let j = i + 1; j < instructions.length; j++) {
      const a = instructions[i];
      const b = instructions[j];

      const overlapStart = Math.max(a.pageStart, b.pageStart);
      const overlapEnd = Math.min(a.pageEnd, b.pageEnd);

      if (overlapStart <= overlapEnd) {
        overlaps.push({
          part1: a.partName,
          part2: b.partName,
          overlap: [overlapStart, overlapEnd],
        });
      }
    }
  }

  return overlaps;
}

/**
 * Detects gaps in page coverage (pages not covered by any part).
 *
 * @param instructions - Array of cutting instructions
 * @param totalPages - Total number of pages in the PDF
 * @returns Array of page ranges not covered by any part
 */
export function detectGaps(
  instructions: NormalizedInstruction[],
  totalPages: number,
): Array<{ start: number; end: number }> {
  if (instructions.length === 0) {
    return totalPages > 0 ? [{ start: 0, end: totalPages - 1 }] : [];
  }

  const gaps: Array<{ start: number; end: number }> = [];
  const covered = new Array(totalPages).fill(false);

  for (const instruction of instructions) {
    for (let page = instruction.pageStart; page <= instruction.pageEnd; page++) {
      if (page >= 0 && page < totalPages) {
        covered[page] = true;
      }
    }
  }

  let gapStart: number | null = null;
  for (let i = 0; i < totalPages; i++) {
    if (!covered[i]) {
      if (gapStart === null) {
        gapStart = i;
      }
    } else if (gapStart !== null) {
      gaps.push({ start: gapStart, end: i - 1 });
      gapStart = null;
    }
  }

  if (gapStart !== null) {
    gaps.push({ start: gapStart, end: totalPages - 1 });
  }

  return gaps;
}

/**
 * Generates a unique filename for a part.
 *
 * Format: "PartName__p{start}-{end}_{index}.pdf"
 * Sanitizes partName by removing unsafe characters.
 *
 * @param partName - Name of the part
 * @param pageStart - Start page (0-indexed)
 * @param pageEnd - End page (0-indexed)
 * @param index - Index for uniqueness
 * @returns Sanitized unique filename
 */
export function generateUniqueFilename(
  partName: string,
  pageStart: number,
  pageEnd: number,
  index: number,
): string {
  // Preserve existing filename behavior exactly for current tests/callers.
  const sanitized = partName.replace(/[^a-zA-Z0-9\s&_-]/g, '').trim();
  return `${sanitized}__p${pageStart}-${pageEnd}_${index}.pdf`;
}

/**
 * Splits overlapping ranges by truncating earlier parts.
 * Strategy: When two parts overlap, the earlier part gets truncated at the start of the overlap.
 * Only consecutive parts in sorted order are checked for overlap.
 *
 * Example: PartA pages 1-5, PartB pages 3-7
 * Result: PartA pages 1-2, PartB pages 3-7
 *
 * @param instructions - Array of cutting instructions
 * @returns Instructions with split ranges
 */
export function splitOverlappingRanges(instructions: NormalizedInstruction[]): NormalizedInstruction[] {
  if (instructions.length <= 1) {
    return [...instructions];
  }

  const sorted = instructions
    .map((instruction, sortOrdinal) => ({ instruction, sortOrdinal }))
    .sort((a, b) => {
      if (a.instruction.pageStart !== b.instruction.pageStart) {
        return a.instruction.pageStart - b.instruction.pageStart;
      }
      return a.sortOrdinal - b.sortOrdinal;
    });

  const result: NormalizedInstruction[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i].instruction;
    const next = sorted[i + 1]?.instruction;

    if (next && current.pageEnd >= next.pageStart) {
      const adjustedEnd = next.pageStart - 1;

      if (adjustedEnd >= current.pageStart) {
        result.push({
          ...current,
          pageEnd: adjustedEnd,
        });
      }
    } else {
      result.push({ ...current });
    }
  }

  return result;
}

// =============================================================================
// Gap Detection
// =============================================================================

/**
 * Build synthetic CuttingInstructions for any page ranges not covered by the
 * provided instructions.
 *
 * IMPORTANT: This function expects **0-indexed** page ranges
 * (i.e. instructions already processed by validateAndNormalizeInstructions).
 * Results are tagged as “Unlabelled Pages {start+1}–{end+1}” for human display
 * and assigned high part-numbers (9900+) so they sort after legitimate parts.
 *
 * @param instructions - 0-indexed page-range instructions already validated.
 * @param totalPages   - Total page count (0-indexed upper bound = totalPages-1).
 */
export function buildGapInstructions(
  instructions: CuttingInstruction[],
  totalPages: number,
): CuttingInstruction[] {
  const covered = new Set<number>();

  for (const instruction of instructions) {
    if (
      !Array.isArray(instruction.pageRange) ||
      instruction.pageRange.length < 2 ||
      !isFiniteInteger(instruction.pageRange[0]) ||
      !isFiniteInteger(instruction.pageRange[1])
    ) {
      continue;
    }

    const start = Math.max(0, instruction.pageRange[0]);
    const end = Math.min(totalPages - 1, instruction.pageRange[1]);

    for (let page = start; page <= end; page++) {
      covered.add(page);
    }
  }

  const gaps: Array<[number, number]> = [];
  let gapStart: number | null = null;

  for (let page = 0; page < totalPages; page++) {
    if (!covered.has(page)) {
      if (gapStart === null) gapStart = page;
    } else if (gapStart !== null) {
      gaps.push([gapStart, page - 1]);
      gapStart = null;
    }
  }

  if (gapStart !== null) {
    gaps.push([gapStart, totalPages - 1]);
  }

  return gaps.map(([start, end], index) => ({
    partName: `Unlabelled Pages ${start + 1}-${end + 1}`,
    instrument: 'Unknown',
    section: 'Other' as const,
    transposition: 'C' as const,
    partNumber: 9900 + index,
    pageRange: [start, end] as [number, number],
  }));
}

/**
 * Sanitize cutting instructions before passing to splitPdfByCuttingInstructions.
 * Filters out any instruction with missing/invalid pageRange to prevent crashes.
 * Returns the filtered array and logs any removed entries.
 */
export function sanitizeCuttingInstructionsForSplit(
  instructions: CuttingInstruction[],
): CuttingInstruction[] {
  const valid: CuttingInstruction[] = [];
  const invalid: string[] = [];

  for (const instruction of instructions) {
    if (
      Array.isArray(instruction.pageRange) &&
      instruction.pageRange.length >= 2 &&
      typeof instruction.pageRange[0] === 'number' &&
      typeof instruction.pageRange[1] === 'number' &&
      Number.isFinite(instruction.pageRange[0]) &&
      Number.isFinite(instruction.pageRange[1]) &&
      Number.isInteger(instruction.pageRange[0]) &&
      Number.isInteger(instruction.pageRange[1])
    ) {
      valid.push(instruction);
    } else {
      invalid.push(instruction.partName || 'unnamed');
    }
  }

  if (invalid.length > 0) {
    logger.warn('Removed cutting instructions with invalid pageRange before split', {
      removed: invalid,
      remaining: valid.length,
    });
  }

  return valid;
}