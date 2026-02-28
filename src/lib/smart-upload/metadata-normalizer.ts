/**
 * Metadata Normalizer — Normalize raw extracted values before commit.
 *
 * Ensures downstream DB records are stable, searchable, and deterministic
 * regardless of LLM/OCR output variance. Keeps both raw and normalized
 * values so provenance is never lost.
 */

import {
  findByFuzzyMatch,
  getSectionForLabel,
  getTranspositionForLabel,
  type InstrumentSection,
  type Transposition,
} from './canonical-instruments';
import type { ExtractedMetadata, CuttingInstruction } from '../../types/smart-upload';

// =============================================================================
// Types
// =============================================================================

/**
 * A normalized metadata record that pairs raw LLM output with cleaned values.
 */
export interface NormalizedMetadata {
  title: NormalizedField<string>;
  subtitle: NormalizedField<string | undefined>;
  composer: NormalizedField<string | undefined>;
  arranger: NormalizedField<string | undefined>;
  publisher: NormalizedField<string | undefined>;
  ensembleType: NormalizedField<string | undefined>;
  confidenceScore: number;
  fileType: ExtractedMetadata['fileType'];
  isMultiPart: boolean;
  parts: NormalizedPart[];
}

export interface NormalizedField<T> {
  /** Original value from LLM/OCR */
  raw: T;
  /** Cleaned/normalized value */
  normalized: T;
}

export interface NormalizedPart {
  /** Raw instrument label from LLM */
  rawInstrument: string;
  /** Raw part name from LLM */
  rawPartName: string;
  /** Canonical instrument name */
  canonicalInstrument: string;
  /** Canonical section */
  section: InstrumentSection;
  /** Canonical transposition */
  transposition: Transposition;
  /** Chair designation (1st, 2nd, etc.) */
  chair: string | null;
  /** Page range [start, end] */
  pageRange: [number, number];
  /** Deterministic fingerprint for dedup */
  fingerprint: string;
}

// =============================================================================
// Text Normalization Primitives
// =============================================================================

/**
 * Normalize a title string: trim, collapse whitespace, title-case.
 */
