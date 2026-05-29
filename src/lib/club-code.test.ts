import { describe, it, expect } from 'vitest';
import { clubCodePrefix, generateClubCode, CLUB_CODE_RE } from './club-code';

describe('clubCodePrefix', () => {
  it('uppercases and strips spaces', () => {
    expect(clubCodePrefix('Teoula')).toBe('TEOULA');
    expect(clubCodePrefix('Caen la Mer')).toBe('CAENLAMER');
  });
  it('strips accents', () => {
    expect(clubCodePrefix('Golf de Téoulà')).toBe('GOLFDETEOULA');
  });
  it('drops punctuation and apostrophes', () => {
    expect(clubCodePrefix("Golf d'Étretat")).toBe('GOLFDETRETAT');
  });
  it('caps the prefix length at 12', () => {
    expect(clubCodePrefix('Association Sportive Golfique Nationale')).toBe('ASSOCIATIONS');
  });
  it('falls back to CLUB when nothing alphanumeric remains', () => {
    expect(clubCodePrefix('—– !')).toBe('CLUB');
    expect(clubCodePrefix('')).toBe('CLUB');
  });
});

describe('generateClubCode', () => {
  it('matches PREFIX + 6 digits + 1 symbol', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateClubCode('Teoula');
      expect(code).toMatch(CLUB_CODE_RE);
      expect(code.startsWith('TEOULA')).toBe(true);
    }
  });
  it('produces varied codes (not constant)', () => {
    const codes = new Set(Array.from({ length: 30 }, () => generateClubCode('Teoula')));
    expect(codes.size).toBeGreaterThan(1);
  });
});
