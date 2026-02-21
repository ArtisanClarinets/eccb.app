/**
 * Instrument Mapper Tests
 *
 * Tests for instrument name normalization, fuzzy matching,
 * and database instrument mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeInstrumentName,
  fuzzyMatchInstrument,
  mapInstrumentsToDb,
  mapSingleInstrument,
  getAllInstruments,
  getInstrumentsByFamily,
} from '@/lib/services/smart-upload/instrument-mapper';

// Mock Prisma - use vi.mock before any imports
vi.mock('@/lib/db', () => ({
  prisma: {
    instrument: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('normalizeInstrumentName', () => {
  it('should lowercase and trim input', () => {
    expect(normalizeInstrumentName('  FLUTE  ')).toBe('flute');
  });

  it('should remove "in" key signatures', () => {
    expect(normalizeInstrumentName('Trumpet in Bb')).toBe('trumpet');
    expect(normalizeInstrumentName('Horn in F')).toBe('horn');
  });

  it('should remove parenthetical content', () => {
    expect(normalizeInstrumentName('Trumpet (opt)')).toBe('trumpet');
    expect(normalizeInstrumentName('Flute (2)')).toBe('flute');
  });

  it('should remove bracketed content', () => {
    expect(normalizeInstrumentName('Clarinet [1st]')).toBe('clarinet');
    expect(normalizeInstrumentName('Oboe [2]')).toBe('oboe');
  });

  it('should return empty string for empty input', () => {
    expect(normalizeInstrumentName('')).toBe('');
    expect(normalizeInstrumentName('   ')).toBe('');
  });

  it('should handle multiple whitespace', () => {
    const result = normalizeInstrumentName('Flute    and    Clarinet');
    expect(result).toContain('flute');
  });
});

describe('fuzzyMatchInstrument', () => {
  const now = new Date();
  const mockInstruments = [
    { id: 'inst-1', name: 'Flute', family: 'Woodwind', sortOrder: 1, createdAt: now, updatedAt: now },
    { id: 'inst-2', name: 'Clarinet', family: 'Woodwind', sortOrder: 2, createdAt: now, updatedAt: now },
    { id: 'inst-5', name: 'Alto Saxophone', family: 'Woodwind', sortOrder: 5, createdAt: now, updatedAt: now },
    { id: 'inst-7', name: 'Trumpet', family: 'Brass', sortOrder: 1, createdAt: now, updatedAt: now },
  ];

  it('should return exact match for direct instrument name', () => {
    const result = fuzzyMatchInstrument('Flute', mockInstruments);
    expect(result).not.toBeNull();
    expect(result?.instrumentId).toBe('inst-1');
    expect(result?.confidence).toBe(1.0);
  });

  it('should return fuzzy match for partial match', () => {
    const result = fuzzyMatchInstrument('flute', mockInstruments);
    expect(result).not.toBeNull();
    expect(result?.instrumentId).toBe('inst-1');
  });

  it('should return null for empty input', () => {
    const result = fuzzyMatchInstrument('', mockInstruments);
    expect(result).toBeNull();
  });

  it('should return null for null instruments array', () => {
    const result = fuzzyMatchInstrument('Flute', null as any);
    expect(result).toBeNull();
  });

  it('should return null for empty instruments array', () => {
    const result = fuzzyMatchInstrument('Flute', []);
    expect(result).toBeNull();
  });

  it('should return null for no match below threshold', () => {
    const result = fuzzyMatchInstrument('xyz123', mockInstruments);
    expect(result).toBeNull();
  });

  it('should handle case insensitivity', () => {
    const result = fuzzyMatchInstrument('CLARINET', mockInstruments);
    expect(result).not.toBeNull();
    expect(result?.instrumentId).toBe('inst-2');
  });

  it('should not match unrelated instruments', () => {
    const result = fuzzyMatchInstrument('guitar', mockInstruments);
    // Guitar is not in the mock instruments
    expect(result).toBeNull();
  });
});

describe('mapInstrumentsToDb', () => {
  // These tests verify the function is callable
  it('should be defined', () => {
    expect(mapInstrumentsToDb).toBeDefined();
    expect(typeof mapInstrumentsToDb).toBe('function');
  });
});

describe('mapSingleInstrument', () => {
  it('should be defined', () => {
    expect(mapSingleInstrument).toBeDefined();
    expect(typeof mapSingleInstrument).toBe('function');
  });
});

describe('getAllInstruments', () => {
  it('should be defined', () => {
    expect(getAllInstruments).toBeDefined();
    expect(typeof getAllInstruments).toBe('function');
  });
});

describe('getInstrumentsByFamily', () => {
  it('should be defined', () => {
    expect(getInstrumentsByFamily).toBeDefined();
    expect(typeof getInstrumentsByFamily).toBe('function');
  });
});
