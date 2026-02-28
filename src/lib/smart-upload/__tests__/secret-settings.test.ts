import { describe, it, expect } from 'vitest';
import { maskSecretValue, mergeSecretUpdate } from '../secret-settings';

// =============================================================================
// maskSecretValue
// =============================================================================

describe('maskSecretValue', () => {
  it('returns "__SET__" for a non-empty string', () => {
    expect(maskSecretValue('abc123')).toBe('__SET__');
  });

  it('returns "__SET__" for a long key', () => {
    expect(maskSecretValue('sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('__SET__');
  });

  it('returns "" for an empty string', () => {
    expect(maskSecretValue('')).toBe('');
  });

  it('returns "" for null', () => {
    expect(maskSecretValue(null)).toBe('');
  });

  it('returns "" for undefined', () => {
    expect(maskSecretValue(undefined)).toBe('');
  });
});

// =============================================================================
// mergeSecretUpdate
// =============================================================================

describe('mergeSecretUpdate', () => {
  // --- Sentinel preservation ---
  it('keeps current when incoming is "__SET__"', () => {
    expect(mergeSecretUpdate('existing', '__SET__')).toBe('existing');
  });

  it('keeps current (null) when incoming is "__SET__"', () => {
    expect(mergeSecretUpdate(null, '__SET__')).toBeNull();
  });

  it('keeps current when incoming is "***"', () => {
    expect(mergeSecretUpdate('existing', '***')).toBe('existing');
  });

  it('keeps current when incoming is "******"', () => {
    expect(mergeSecretUpdate('existing', '******')).toBe('existing');
  });

  it('keeps current when incoming is "__UNSET__"', () => {
    expect(mergeSecretUpdate('existing', '__UNSET__')).toBe('existing');
  });

  // --- Real updates ---
  it('replaces current with a new key', () => {
    expect(mergeSecretUpdate('existing', 'newkey')).toBe('newkey');
  });

  it('sets a new key when current is null', () => {
    expect(mergeSecretUpdate(null, 'newkey')).toBe('newkey');
  });

  it('sets a new key when current is undefined', () => {
    expect(mergeSecretUpdate(undefined, 'newkey')).toBe('newkey');
  });

  // --- Blank / empty incoming ---
  it('keeps current when incoming is empty string', () => {
    expect(mergeSecretUpdate('existing', '')).toBe('existing');
  });

  it('keeps current when incoming is whitespace only', () => {
    expect(mergeSecretUpdate('existing', '   ')).toBe('existing');
  });

  it('returns null when current is null and incoming is blank', () => {
    expect(mergeSecretUpdate(null, '')).toBeNull();
  });

  // --- Explicit clear ---
  it('returns null on "__CLEAR__" when current has a value', () => {
    expect(mergeSecretUpdate('existing', '__CLEAR__')).toBeNull();
  });

  it('returns null on "__CLEAR__" when current is null', () => {
    expect(mergeSecretUpdate(null, '__CLEAR__')).toBeNull();
  });
});
