/**
 * Instrument Normalization Tests
 *
 * Comprehensive tests for instrument label normalization covering:
 * - Canonical instrument name mapping
 * - Transposition extraction (Bb, Eb, F, etc.)
 * - Chair/position extraction (1st, 2nd, Solo, Aux)
 * - Section classification (Woodwinds, Brass, Percussion, etc.)
 * - Common misspellings correction
 * - Abbreviation expansion
 * - OCR error tolerance
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeInstrumentLabel,
  buildPartDisplayName,
  buildPartFilename,
  buildPartStorageSlug,
} from '../part-naming';

// =============================================================================
// Canonical Instrument Name Tests
// =============================================================================

describe('normalizeInstrumentLabel - Woodwind Instruments', () => {
  describe('Piccolo', () => {
    it('identifies Piccolo', () => {
      const result = normalizeInstrumentLabel('Piccolo');
      expect(result.instrument).toBe('Piccolo');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('C');
      expect(result.chair).toBeNull();
    });

    it('identifies Piccolo from abbreviation', () => {
      const result = normalizeInstrumentLabel('Picc');
      expect(result.instrument).toBe('Piccolo');
    });

    it('identifies Piccolo with chair', () => {
      const result = normalizeInstrumentLabel('1st Piccolo');
      expect(result.instrument).toBe('1st Piccolo');
      expect(result.chair).toBe('1st');
    });
  });

  describe('Flute', () => {
    it('identifies Flute', () => {
      const result = normalizeInstrumentLabel('Flute');
      expect(result.instrument).toBe('Flute');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('C');
    });

    it('identifies Flute from abbreviation', () => {
      const result = normalizeInstrumentLabel('Fl');
      expect(result.instrument).toBe('Flute');
    });

    it('identifies Flute with period abbreviation', () => {
      const result = normalizeInstrumentLabel('Fl.');
      expect(result.instrument).toBe('Flute');
    });

    it('identifies Flute with Roman numeral chair', () => {
      const result = normalizeInstrumentLabel('Flute I');
      expect(result.instrument).toBe('1st Flute');
      expect(result.chair).toBe('1st');
    });

    it('identifies Flute from German spelling', () => {
      const result = normalizeInstrumentLabel('Flöte');
      expect(result.instrument).toBe('Flute');
    });

    it('handles OCR error "f1ute"', () => {
      const result = normalizeInstrumentLabel('f1ute');
      expect(result.instrument).toBe('Flute');
    });
  });

  describe('Clarinet Family', () => {
    it('identifies Bb Clarinet', () => {
      const result = normalizeInstrumentLabel('Bb Clarinet');
      expect(result.instrument).toBe('Bb Clarinet');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Bb Clarinet from various formats', () => {
      expect(normalizeInstrumentLabel('B-flat Clarinet').instrument).toBe('Bb Clarinet');
      expect(normalizeInstrumentLabel('B♭ Clarinet').instrument).toBe('Bb Clarinet');
      expect(normalizeInstrumentLabel('Clarinet in Bb').instrument).toBe('Bb Clarinet');
      expect(normalizeInstrumentLabel('Clarinet').instrument).toBe('Bb Clarinet'); // Default
    });

    it('identifies Eb Clarinet', () => {
      expect(normalizeInstrumentLabel('Eb Clarinet').instrument).toBe('Eb Clarinet');
      expect(normalizeInstrumentLabel('E-flat Clarinet').instrument).toBe('Eb Clarinet');
      expect(normalizeInstrumentLabel('E♭ Clarinet').instrument).toBe('Eb Clarinet');
    });

    it('identifies Alto Clarinet', () => {
      const result = normalizeInstrumentLabel('Alto Clarinet');
      expect(result.instrument).toBe('Alto Clarinet');
      expect(result.transposition).toBe('Eb');
    });

    it('identifies Bass Clarinet', () => {
      const result = normalizeInstrumentLabel('Bass Clarinet');
      expect(result.instrument).toBe('Bass Clarinet');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Bass Clarinet from abbreviation', () => {
      expect(normalizeInstrumentLabel('B. Cl.').instrument).toBe('Bass Clarinet');
      expect(normalizeInstrumentLabel('BCL').instrument).toBe('Bass Clarinet');
    });

    it('identifies Contrabass Clarinet', () => {
      const result = normalizeInstrumentLabel('Contrabass Clarinet');
      expect(result.instrument).toBe('Contrabass Clarinet');
    });

    it('handles chair position with clarinet', () => {
      const result = normalizeInstrumentLabel('1st Bb Clarinet');
      expect(result.instrument).toBe('1st Bb Clarinet');
      expect(result.chair).toBe('1st');
    });

    it('handles chair position after instrument name', () => {
      const result = normalizeInstrumentLabel('Bb Clarinet 1');
      expect(result.instrument).toBe('1st Bb Clarinet');
      expect(result.chair).toBe('1st');
    });

    it('handles "Clarinet in Bb I" format', () => {
      const result = normalizeInstrumentLabel('Clarinet in Bb I');
      expect(result.instrument).toBe('1st Bb Clarinet');
      expect(result.chair).toBe('1st');
    });

    it('handles OCR error "c1arinet"', () => {
      const result = normalizeInstrumentLabel('c1arinet');
      expect(result.instrument).toBe('Bb Clarinet');
    });

    it('handles OCR error "clarinat"', () => {
      const result = normalizeInstrumentLabel('clarinat');
      expect(result.instrument).toBe('Bb Clarinet');
    });
  });

  describe('Oboe Family', () => {
    it('identifies Oboe', () => {
      const result = normalizeInstrumentLabel('Oboe');
      expect(result.instrument).toBe('Oboe');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('C');
    });

    it('identifies Oboe from abbreviation', () => {
      expect(normalizeInstrumentLabel('Ob').instrument).toBe('Oboe');
      expect(normalizeInstrumentLabel('Ob.').instrument).toBe('Oboe');
    });

    it('identifies English Horn', () => {
      const result = normalizeInstrumentLabel('English Horn');
      expect(result.instrument).toBe('English Horn');
      expect(result.transposition).toBe('F');
    });

    it('identifies English Horn from French name', () => {
      const result = normalizeInstrumentLabel('Cor Anglais');
      expect(result.instrument).toBe('English Horn');
    });
  });

  describe('Bassoon Family', () => {
    it('identifies Bassoon', () => {
      const result = normalizeInstrumentLabel('Bassoon');
      expect(result.instrument).toBe('Bassoon');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('C');
    });

    it('identifies Bassoon from abbreviation', () => {
      expect(normalizeInstrumentLabel('Bsn').instrument).toBe('Bassoon');
      expect(normalizeInstrumentLabel('Bsn.').instrument).toBe('Bassoon');
    });

    it('identifies Bassoon from German name', () => {
      expect(normalizeInstrumentLabel('Fagott').instrument).toBe('Bassoon');
    });

    it('identifies Contrabassoon', () => {
      const result = normalizeInstrumentLabel('Contrabassoon');
      expect(result.instrument).toBe('Contrabassoon');
    });

    it('handles OCR error "bass0on"', () => {
      const result = normalizeInstrumentLabel('bass0on');
      expect(result.instrument).toBe('Bassoon');
    });
  });

  describe('Saxophone Family', () => {
    it('identifies Soprano Saxophone', () => {
      const result = normalizeInstrumentLabel('Soprano Saxophone');
      expect(result.instrument).toBe('Soprano Saxophone');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Soprano Sax from abbreviation', () => {
      expect(normalizeInstrumentLabel('Sop. Sax').instrument).toBe('Soprano Saxophone');
      expect(normalizeInstrumentLabel('S. Sax').instrument).toBe('Soprano Saxophone');
    });

    it('identifies Alto Saxophone', () => {
      const result = normalizeInstrumentLabel('Alto Saxophone');
      expect(result.instrument).toBe('Alto Saxophone');
      expect(result.section).toBe('Woodwinds');
      expect(result.transposition).toBe('Eb');
    });

    it('identifies Alto Sax from abbreviation', () => {
      expect(normalizeInstrumentLabel('Alto Sax').instrument).toBe('Alto Saxophone');
      expect(normalizeInstrumentLabel('A. Sax').instrument).toBe('Alto Saxophone');
    });

    it('handles OCR error "a1to sax"', () => {
      const result = normalizeInstrumentLabel('a1to sax');
      expect(result.instrument).toBe('Alto Saxophone');
    });

    it('handles OCR error "aito saxophone"', () => {
      const result = normalizeInstrumentLabel('aito saxophone');
      expect(result.instrument).toBe('Alto Saxophone');
    });

    it('identifies Tenor Saxophone', () => {
      const result = normalizeInstrumentLabel('Tenor Saxophone');
      expect(result.instrument).toBe('Tenor Saxophone');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Tenor Sax from abbreviation', () => {
      expect(normalizeInstrumentLabel('Ten. Sax').instrument).toBe('Tenor Saxophone');
      expect(normalizeInstrumentLabel('T. Sax').instrument).toBe('Tenor Saxophone');
    });

    it('identifies Baritone Saxophone', () => {
      const result = normalizeInstrumentLabel('Baritone Saxophone');
      expect(result.instrument).toBe('Baritone Saxophone');
      expect(result.transposition).toBe('Eb');
    });

    it('identifies Baritone Sax from abbreviation', () => {
      expect(normalizeInstrumentLabel('Bari Sax').instrument).toBe('Baritone Saxophone');
      expect(normalizeInstrumentLabel('B. Sax').instrument).toBe('Baritone Saxophone');
    });
  });
});

describe('normalizeInstrumentLabel - Brass Instruments', () => {
  describe('Trumpet', () => {
    it('identifies Trumpet', () => {
      const result = normalizeInstrumentLabel('Trumpet');
      expect(result.instrument).toBe('Trumpet');
      expect(result.section).toBe('Brass');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Trumpet from abbreviation', () => {
      expect(normalizeInstrumentLabel('Tpt').instrument).toBe('Trumpet');
      expect(normalizeInstrumentLabel('Tpt.').instrument).toBe('Trumpet');
      expect(normalizeInstrumentLabel('Trp').instrument).toBe('Trumpet');
    });

    it('handles chair position', () => {
      const result = normalizeInstrumentLabel('1st Trumpet');
      expect(result.instrument).toBe('1st Trumpet');
      expect(result.chair).toBe('1st');
    });

    it('handles OCR error "tnimpet"', () => {
      const result = normalizeInstrumentLabel('tnimpet');
      expect(result.instrument).toBe('Trumpet');
    });
  });

  describe('Cornet', () => {
    it('identifies Cornet', () => {
      const result = normalizeInstrumentLabel('Cornet');
      expect(result.instrument).toBe('Cornet');
      expect(result.transposition).toBe('Bb');
    });

    it('handles Solo Cornet', () => {
      const result = normalizeInstrumentLabel('Solo Cornet');
      expect(result.instrument).toBe('Solo Cornet');
      expect(result.chair).toBe('Solo');
    });
  });

  describe('Flugelhorn', () => {
    it('identifies Flugelhorn', () => {
      const result = normalizeInstrumentLabel('Flugelhorn');
      expect(result.instrument).toBe('Flugelhorn');
      expect(result.transposition).toBe('Bb');
    });

    it('identifies Flugelhorn variants', () => {
      expect(normalizeInstrumentLabel('Flugel').instrument).toBe('Flugelhorn');
      expect(normalizeInstrumentLabel('Flugel Horn').instrument).toBe('Flugelhorn');
      expect(normalizeInstrumentLabel('Flügelhorn').instrument).toBe('Flugelhorn');
    });
  });

  describe('Horn/French Horn', () => {
    it('identifies Horn', () => {
      const result = normalizeInstrumentLabel('Horn');
      expect(result.instrument).toBe('Horn');
      expect(result.transposition).toBe('F');
    });

    it('identifies French Horn', () => {
      const result = normalizeInstrumentLabel('French Horn');
      expect(result.instrument).toBe('Horn');
    });

    it('identifies Horn from abbreviation', () => {
      expect(normalizeInstrumentLabel('Hn').instrument).toBe('Horn');
      expect(normalizeInstrumentLabel('Hn.').instrument).toBe('Horn');
    });

    it('handles F Horn notation', () => {
      const result = normalizeInstrumentLabel('F Horn');
      expect(result.instrument).toBe('Horn');
      expect(result.transposition).toBe('F');
    });

    it('handles chair positions with Roman numerals', () => {
      const result = normalizeInstrumentLabel('Horn I');
      expect(result.instrument).toBe('1st Horn');
      expect(result.chair).toBe('1st');
    });

    it('handles OCR error "h0rn"', () => {
      const result = normalizeInstrumentLabel('h0rn');
      expect(result.instrument).toBe('Horn');
    });
  });

  describe('Trombone', () => {
    it('identifies Trombone', () => {
      const result = normalizeInstrumentLabel('Trombone');
      expect(result.instrument).toBe('Trombone');
      expect(result.transposition).toBe('C');
    });

    it('identifies Trombone from abbreviation', () => {
      expect(normalizeInstrumentLabel('Trb').instrument).toBe('Trombone');
      expect(normalizeInstrumentLabel('Tbn').instrument).toBe('Trombone');
    });

    it('identifies Bass Trombone', () => {
      const result = normalizeInstrumentLabel('Bass Trombone');
      expect(result.instrument).toBe('Bass Trombone');
    });

    it('handles chair position', () => {
      const result = normalizeInstrumentLabel('1st Trombone');
      expect(result.instrument).toBe('1st Trombone');
      expect(result.chair).toBe('1st');
    });

    it('handles OCR error "tr0mbone"', () => {
      const result = normalizeInstrumentLabel('tr0mbone');
      expect(result.instrument).toBe('Trombone');
    });
  });

  describe('Euphonium', () => {
    it('identifies Euphonium', () => {
      const result = normalizeInstrumentLabel('Euphonium');
      expect(result.instrument).toBe('Euphonium');
      expect(result.transposition).toBe('C');
    });

    it('identifies Euphonium from abbreviation', () => {
      expect(normalizeInstrumentLabel('Euph').instrument).toBe('Euphonium');
    });

    it('handles OCR error "euphonlum"', () => {
      const result = normalizeInstrumentLabel('euphonlum');
      expect(result.instrument).toBe('Euphonium');
    });
  });

  describe('Baritone', () => {
    it('identifies Baritone', () => {
      const result = normalizeInstrumentLabel('Baritone');
      expect(result.instrument).toBe('Baritone');
      expect(result.transposition).toBe('C');
    });

    it('identifies Baritone from abbreviation', () => {
      expect(normalizeInstrumentLabel('Bar').instrument).toBe('Baritone');
    });
  });

  describe('Tuba', () => {
    it('identifies Tuba', () => {
      const result = normalizeInstrumentLabel('Tuba');
      expect(result.instrument).toBe('Tuba');
      expect(result.transposition).toBe('C');
    });

    it('identifies Tuba from abbreviation', () => {
      expect(normalizeInstrumentLabel('Tb').instrument).toBe('Tuba');
    });
  });
});

describe('normalizeInstrumentLabel - Percussion Instruments', () => {
  it('identifies Timpani', () => {
    const result = normalizeInstrumentLabel('Timpani');
    expect(result.instrument).toBe('Timpani');
    expect(result.section).toBe('Percussion');
  });

  it('identifies Timpani from abbreviation', () => {
    expect(normalizeInstrumentLabel('Timp').instrument).toBe('Timpani');
  });

  it('handles OCR error "tlmpani"', () => {
    const result = normalizeInstrumentLabel('tlmpani');
    expect(result.instrument).toBe('Timpani');
  });

  it('identifies Snare Drum', () => {
    const result = normalizeInstrumentLabel('Snare Drum');
    expect(result.instrument).toBe('Snare Drum');
  });

  it('identifies Snare Drum from abbreviation', () => {
    expect(normalizeInstrumentLabel('SD').instrument).toBe('Snare Drum');
    expect(normalizeInstrumentLabel('S.D.').instrument).toBe('Snare Drum');
  });

  it('identifies Bass Drum', () => {
    const result = normalizeInstrumentLabel('Bass Drum');
    expect(result.instrument).toBe('Bass Drum');
  });

  it('identifies Cymbals', () => {
    const result = normalizeInstrumentLabel('Cymbals');
    expect(result.instrument).toBe('Cymbals');
  });

  it('identifies Bells/Glockenspiel', () => {
    expect(normalizeInstrumentLabel('Bells').instrument).toBe('Bells');
    expect(normalizeInstrumentLabel('Glockenspiel').instrument).toBe('Bells');
  });

  it('identifies Xylophone', () => {
    const result = normalizeInstrumentLabel('Xylophone');
    expect(result.instrument).toBe('Xylophone');
  });

  it('identifies Marimba', () => {
    const result = normalizeInstrumentLabel('Marimba');
    expect(result.instrument).toBe('Marimba');
  });

  it('identifies Vibraphone', () => {
    const result = normalizeInstrumentLabel('Vibraphone');
    expect(result.instrument).toBe('Vibraphone');
  });

  it('identifies Chimes', () => {
    expect(normalizeInstrumentLabel('Chimes').instrument).toBe('Chimes');
    expect(normalizeInstrumentLabel('Tubular Bells').instrument).toBe('Chimes');
  });

  it('identifies Triangle', () => {
    const result = normalizeInstrumentLabel('Triangle');
    expect(result.instrument).toBe('Triangle');
  });

  it('identifies Tambourine', () => {
    const result = normalizeInstrumentLabel('Tambourine');
    expect(result.instrument).toBe('Tambourine');
  });

  it('identifies Auxiliary Percussion', () => {
    // "Auxiliary Percussion" matches "aux perc" alias via substring matching
    // The "Aux" prefix is also extracted as a chair
    // Result is "Aux Percussion" (Aux chair + Percussion canonical name)
    expect(normalizeInstrumentLabel('Auxiliary Percussion').instrument).toBe('Aux Percussion');
    expect(normalizeInstrumentLabel('Aux Perc').instrument).toBe('Aux Percussion');
  });
});

describe('normalizeInstrumentLabel - String Instruments', () => {
  it('identifies Violin', () => {
    const result = normalizeInstrumentLabel('Violin');
    expect(result.instrument).toBe('Violin');
    expect(result.section).toBe('Strings');
  });

  it('identifies Violin from abbreviation', () => {
    expect(normalizeInstrumentLabel('Vln').instrument).toBe('Violin');
  });

  it('identifies Viola', () => {
    const result = normalizeInstrumentLabel('Viola');
    expect(result.instrument).toBe('Viola');
  });

  it('identifies Cello', () => {
    expect(normalizeInstrumentLabel('Cello').instrument).toBe('Cello');
    expect(normalizeInstrumentLabel('Violoncello').instrument).toBe('Cello');
  });

  it('identifies String Bass', () => {
    expect(normalizeInstrumentLabel('String Bass').instrument).toBe('String Bass');
    expect(normalizeInstrumentLabel('Double Bass').instrument).toBe('String Bass');
  });

  it('identifies Harp', () => {
    const result = normalizeInstrumentLabel('Harp');
    expect(result.instrument).toBe('Harp');
  });
});

describe('normalizeInstrumentLabel - Keyboard Instruments', () => {
  it('identifies Piano', () => {
    const result = normalizeInstrumentLabel('Piano');
    expect(result.instrument).toBe('Piano');
    expect(result.section).toBe('Keyboard');
  });

  it('identifies Piano from abbreviation', () => {
    expect(normalizeInstrumentLabel('Pno').instrument).toBe('Piano');
  });

  it('identifies Organ', () => {
    const result = normalizeInstrumentLabel('Organ');
    expect(result.instrument).toBe('Organ');
  });

  it('identifies Celesta', () => {
    expect(normalizeInstrumentLabel('Celesta').instrument).toBe('Celesta');
    expect(normalizeInstrumentLabel('Celeste').instrument).toBe('Celesta');
  });
});

describe('normalizeInstrumentLabel - Score Types', () => {
  it('identifies Full Score', () => {
    const result = normalizeInstrumentLabel('Full Score');
    expect(result.instrument).toBe('Full Score');
    expect(result.section).toBe('Score');
    expect(result.partType).toBe('FULL_SCORE');
  });

  it('identifies Conductor Score', () => {
    const result = normalizeInstrumentLabel('Conductor Score');
    expect(result.instrument).toBe('Full Score');
    expect(result.partType).toBe('CONDUCTOR_SCORE');
  });

  it('identifies Condensed Score', () => {
    const result = normalizeInstrumentLabel('Condensed Score');
    expect(result.instrument).toBe('Condensed Score');
    expect(result.section).toBe('Score');
    expect(result.partType).toBe('CONDENSED_SCORE');
  });

  it('identifies Score from abbreviation', () => {
    const result = normalizeInstrumentLabel('Score');
    expect(result.instrument).toBe('Full Score');
  });
});

// =============================================================================
// Chair/Position Extraction Tests
// =============================================================================

describe('normalizeInstrumentLabel - Chair Extraction', () => {
  it('extracts 1st chair from various formats', () => {
    expect(normalizeInstrumentLabel('1st Clarinet').chair).toBe('1st');
    expect(normalizeInstrumentLabel('First Clarinet').chair).toBe('1st');
    expect(normalizeInstrumentLabel('Clarinet 1').chair).toBe('1st');
    expect(normalizeInstrumentLabel('Clarinet I').chair).toBe('1st');
    expect(normalizeInstrumentLabel('I Clarinet').chair).toBe('1st');
  });

  it('extracts 2nd chair from various formats', () => {
    expect(normalizeInstrumentLabel('2nd Trumpet').chair).toBe('2nd');
    expect(normalizeInstrumentLabel('Second Trumpet').chair).toBe('2nd');
    expect(normalizeInstrumentLabel('Trumpet 2').chair).toBe('2nd');
    expect(normalizeInstrumentLabel('Trumpet II').chair).toBe('2nd');
    expect(normalizeInstrumentLabel('II Trumpet').chair).toBe('2nd');
  });

  it('extracts 3rd chair from various formats', () => {
    expect(normalizeInstrumentLabel('3rd Horn').chair).toBe('3rd');
    expect(normalizeInstrumentLabel('Third Horn').chair).toBe('3rd');
    expect(normalizeInstrumentLabel('Horn III').chair).toBe('3rd');
    expect(normalizeInstrumentLabel('III Horn').chair).toBe('3rd');
  });

  it('extracts 4th chair from various formats', () => {
    expect(normalizeInstrumentLabel('4th Trombone').chair).toBe('4th');
    expect(normalizeInstrumentLabel('Fourth Trombone').chair).toBe('4th');
    expect(normalizeInstrumentLabel('Trombone IV').chair).toBe('4th');
    expect(normalizeInstrumentLabel('IV Trombone').chair).toBe('4th');
  });

  it('extracts Solo designation', () => {
    expect(normalizeInstrumentLabel('Solo Cornet').chair).toBe('Solo');
    expect(normalizeInstrumentLabel('solo trumpet').chair).toBe('Solo');
  });

  it('extracts Aux designation', () => {
    expect(normalizeInstrumentLabel('Aux Percussion').chair).toBe('Aux');
    expect(normalizeInstrumentLabel('Auxiliary Percussion').chair).toBe('Aux');
  });

  it('returns null when no chair is specified', () => {
    expect(normalizeInstrumentLabel('Clarinet').chair).toBeNull();
    expect(normalizeInstrumentLabel('Trombone').chair).toBeNull();
    expect(normalizeInstrumentLabel('Tuba').chair).toBeNull();
  });
});

// =============================================================================
// Transposition Extraction Tests
// =============================================================================

describe('normalizeInstrumentLabel - Transposition Extraction', () => {
  it('extracts Bb transposition', () => {
    expect(normalizeInstrumentLabel('Bb Clarinet').transposition).toBe('Bb');
    expect(normalizeInstrumentLabel('B-flat Trumpet').transposition).toBe('Bb');
    expect(normalizeInstrumentLabel('Trumpet in Bb').transposition).toBe('Bb');
    expect(normalizeInstrumentLabel('Tenor Sax').transposition).toBe('Bb');
  });

  it('extracts Eb transposition', () => {
    expect(normalizeInstrumentLabel('Eb Clarinet').transposition).toBe('Eb');
    expect(normalizeInstrumentLabel('Alto Sax').transposition).toBe('Eb');
    expect(normalizeInstrumentLabel('Baritone Sax').transposition).toBe('Eb');
  });

  it('extracts F transposition', () => {
    expect(normalizeInstrumentLabel('French Horn').transposition).toBe('F');
    expect(normalizeInstrumentLabel('English Horn').transposition).toBe('F');
    expect(normalizeInstrumentLabel('Horn in F').transposition).toBe('F');
  });

  it('defaults to C for non-transposing instruments', () => {
    expect(normalizeInstrumentLabel('Flute').transposition).toBe('C');
    expect(normalizeInstrumentLabel('Oboe').transposition).toBe('C');
    expect(normalizeInstrumentLabel('Bassoon').transposition).toBe('C');
    expect(normalizeInstrumentLabel('Trombone').transposition).toBe('C');
    expect(normalizeInstrumentLabel('Tuba').transposition).toBe('C');
  });
});

// =============================================================================
// Section Classification Tests
// =============================================================================

describe('normalizeInstrumentLabel - Section Classification', () => {
  it('classifies woodwinds correctly', () => {
    expect(normalizeInstrumentLabel('Flute').section).toBe('Woodwinds');
    expect(normalizeInstrumentLabel('Clarinet').section).toBe('Woodwinds');
    // Generic 'Saxophone' not in registry - use specific type like 'Alto Saxophone'
    expect(normalizeInstrumentLabel('Alto Saxophone').section).toBe('Woodwinds');
    expect(normalizeInstrumentLabel('Oboe').section).toBe('Woodwinds');
    expect(normalizeInstrumentLabel('Bassoon').section).toBe('Woodwinds');
  });

  it('classifies brass correctly', () => {
    expect(normalizeInstrumentLabel('Trumpet').section).toBe('Brass');
    expect(normalizeInstrumentLabel('Trombone').section).toBe('Brass');
    expect(normalizeInstrumentLabel('Horn').section).toBe('Brass');
    expect(normalizeInstrumentLabel('Tuba').section).toBe('Brass');
    expect(normalizeInstrumentLabel('Euphonium').section).toBe('Brass');
  });

  it('classifies percussion correctly', () => {
    expect(normalizeInstrumentLabel('Snare Drum').section).toBe('Percussion');
    expect(normalizeInstrumentLabel('Timpani').section).toBe('Percussion');
    expect(normalizeInstrumentLabel('Marimba').section).toBe('Percussion');
    expect(normalizeInstrumentLabel('Cymbals').section).toBe('Percussion');
  });

  it('classifies strings correctly', () => {
    expect(normalizeInstrumentLabel('Violin').section).toBe('Strings');
    expect(normalizeInstrumentLabel('Cello').section).toBe('Strings');
    expect(normalizeInstrumentLabel('Harp').section).toBe('Strings');
  });

  it('classifies keyboard correctly', () => {
    expect(normalizeInstrumentLabel('Piano').section).toBe('Keyboard');
    expect(normalizeInstrumentLabel('Organ').section).toBe('Keyboard');
  });

  it('classifies scores correctly', () => {
    expect(normalizeInstrumentLabel('Full Score').section).toBe('Score');
    expect(normalizeInstrumentLabel('Conductor Score').section).toBe('Score');
  });

  it('classifies unknown as Other', () => {
    expect(normalizeInstrumentLabel('Ocarina').section).toBe('Other');
    expect(normalizeInstrumentLabel('UnknownInstrument').section).toBe('Other');
  });
});

// =============================================================================
// Edge Cases and Fallback Tests
// =============================================================================

describe('normalizeInstrumentLabel - Edge Cases', () => {
  it('returns Unknown for empty string', () => {
    const result = normalizeInstrumentLabel('');
    expect(result.instrument).toBe('Unknown');
    expect(result.section).toBe('Other');
  });

  it('returns Unknown for whitespace only', () => {
    const result = normalizeInstrumentLabel('   ');
    expect(result.instrument).toBe('Unknown');
  });

  it('handles unknown instrument gracefully', () => {
    const result = normalizeInstrumentLabel('XyzGarbage99');
    expect(result.instrument).toBe('XyzGarbage99');
    expect(result.section).toBe('Other');
  });

  it('preserves case of unknown instruments', () => {
    const result = normalizeInstrumentLabel('CustomInstrument');
    expect(result.instrument).toBe('CustomInstrument');
  });

  it('handles very long instrument labels', () => {
    const longLabel = 'Bb Clarinet ' + 'in B-flat '.repeat(20);
    const result = normalizeInstrumentLabel(longLabel);
    expect(result.instrument).toContain('Bb Clarinet');
  });
});

// =============================================================================
// Part Type Inference Tests
// =============================================================================

describe('normalizeInstrumentLabel - Part Type Inference', () => {
  it('infers PART for regular instruments', () => {
    expect(normalizeInstrumentLabel('Bb Clarinet').partType).toBe('PART');
    expect(normalizeInstrumentLabel('Trumpet').partType).toBe('PART');
  });

  it('infers CONDUCTOR_SCORE', () => {
    expect(normalizeInstrumentLabel('Conductor Score').partType).toBe('CONDUCTOR_SCORE');
    expect(normalizeInstrumentLabel('Conductor').partType).toBe('CONDUCTOR_SCORE');
  });

  it('infers FULL_SCORE', () => {
    expect(normalizeInstrumentLabel('Full Score').partType).toBe('FULL_SCORE');
    expect(normalizeInstrumentLabel('Score').partType).toBe('FULL_SCORE');
  });

  it('infers CONDENSED_SCORE', () => {
    expect(normalizeInstrumentLabel('Condensed Score').partType).toBe('CONDENSED_SCORE');
  });
});

// =============================================================================
// Display Name Builder Tests
// =============================================================================

describe('buildPartDisplayName', () => {
  it('combines title and instrument', () => {
    const result = buildPartDisplayName('Stars and Stripes', { instrument: '1st Bb Clarinet' });
    expect(result).toBe('Stars and Stripes 1st Bb Clarinet');
  });

  it('trims extra whitespace', () => {
    const result = buildPartDisplayName('  March  ', { instrument: '  Flute  ' });
    expect(result).toBe('March Flute');
  });

  it('handles instrument without chair', () => {
    const result = buildPartDisplayName('Ode to Joy', { instrument: 'Tuba' });
    expect(result).toBe('Ode to Joy Tuba');
  });

  it('handles long titles', () => {
    const longTitle = 'A'.repeat(100);
    const result = buildPartDisplayName(longTitle, { instrument: 'Flute' });
    expect(result).toBe(`${longTitle} Flute`);
  });
});

// =============================================================================
// Filename Builder Tests
// =============================================================================

describe('buildPartFilename', () => {
  it('replaces spaces with underscores', () => {
    const result = buildPartFilename('Stars and Stripes 1st Bb Clarinet');
    expect(result).toBe('Stars_and_Stripes_1st_Bb_Clarinet.pdf');
  });

  it('removes filesystem-unsafe characters', () => {
    expect(buildPartFilename("O'Brien March")).not.toContain("'");
    expect(buildPartFilename('March: The Finale')).not.toContain(':');
    expect(buildPartFilename('A/B Test')).not.toContain('/');
  });

  it('collapses multiple underscores', () => {
    const result = buildPartFilename('A   B   C');
    expect(result).toBe('A_B_C.pdf');
    expect(result).not.toContain('__');
  });

  it('truncates at 200 characters', () => {
    const longName = 'A'.repeat(250);
    const result = buildPartFilename(longName);
    expect(result.length).toBe(204); // 200 + '.pdf'
  });

  it('always ends with .pdf', () => {
    const result = buildPartFilename('Test');
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

// =============================================================================
// Storage Slug Builder Tests
// =============================================================================

describe('buildPartStorageSlug', () => {
  it('replaces spaces with underscores', () => {
    const result = buildPartStorageSlug('Stars and Stripes');
    expect(result).toBe('Stars_and_Stripes');
  });

  it('removes non-alphanumeric characters except dash and underscore', () => {
    expect(buildPartStorageSlug("O'Brien")).not.toContain("'");
    expect(buildPartStorageSlug('Test!@#$%')).toBe('Test');
    expect(buildPartStorageSlug('A-B_C')).toBe('A-B_C'); // Keeps dash and underscore
  });

  it('collapses multiple underscores', () => {
    const result = buildPartStorageSlug('A   B');
    expect(result).toBe('A_B');
    expect(result).not.toContain('__');
  });

  it('truncates base at 120 characters', () => {
    const longName = 'A'.repeat(200);
    const result = buildPartStorageSlug(longName);
    expect(result.length).toBe(120);
  });

  it('does not add extension', () => {
    const result = buildPartStorageSlug('Test');
    expect(result).toBe('Test');
    expect(result.endsWith('.pdf')).toBe(false);
  });
});
