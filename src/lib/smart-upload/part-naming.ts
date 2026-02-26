/**
 * Part Naming Utility
 *
 * Normalises instrument label strings from LLM output into canonical names
 * and builds human-readable display names + safe filenames.
 *
 * Examples:
 *   normalizeInstrumentLabel("Clarinet 1")     → { instrument: "Bb Clarinet", chair: "1st", transposition: "Bb" }
 *   buildPartDisplayName("American Patrol", …) → "American Patrol 1st Bb Clarinet"
 *   buildPartFilename("American Patrol 1st Bb Clarinet") → "American_Patrol_1st_Bb_Clarinet.pdf"
 */

// =============================================================================
// Types
// =============================================================================

export interface NormalisedInstrument {
  /** Canonical instrument name (e.g. "Bb Clarinet", "1st Flute") */
  instrument: string;
  /** Chair designation if present */
  chair: '1st' | '2nd' | '3rd' | '4th' | 'Aux' | 'Solo' | null;
  /** Concert-pitch transposition key */
  transposition: 'C' | 'Bb' | 'Eb' | 'F' | 'G' | 'D' | 'A';
  /** Instrument family / section */
  section: 'Woodwinds' | 'Brass' | 'Percussion' | 'Strings' | 'Keyboard' | 'Vocals' | 'Score' | 'Other';
  /** Optional inferred source-part type */
  partType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'CONDENSED_SCORE' | 'PART';
}

// =============================================================================
// Chair Inference
// =============================================================================

const CHAIR_PATTERNS: Array<{ pattern: RegExp; chair: NormalisedInstrument['chair'] }> = [
  { pattern: /\b(1st|first|i\b|1)\b/i, chair: '1st' },
  { pattern: /\b(2nd|second|ii\b|2)\b/i, chair: '2nd' },
  { pattern: /\b(3rd|third|iii\b|3)\b/i, chair: '3rd' },
  { pattern: /\b(4th|fourth|iv\b|4)\b/i, chair: '4th' },
  { pattern: /\b(aux|auxiliary)\b/i, chair: 'Aux' },
  { pattern: /\b(solo)\b/i, chair: 'Solo' },
];

const CHAIR_NORMALIZATION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\bclarinet\s+in\s+bb\s*(i{1,3}|iv|1|2|3|4)\b/i,
    replacement: '$1 Bb Clarinet',
  },
  {
    pattern: /\bbb\s+clarinet\s*(i{1,3}|iv|1|2|3|4)\b/i,
    replacement: '$1 Bb Clarinet',
  },
  {
    pattern: /\bclarinet\s*(i{1,3}|iv|1|2|3|4)\s+in\s+bb\b/i,
    replacement: '$1 Bb Clarinet',
  },
];

function normaliseRomanChairToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'i' || lower === '1') return '1st';
  if (lower === 'ii' || lower === '2') return '2nd';
  if (lower === 'iii' || lower === '3') return '3rd';
  if (lower === 'iv' || lower === '4') return '4th';
  return token;
}

function normalizeChairPhrases(raw: string): string {
  let normalized = raw.trim().replace(/\s+/g, ' ');

  for (const { pattern, replacement } of CHAIR_NORMALIZATION_PATTERNS) {
    normalized = normalized.replace(pattern, (_, chairToken: string) => {
      return replacement.replace('$1', normaliseRomanChairToken(chairToken));
    });
  }

  return normalized;
}

function inferChair(raw: string): NormalisedInstrument['chair'] {
  for (const { pattern, chair } of CHAIR_PATTERNS) {
    if (pattern.test(raw)) return chair;
  }
  return null;
}

function inferPartType(raw: string): NormalisedInstrument['partType'] {
  const lower = raw.toLowerCase();
  if (/\bconductor\b/.test(lower)) return 'CONDUCTOR_SCORE';
  if (/\bcondensed\s+score\b/.test(lower)) return 'CONDENSED_SCORE';
  if (/\b(full\s+score|score)\b/.test(lower)) return 'FULL_SCORE';
  return 'PART';
}

