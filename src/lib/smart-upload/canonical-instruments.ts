/**
 * Canonical Instruments — Single source of truth for instrument naming.
 *
 * Provides alias tables, family mappings, transposition data, and
 * OCR-error-tolerant matching for concert band instruments.
 * Extracted from part-naming.ts so that multiple modules can consume
 * canonical instrument data without circular imports.
 */

// =============================================================================
// Types
// =============================================================================

export type InstrumentSection =
  | 'Woodwinds'
  | 'Brass'
  | 'Percussion'
  | 'Strings'
  | 'Keyboard'
  | 'Vocals'
  | 'Score'
  | 'Other';

export type Transposition = 'C' | 'Bb' | 'Eb' | 'F' | 'G' | 'D' | 'A';

export type ChairDesignation = '1st' | '2nd' | '3rd' | '4th' | 'Aux' | 'Solo' | null;

export interface CanonicalInstrument {
  /** Canonical display name (e.g. "Bb Clarinet") */
  name: string;
  /** Concert-pitch transposition key */
  transposition: Transposition;
  /** Instrument family / section */
  section: InstrumentSection;
  /** Common aliases including OCR-error-tolerant variants */
  aliases: string[];
}

// =============================================================================
// Instrument Registry
// =============================================================================

/**
 * Master list of canonical concert band instruments with aliases.
 * Aliases are lowercase for case-insensitive matching.
 */
