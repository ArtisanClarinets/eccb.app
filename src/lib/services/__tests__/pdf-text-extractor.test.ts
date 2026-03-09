import { describe, it, expect } from 'vitest';
import { normalizePdfText, isGibberishText } from '../pdf-text-extractor';

describe('pdf-text-extractor utilities', () => {
  it('normalizePdfText should strip control characters and collapse whitespace', () => {
    const input = "Hello\n\tWorld\u0007";
    expect(normalizePdfText(input)).toBe('Hello World');
  });

  it('isGibberishText returns false for normal alphanumeric strings', () => {
    expect(isGibberishText('This is a test 123')).toBe(false);
    expect(isGibberishText('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false);
  });

  it('isGibberishText returns true for strings dominated by symbols', () => {
    const garbage = '!!@@###$$%%^^&&**(( ))__++--==';
    expect(isGibberishText(garbage)).toBe(true);

    const mixed = 'ABC!!!@@@';
    // 3 letters out of 9 characters = 33% alnum -> borderline; threshold <30% so should be false
    expect(isGibberishText(mixed)).toBe(false);

    const mostlyGarbage = 'A!@!@!@!@!@!@!@!';
    // 1 letter out of 14 ~7% -> gibberish
    expect(isGibberishText(mostlyGarbage)).toBe(true);
  });
});