// =============================================================================
// Instrument + Transposition Inference
// =============================================================================

interface InstrumentMapping {
  pattern: RegExp;
  base: string;
  transposition: NormalisedInstrument['transposition'];
  section: NormalisedInstrument['section'];
}

const INSTRUMENT_MAPPINGS: InstrumentMapping[] = [
  // Woodwinds
  { pattern: /piccolo/i, base: 'Piccolo', transposition: 'C', section: 'Woodwinds' },
  { pattern: /\beb[\s.-]?clarinet\b/i, base: 'Eb Clarinet', transposition: 'Eb', section: 'Woodwinds' },
  { pattern: /\bbass[\s.-]?clarinet\b/i, base: 'Bass Clarinet', transposition: 'Bb', section: 'Woodwinds' },
  { pattern: /\bclarinet\b/i, base: 'Bb Clarinet', transposition: 'Bb', section: 'Woodwinds' },
  { pattern: /\bflute\b/i, base: 'Flute', transposition: 'C', section: 'Woodwinds' },
  { pattern: /\boboe\b/i, base: 'Oboe', transposition: 'C', section: 'Woodwinds' },
  { pattern: /\benglish[\s.-]?horn\b/i, base: 'English Horn', transposition: 'F', section: 'Woodwinds' },
  { pattern: /\bbassoon\b/i, base: 'Bassoon', transposition: 'C', section: 'Woodwinds' },
  { pattern: /\bcontra[\s.-]?bassoon\b/i, base: 'Contrabassoon', transposition: 'C', section: 'Woodwinds' },
  { pattern: /\bsoprano[\s.-]?sax/i, base: 'Soprano Saxophone', transposition: 'Bb', section: 'Woodwinds' },
  { pattern: /\balto[\s.-]?sax/i, base: 'Alto Saxophone', transposition: 'Eb', section: 'Woodwinds' },
  { pattern: /\btenor[\s.-]?sax/i, base: 'Tenor Saxophone', transposition: 'Bb', section: 'Woodwinds' },
  { pattern: /\bbari(tone)?[\s.-]?sax/i, base: 'Baritone Saxophone', transposition: 'Eb', section: 'Woodwinds' },
  { pattern: /\bsax(ophone)?\b/i, base: 'Saxophone', transposition: 'C', section: 'Woodwinds' },
  // Brass
  { pattern: /\bflugelhorn\b/i, base: 'Flugelhorn', transposition: 'Bb', section: 'Brass' },
  { pattern: /\btrumpet\b/i, base: 'Trumpet', transposition: 'Bb', section: 'Brass' },
  { pattern: /\bcornet\b/i, base: 'Cornet', transposition: 'Bb', section: 'Brass' },
  { pattern: /\bbass[\s.-]?trombone\b/i, base: 'Bass Trombone', transposition: 'C', section: 'Brass' },
  { pattern: /\btrombone\b/i, base: 'Trombone', transposition: 'C', section: 'Brass' },
  { pattern: /\buphonium\b/i, base: 'Euphonium', transposition: 'C', section: 'Brass' },
  { pattern: /\beuphonium\b/i, base: 'Euphonium', transposition: 'C', section: 'Brass' },
  { pattern: /\bhornin\b|\bhorn\b/i, base: 'Horn', transposition: 'F', section: 'Brass' },
  { pattern: /\btuba\b/i, base: 'Tuba', transposition: 'C', section: 'Brass' },
  { pattern: /\bbaritone\b/i, base: 'Baritone', transposition: 'C', section: 'Brass' },
  // Percussion
  { pattern: /\btimpani\b/i, base: 'Timpani', transposition: 'C', section: 'Percussion' },
  { pattern: /\bsnare[\s.-]?drum\b/i, base: 'Snare Drum', transposition: 'C', section: 'Percussion' },
  { pattern: /\bbass[\s.-]?drum\b/i, base: 'Bass Drum', transposition: 'C', section: 'Percussion' },
  { pattern: /\bmarimba\b/i, base: 'Marimba', transposition: 'C', section: 'Percussion' },
  { pattern: /\bxylophone\b/i, base: 'Xylophone', transposition: 'C', section: 'Percussion' },
  { pattern: /\bvibraphone\b/i, base: 'Vibraphone', transposition: 'C', section: 'Percussion' },
  { pattern: /\bmallet\b/i, base: 'Mallet Percussion', transposition: 'C', section: 'Percussion' },
  { pattern: /\bpercussion\b/i, base: 'Percussion', transposition: 'C', section: 'Percussion' },
  // Strings
  { pattern: /\bviolin\b/i, base: 'Violin', transposition: 'C', section: 'Strings' },
  { pattern: /\bviola\b/i, base: 'Viola', transposition: 'C', section: 'Strings' },
  { pattern: /\bcello\b/i, base: 'Cello', transposition: 'C', section: 'Strings' },
  { pattern: /\bstring[\s.-]?bass\b/i, base: 'String Bass', transposition: 'C', section: 'Strings' },
  { pattern: /\bharp\b/i, base: 'Harp', transposition: 'C', section: 'Strings' },
  // Keyboard
  { pattern: /\bpiano\b/i, base: 'Piano', transposition: 'C', section: 'Keyboard' },
  { pattern: /\borgan\b/i, base: 'Organ', transposition: 'C', section: 'Keyboard' },
  // Score references
  { pattern: /\bconductor\b/i, base: 'Conductor Score', transposition: 'C', section: 'Score' },
  { pattern: /\bfull[\s.-]?score\b/i, base: 'Full Score', transposition: 'C', section: 'Score' },
  { pattern: /\bcondensed[\s.-]?score\b/i, base: 'Condensed Score', transposition: 'C', section: 'Score' },
];

