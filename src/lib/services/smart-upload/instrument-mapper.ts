/**
 * Instrument Mapper Service
 *
 * Maps LLM-extracted instrument names to existing Instrument rows in the database.
 * Uses fuzzy matching to handle variations in instrument naming.
 */

import { prisma } from '@/lib/db';
import type { Instrument } from '@prisma/client';
import type { ClassifiedPart } from './smart-upload.types';

// =============================================================================
// Types
// =============================================================================

export interface InstrumentMatch {
  instrumentId: string;
  instrumentName: string;
  confidence: number;
  normalizedInput: string;
}

// =============================================================================
// Instrument Name Normalization
// =============================================================================

/**
 * Common instrument name mappings and variations
 * Maps various spellings/abbreviations to normalized forms
 */
const INSTRUMENT_ALIASES: Record<string, string[]> = {
  // Woodwinds
  flute: ['fl', 'flt', 'piccolo', 'picc'],
  clarinet: ['cl', 'clar', 'b-flat clarinet', 'bb clarinet', 'bbc', 'clari'],
  oboe: ['ob', 'oboe/english horn'],
  bassoon: ['bsn', 'bassoon/contrabassoon'],
  saxophone: ['sax', 'saxophone', 'alto sax', 'tenor sax', 'baritone sax', 'bari sax', 'soprano sax'],
  'alto saxophone': ['asax', 'alto sax', 'altsax'],
  'tenor saxophone': ['tsax', 'tenor sax', 'tenorsax'],
  'baritone saxophone': ['bsax', 'bari sax', 'baritone sax', 'barisax'],

  // Brass
  trumpet: ['tpt', 'trumpet/cornet', 'cornet', 'flugelhorn', 'flh'],
  horn: ['hn', 'french horn', 'horn in f', 'f horn'],
  trombone: ['tbn', 'tenor trombone', 'bass trombone'],
  'bass trombone': ['btbn', 'bass trmb'],
  tuba: ['tba', 'euphonium', 'euph', 'baritone'],

  // Percussion
  percussion: ['perc', 'drums', 'drumset', 'drum set', 'timpani', 'timp', 'mallets', 'keyboard percussion'],
  drums: ['percussion', 'battery', 'drumline'],
  timpani: ['timp', 'kettle drums'],
  mallets: ['vibraphone', 'marimba', 'xylophone', 'glockenspiel'],

  // Strings
  violin: ['vln', 'violin i', 'violin ii', 'first violin', 'second violin'],
  viola: ['vla', 'viola/cello'],
  cello: ['vc', 'cello/bass'],
  bass: ['string bass', 'double bass', 'contrabass', 'acoustic bass'],

  // Piano/Guitar
  piano: ['piano/celesta', 'celesta', 'keyboard'],
  guitar: ['gtr', 'acoustic guitar', 'electric guitar', 'classical guitar'],

  // Voice
  voice: ['vocal', 'soprano', 'alto', 'tenor', 'baritone', 'bass voice'],
  soprano: ['sop', 'soprano voice'],
  alto: ['alt', 'alto voice'],
  tenor: ['ten', 'tenor voice'],
  baritone: ['bar', 'baritone voice'],
};

/**
 * Normalize an instrument name for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Apply common aliases
 */