export const CANONICAL_INSTRUMENTS: readonly CanonicalInstrument[] = [
  // ── Woodwinds ───────────────────────────────────────────────────────
  {
    name: 'Piccolo',
    transposition: 'C',
    section: 'Woodwinds',
    aliases: ['piccolo', 'picc', 'picc.'],
  },
  {
    name: 'Flute',
    transposition: 'C',
    section: 'Woodwinds',
    aliases: ['flute', 'fl', 'fl.', 'flauto', 'flöte', 'fiute', 'f1ute'],
  },
  {
    name: 'Oboe',
    transposition: 'C',
    section: 'Woodwinds',
    aliases: ['oboe', 'ob', 'ob.', 'hautbois'],
  },
  {
    name: 'English Horn',
    transposition: 'F',
    section: 'Woodwinds',
    aliases: ['english horn', 'cor anglais', 'eng horn', 'eng. horn', 'english hn'],
  },
  {
    name: 'Eb Clarinet',
    transposition: 'Eb',
    section: 'Woodwinds',
    aliases: [
      'eb clarinet', 'e-flat clarinet', 'e♭ clarinet', 'clarinet in eb',
      'clarinet in e-flat', 'e flat clarinet',
    ],
  },
  {
    name: 'Bb Clarinet',
    transposition: 'Bb',
    section: 'Woodwinds',
    aliases: [
      'clarinet', 'bb clarinet', 'b-flat clarinet', 'b♭ clarinet',
      'clarinet in bb', 'clarinet in b-flat', 'clar', 'clar.', 'cl',
      'cl.', 'clarinette', 'klarinette', 'c1arinet', 'clarinat',
    ],
  },
  {
    name: 'Alto Clarinet',
    transposition: 'Eb',
    section: 'Woodwinds',
    aliases: ['alto clarinet', 'alto clar', 'alto cl', 'alto cl.'],
  },
  {
    name: 'Bass Clarinet',
    transposition: 'Bb',
    section: 'Woodwinds',
    aliases: [
      'bass clarinet', 'bass clar', 'bass cl', 'bass cl.',
      'b. cl.', 'bcl', 'bcl.',
    ],
  },
  {
    name: 'Contrabass Clarinet',
    transposition: 'Bb',
    section: 'Woodwinds',
    aliases: ['contrabass clarinet', 'contra bass clarinet', 'contrabass clar'],
  },
  {
    name: 'Bassoon',
    transposition: 'C',
    section: 'Woodwinds',
    aliases: ['bassoon', 'bsn', 'bsn.', 'fagott', 'basson', 'bass0on'],
  },
  {
    name: 'Contrabassoon',
    transposition: 'C',
    section: 'Woodwinds',
    aliases: ['contrabassoon', 'contra bassoon', 'contrafagott'],
  },
  {
    name: 'Soprano Saxophone',
    transposition: 'Bb',
    section: 'Woodwinds',
    aliases: ['soprano saxophone', 'soprano sax', 'sop sax', 'sop. sax', 's. sax'],
  },
  {
    name: 'Alto Saxophone',
    transposition: 'Eb',
    section: 'Woodwinds',
    aliases: [
      'alto saxophone', 'alto sax', 'a. sax', 'alt sax', 'alto saxaphone',
      'a1to sax', 'aito saxophone',
    ],
  },
  {
    name: 'Tenor Saxophone',
    transposition: 'Bb',
    section: 'Woodwinds',
    aliases: [
      'tenor saxophone', 'tenor sax', 't. sax', 'ten sax', 'ten. sax',
      'tenor saxaphone',
    ],
  },
  {
    name: 'Baritone Saxophone',
    transposition: 'Eb',
    section: 'Woodwinds',
    aliases: [
      'baritone saxophone', 'baritone sax', 'bari sax', 'bari. sax',
      'bar sax', 'bar. sax', 'b. sax',
    ],
  },

  // ── Brass ───────────────────────────────────────────────────────────
  {
    name: 'Trumpet',
    transposition: 'Bb',
    section: 'Brass',
    aliases: [
      'trumpet', 'tpt', 'tpt.', 'trp', 'trp.', 'trompete', 'trompette',
      'tp', 'tp.', 'tnimpet', 'tmmpet',
    ],
  },
  {
    name: 'Cornet',
    transposition: 'Bb',
    section: 'Brass',
    aliases: ['cornet', 'cor', 'cor.', 'cnt', 'cnt.', 'cornett'],
  },
  {
    name: 'Flugelhorn',
    transposition: 'Bb',
    section: 'Brass',
    aliases: ['flugelhorn', 'flugel', 'flugel horn', 'flügelhorn', 'fluegel'],
  },
  {
    name: 'Horn',
    transposition: 'F',
    section: 'Brass',
    aliases: [
      'horn', 'french horn', 'f horn', 'hn', 'hn.', 'horn in f', 'cor',
      'hom', 'h0rn',
    ],
  },
  {
    name: 'Trombone',
    transposition: 'C',
    section: 'Brass',
    aliases: ['trombone', 'trb', 'trb.', 'tbn', 'tbn.', 'posaune', 'tr0mbone'],
  },
  {
    name: 'Bass Trombone',
    transposition: 'C',
    section: 'Brass',
    aliases: ['bass trombone', 'bass trb', 'bass trb.', 'b. trb', 'b. trb.'],
  },
  {
    name: 'Euphonium',
    transposition: 'C',
    section: 'Brass',
    aliases: [
      'euphonium', 'euph', 'euph.', 'euphonlum', 'uphonium',
      'baritone tc', 'baritone bc',
    ],
  },
  {
    name: 'Baritone',
    transposition: 'C',
    section: 'Brass',
    aliases: ['baritone', 'bar', 'bar.', 'baritone horn'],
  },
  {
    name: 'Tuba',
    transposition: 'C',
    section: 'Brass',
    aliases: ['tuba', 'tb', 'tb.', 'bass tuba', 'concert tuba'],
  },

  // ── Percussion ──────────────────────────────────────────────────────
  {
    name: 'Timpani',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['timpani', 'timp', 'timp.', 'kettledrum', 'kettledrums', 'tlmpani'],
  },
  {
    name: 'Snare Drum',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['snare drum', 'snare', 'sd', 's.d.', 'sd.', 'side drum'],
  },
  {
    name: 'Bass Drum',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['bass drum', 'bd', 'b.d.', 'bd.', 'gran cassa'],
  },
  {
    name: 'Cymbals',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['cymbals', 'cym', 'cym.', 'crash cymbals', 'suspended cymbal'],
  },
  {
    name: 'Bells',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['bells', 'orchestra bells', 'glockenspiel', 'glock', 'glock.'],
  },
  {
    name: 'Xylophone',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['xylophone', 'xyl', 'xyl.', 'xylo'],
  },
  {
    name: 'Vibraphone',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['vibraphone', 'vib', 'vib.', 'vibes'],
  },
  {
    name: 'Marimba',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['marimba', 'mar', 'mar.'],
  },
  {
    name: 'Chimes',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['chimes', 'tubular bells', 'tubular chimes'],
  },
  {
    name: 'Mallet Percussion',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['mallet percussion', 'mallet perc', 'mallets', 'mallet'],
  },
  {
    name: 'Percussion',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['percussion', 'perc', 'perc.', 'auxiliary percussion', 'aux perc'],
  },
  {
    name: 'Triangle',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['triangle', 'tri', 'tri.'],
  },
  {
    name: 'Tambourine',
    transposition: 'C',
    section: 'Percussion',
    aliases: ['tambourine', 'tamb', 'tamb.'],
  },

  // ── Strings ─────────────────────────────────────────────────────────
  {
    name: 'Violin',
    transposition: 'C',
    section: 'Strings',
    aliases: ['violin', 'vln', 'vln.', 'vn', 'vn.', 'violine'],
  },
  {
    name: 'Viola',
    transposition: 'C',
    section: 'Strings',
    aliases: ['viola', 'vla', 'vla.', 'va', 'va.'],
  },
  {
    name: 'Cello',
    transposition: 'C',
    section: 'Strings',
    aliases: ['cello', 'vc', 'vc.', 'vcl', 'violoncello'],
  },
  {
    name: 'String Bass',
    transposition: 'C',
    section: 'Strings',
    aliases: ['string bass', 'double bass', 'contrabass', 'bass', 'cb', 'cb.', 'kb'],
  },
  {
    name: 'Harp',
    transposition: 'C',
    section: 'Strings',
    aliases: ['harp', 'hp', 'hp.'],
  },

  // ── Keyboard ────────────────────────────────────────────────────────
  {
    name: 'Piano',
    transposition: 'C',
    section: 'Keyboard',
    aliases: ['piano', 'pno', 'pno.', 'pf', 'pf.', 'pianoforte'],
  },
  {
    name: 'Organ',
    transposition: 'C',
    section: 'Keyboard',
    aliases: ['organ', 'org', 'org.'],
  },
  {
    name: 'Celesta',
    transposition: 'C',
    section: 'Keyboard',
    aliases: ['celesta', 'celeste'],
  },

  // ── Score types ─────────────────────────────────────────────────────
  {
    name: 'Full Score',
    transposition: 'C',
    section: 'Score',
    aliases: ['full score', 'score', 'conductor score', 'conductor', 'partitur'],
  },
  {
    name: 'Condensed Score',
    transposition: 'C',
    section: 'Score',
    aliases: ['condensed score', 'condensed', 'reduced score'],
  },
] as const;