export function normalizeTitle(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\w\S*/g, (word) => {
      // Don't capitalize common articles/prepositions mid-title
      const lower = word.toLowerCase();
      if (['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'in', 'on', 'at', 'to', 'of'].includes(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    // Ensure first character is capitalized
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Normalize a person name: trim, collapse whitespace, proper case.
 * Handles "Last, First" → "First Last" conversion.
 */
export function normalizePersonName(raw: string | undefined | null): string {
  if (!raw) return '';
  let name = raw.trim().replace(/\s+/g, ' ');

  // Handle "Last, First" format
  if (name.includes(',')) {
    const [last, first] = name.split(',', 2).map((s) => s.trim());
    if (first && last) {
      name = `${first} ${last}`;
    }
  }

  // Proper-case each word
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalize a publisher name: trim, collapse whitespace.
 */
export function normalizePublisher(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize a chair number string to canonical form.
 */
export function normalizeChair(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const str = String(raw).trim().toLowerCase();

  // Numeric
  if (/^1$/.test(str)) return '1st';
  if (/^2$/.test(str)) return '2nd';
  if (/^3$/.test(str)) return '3rd';
  if (/^4$/.test(str)) return '4th';

  // English ordinals
  if (/^1st$/i.test(str) || /^first$/i.test(str)) return '1st';
  if (/^2nd$/i.test(str) || /^second$/i.test(str)) return '2nd';
  if (/^3rd$/i.test(str) || /^third$/i.test(str)) return '3rd';
  if (/^4th$/i.test(str) || /^fourth$/i.test(str)) return '4th';

  // Roman numerals
  if (/^i$/i.test(str)) return '1st';
  if (/^ii$/i.test(str)) return '2nd';
  if (/^iii$/i.test(str)) return '3rd';
  if (/^iv$/i.test(str)) return '4th';

  // Special
  if (/^aux/i.test(str)) return 'Aux';
  if (/^solo/i.test(str)) return 'Solo';

  return str;
}

/**
 * Normalize a transposition key string to canonical form.
 */
export function normalizeTransposition(raw: string | undefined | null): Transposition {
  if (!raw) return 'C';
  const str = raw.trim().toLowerCase();
  if (/^(bb|b-flat|b♭)$/i.test(str)) return 'Bb';
  if (/^(eb|e-flat|e♭)$/i.test(str)) return 'Eb';
  if (/^f$/i.test(str)) return 'F';
  if (/^g$/i.test(str)) return 'G';
  if (/^d$/i.test(str)) return 'D';
  if (/^a$/i.test(str)) return 'A';
  return 'C';
}

/**
 * Normalize an instrument label using the canonical instruments registry.
 */
export function normalizeInstrument(raw: string): {
  canonicalName: string;
  section: InstrumentSection;
  transposition: Transposition;
} {
  const match = findByFuzzyMatch(raw);
  if (match) {
    return {
      canonicalName: match.name,
      section: match.section,
      transposition: match.transposition,
    };
  }
  return {
    canonicalName: raw.trim() || 'Unknown',
    section: getSectionForLabel(raw),
    transposition: getTranspositionForLabel(raw),
  };
}

// =============================================================================
// Part Fingerprint
// =============================================================================

/**
 * Generate a deterministic fingerprint for a part.
 * Same inputs always produce the same fingerprint, safe for dedup.
 */
export function generatePartFingerprint(
  sessionId: string,
  canonicalInstrument: string,
  chair: string | null,
  pageStart: number,
  pageEnd: number
): string {
  const parts = [
    sessionId,
    canonicalInstrument.toLowerCase().replace(/\s+/g, '-'),
    chair ?? 'no-chair',
    `p${pageStart}-${pageEnd}`,
  ];
  return parts.join('::');
}

// =============================================================================
// Full Metadata Normalization
// =============================================================================

/**
 * Normalize an entire ExtractedMetadata object into a NormalizedMetadata record.
 * Preserves raw values alongside normalized ones.
 */
export function normalizeExtractedMetadata(
  sessionId: string,
  raw: ExtractedMetadata,
  cuttingInstructions?: CuttingInstruction[]
): NormalizedMetadata {
  const instructions = cuttingInstructions ?? raw.cuttingInstructions ?? [];

  const parts: NormalizedPart[] = instructions.map((ci) => {
    const { canonicalName, section, transposition } = normalizeInstrument(ci.instrument);
    const chair = normalizeChair(ci.partNumber);

    return {
      rawInstrument: ci.instrument,
      rawPartName: ci.partName,
      canonicalInstrument: canonicalName,
      section,
      transposition,
      chair,
      pageRange: ci.pageRange,
      fingerprint: generatePartFingerprint(
        sessionId,
        canonicalName,
        chair,
        ci.pageRange[0],
        ci.pageRange[1]
      ),
    };
  });

  return {
    title: {
      raw: raw.title,
      normalized: normalizeTitle(raw.title),
    },
    subtitle: {
      raw: raw.subtitle,
      normalized: raw.subtitle ? normalizeTitle(raw.subtitle) : undefined,
    },
    composer: {
      raw: raw.composer,
      normalized: raw.composer ? normalizePersonName(raw.composer) : undefined,
    },
    arranger: {
      raw: raw.arranger,
      normalized: raw.arranger ? normalizePersonName(raw.arranger) : undefined,
    },
    publisher: {
      raw: raw.publisher,
      normalized: raw.publisher ? normalizePublisher(raw.publisher) : undefined,
    },
    ensembleType: {
      raw: raw.ensembleType,
      normalized: raw.ensembleType?.trim(),
    },
    confidenceScore: raw.confidenceScore,
    fileType: raw.fileType,
    isMultiPart: raw.isMultiPart ?? false,
    parts,
  };
}
