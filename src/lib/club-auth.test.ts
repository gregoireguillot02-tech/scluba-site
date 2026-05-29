import { describe, it, expect } from 'vitest';
import {
  generateInviteToken,
  isInviteUsable,
  canAccessSection,
  type ClubRole,
} from './club-auth';

describe('generateInviteToken', () => {
  it('génère un token url-safe d\'au moins 32 chars', () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
  it('génère deux tokens différents', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe('isInviteUsable', () => {
  const now = new Date('2026-05-29T12:00:00Z');
  it('refuse une invite déjà utilisée', () => {
    expect(isInviteUsable({ used_at: '2026-05-28T00:00:00Z', expires_at: '2026-06-30T00:00:00Z' }, now)).toBe(false);
  });
  it('refuse une invite expirée', () => {
    expect(isInviteUsable({ used_at: null, expires_at: '2026-05-01T00:00:00Z' }, now)).toBe(false);
  });
  it('accepte une invite fraîche et non utilisée', () => {
    expect(isInviteUsable({ used_at: null, expires_at: '2026-06-30T00:00:00Z' }, now)).toBe(true);
  });
});

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
