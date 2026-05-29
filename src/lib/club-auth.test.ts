import { describe, it, expect } from 'vitest';
import { canAccessSection, type ClubRole } from './club-auth';

describe('canAccessSection', () => {
  it('admin accède à tout', () => {
    expect(canAccessSection('admin' as ClubRole, 'dashboard')).toBe(true);
    expect(canAccessSection('admin' as ClubRole, 'signalements')).toBe(true);
  });
  it('greenkeeper accède seulement aux signalements', () => {
    expect(canAccessSection('greenkeeper' as ClubRole, 'signalements')).toBe(true);
    expect(canAccessSection('greenkeeper' as ClubRole, 'dashboard')).toBe(false);
  });
});