// =============================================================================
// Lookup Index (built once)
// =============================================================================

interface AliasLookupEntry {
  instrument: CanonicalInstrument;
  aliasIndex: number;
}

/** Map of lowercase alias → canonical instrument. First match wins. */
const ALIAS_INDEX: Map<string, AliasLookupEntry> = new Map();

for (const instrument of CANONICAL_INSTRUMENTS) {
  for (let i = 0; i < instrument.aliases.length; i++) {
    const alias = instrument.aliases[i];
    if (!ALIAS_INDEX.has(alias)) {
      ALIAS_INDEX.set(alias, { instrument, aliasIndex: i });
    }
  }
}

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Find a canonical instrument by exact alias match.
 * Returns null if no match.
 */
export function findByAlias(alias: string): CanonicalInstrument | null {
  const entry = ALIAS_INDEX.get(alias.toLowerCase().trim());
  return entry?.instrument ?? null;
}

/**
 * Find a canonical instrument by fuzzy substring matching against aliases.
 * Tries exact alias match first, then substring containment.
 * Returns the best match or null.
 */
export function findByFuzzyMatch(input: string): CanonicalInstrument | null {
  const lower = input.toLowerCase().trim();

  // 1. Exact alias match
  const exact = findByAlias(lower);
  if (exact) return exact;

  // 2. Substring match — find longest alias that appears in input
  let bestMatch: CanonicalInstrument | null = null;
  let bestLength = 0;

  for (const instrument of CANONICAL_INSTRUMENTS) {
    for (const alias of instrument.aliases) {
      if (lower.includes(alias) && alias.length > bestLength) {
        bestMatch = instrument;
        bestLength = alias.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Get the canonical instrument section for a raw label.
 */
export function getSectionForLabel(label: string): InstrumentSection {
  const match = findByFuzzyMatch(label);
  return match?.section ?? 'Other';
}

/**
 * Get the canonical transposition for a raw label.
 */
export function getTranspositionForLabel(label: string): Transposition {
  const match = findByFuzzyMatch(label);
  return match?.transposition ?? 'C';
}

/**
 * Get all instruments in a given section.
 */
export function getInstrumentsBySection(section: InstrumentSection): CanonicalInstrument[] {
  return CANONICAL_INSTRUMENTS.filter((i) => i.section === section);
}

/**
 * Get all known section names.
 */
export function getAllSections(): InstrumentSection[] {
  return ['Woodwinds', 'Brass', 'Percussion', 'Strings', 'Keyboard', 'Vocals', 'Score', 'Other'];
}