/**
 * Normalise a raw instrument label from LLM or OCR output.
 * Extracts chair, canonical base instrument name, transposition, and section.
 */
export function normalizeInstrumentLabel(raw: string): NormalisedInstrument {
  const normalizedRaw = normalizeChairPhrases(raw);
  const chair = inferChair(normalizedRaw);
  const partType = inferPartType(normalizedRaw);

  for (const { pattern, base, transposition, section } of INSTRUMENT_MAPPINGS) {
    if (pattern.test(normalizedRaw)) {
      // If chair is in raw label, include it in instrument name
      const instrument = chair ? `${chair} ${base}` : base;
      return { instrument, chair, transposition, section, partType };
    }
  }

  // Fallback: return cleaned raw string
  return {
    instrument: normalizedRaw.trim() || 'Unknown',
    chair,
    transposition: 'C',
    section: 'Other',
    partType,
  };
}

// =============================================================================
// Display Name + Filename Builders
// =============================================================================

/**
 * Build a human-readable display name combining title and part.
 *
 * E.g. buildPartDisplayName("American Patrol", { instrument: "Bb Clarinet", chair: "1st" })
 *      → "American Patrol 1st Bb Clarinet"
 */
export function buildPartDisplayName(
  pieceTitle: string,
  part: Pick<NormalisedInstrument, 'instrument'>
): string {
  const title = pieceTitle.trim().replace(/\s+/g, ' ');
  const instrument = part.instrument.trim();
  return `${title} ${instrument}`.trim();
}

/**
 * Build a safe filesystem filename from a display name.
 *
 * E.g. "American Patrol 1st Bb Clarinet" → "American_Patrol_1st_Bb_Clarinet.pdf"
 */
export function buildPartFilename(displayName: string): string {
  return (
    displayName
      .trim()
      .replace(/[/\\:*?"<>|]/g, '') // remove filesystem-unsafe chars
      .replace(/\s+/g, '_')         // spaces → underscores
      .replace(/_{2,}/g, '_')       // collapse multiple underscores
      .slice(0, 200) +              // max 200 chars before extension
    '.pdf'
  );
}

/**
 * Build a storage-safe key segment (no spaces, limited chars).
 * Used for S3/MinIO object keys.
 */
export function buildPartStorageSlug(displayName: string): string {
  return displayName
    .trim()
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 150);
}