export function normalizeInstrumentName(name: string): string {
  if (!name) return '';

  // Lowercase and trim
  let normalized = name.toLowerCase().trim();

  // Remove common descriptors that don't affect instrument identity
  const removePatterns = [
    /\s+in\s+[a-g][#b]?\s*/gi, // "in Bb", "in F", etc.
    /\s*\(.*?\)\s*/g, // parenthetical content
    /\s*\[.*?\]\s*/g, // bracketed content
    /\s+/g, // multiple whitespace
  ];

  for (const pattern of removePatterns) {
    normalized = normalized.replace(pattern, ' ');
  }

  normalized = normalized.trim();

  // Check for direct alias match first
  for (const [canonical, aliases] of Object.entries(INSTRUMENT_ALIASES)) {
    if (aliases.includes(normalized) || normalized === canonical) {
      return canonical;
    }
  }

  return normalized;
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length) return 0;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * Check if input contains key instrument family keywords
 */
function getFamilyMatch(input: string, instrumentFamily: string): number {
  const familyKeywords: Record<string, string[]> = {
    woodwind: ['flute', 'clarinet', 'oboe', 'bassoon', 'saxophone', 'sax', 'reed'],
    brass: ['trumpet', 'horn', 'trombone', 'tuba', 'cornet', 'flugelhorn', 'euphonium'],
    percussion: ['percussion', 'drums', 'drum', 'timpani', 'mallets', 'vibraphone', 'marimba'],
    strings: ['violin', 'viola', 'cello', 'bass', 'string'],
    piano: ['piano', 'keyboard'],
    guitar: ['guitar', 'gtr'],
  };

  const keywords = familyKeywords[instrumentFamily.toLowerCase()] || [];
  for (const keyword of keywords) {
    if (input.includes(keyword)) {
      return 0.3; // Family match bonus
    }
  }

  return 0;
}

/**
 * Fuzzy match an instrument name against available instruments in the database
 */
export function fuzzyMatchInstrument(
  name: string,
  instruments: Instrument[]
): InstrumentMatch | null {
  if (!name || !instruments || instruments.length === 0) {
    return null;
  }

  const normalizedInput = normalizeInstrumentName(name);
  if (!normalizedInput) {
    return null;
  }

  let bestMatch: InstrumentMatch | null = null;
  let bestScore = 0;

  for (const instrument of instruments) {
    const normalizedDbName = normalizeInstrumentName(instrument.name);

    // Exact match (after normalization)
    if (normalizedInput === normalizedDbName) {
      return {
        instrumentId: instrument.id,
        instrumentName: instrument.name,
        confidence: 1.0,
        normalizedInput,
      };
    }

    // Check aliases for exact match
    const aliases = INSTRUMENT_ALIASES[normalizedDbName] || [];
    if (aliases.includes(normalizedInput)) {
      return {
        instrumentId: instrument.id,
        instrumentName: instrument.name,
        confidence: 0.95,
        normalizedInput,
      };
    }

    // Calculate similarity score
    const similarity = calculateSimilarity(normalizedInput, normalizedDbName);

    // Family bonus
    const familyBonus = getFamilyMatch(normalizedInput, instrument.family);

    // Combined score
    const score = Math.min(0.9, similarity + familyBonus);

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = {
        instrumentId: instrument.id,
        instrumentName: instrument.name,
        confidence: Math.round(score * 100) / 100,
        normalizedInput,
      };
    }
  }

  return bestMatch;
}

// =============================================================================
// Batch Instrument Mapping
// =============================================================================

/**
 * Map multiple classified parts to database instruments
 * Fetches all instruments once and reuses for efficiency
 */
export async function mapInstrumentsToDb(
  extractedParts: ClassifiedPart[]
): Promise<InstrumentMatch[]> {
  if (!extractedParts || extractedParts.length === 0) {
    return [];
  }

  // Fetch all instruments from database
  const instruments = await prisma.instrument.findMany({
    orderBy: [{ family: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  if (instruments.length === 0) {
    console.warn('No instruments found in database for mapping');
    return [];
  }

  const results: InstrumentMatch[] = [];
  const seenInstrumentIds = new Set<string>();

  for (const part of extractedParts) {
    const match = fuzzyMatchInstrument(part.instrument, instruments);

    if (match && !seenInstrumentIds.has(match.instrumentId)) {
      results.push(match);
      seenInstrumentIds.add(match.instrumentId);
    } else if (match && seenInstrumentIds.has(match.instrumentId)) {
      // Same instrument already matched, just update confidence based on part confidence
      const existing = results.find(r => r.instrumentId === match.instrumentId);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, match.confidence);
      }
    }
  }

  return results;
}

/**
 * Map a single instrument name to a database instrument
 * Convenience function for single lookups
 */
export async function mapSingleInstrument(
  instrumentName: string
): Promise<InstrumentMatch | null> {
  const instruments = await prisma.instrument.findMany({
    orderBy: [{ family: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return fuzzyMatchInstrument(instrumentName, instruments);
}

/**
 * Get all available instruments from the database
 * Useful for UI display or caching
 */
export async function getAllInstruments(): Promise<Instrument[]> {
  return prisma.instrument.findMany({
    orderBy: [{ family: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Get instruments grouped by family
 */
export async function getInstrumentsByFamily(): Promise<Record<string, Instrument[]>> {
  const instruments = await getAllInstruments();

  const grouped: Record<string, Instrument[]> = {};
  for (const instrument of instruments) {
    if (!grouped[instrument.family]) {
      grouped[instrument.family] = [];
    }
    grouped[instrument.family].push(instrument);
  }

  return grouped;
}
