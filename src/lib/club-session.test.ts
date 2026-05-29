import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  signClubSession,
  verifyClubSession,
  constantTimeEqual,
  portalCodeFingerprint,
  CLUB_SESSION_MAX_AGE_S,
} from './club-session';

beforeAll(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-secret-key');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const PAYLOAD = { clubId: 'club-123', role: 'admin' as const, email: 'gerant@club.fr', pc: 'abc123fingerprint' };

describe('club-session', () => {
  it('round-trips a signed session', async () => {
    const token = await signClubSession(PAYLOAD);
    const out = await verifyClubSession(token);
    expect(out).not.toBeNull();
    expect(out!.clubId).toBe('club-123');
    expect(out!.role).toBe('admin');
    expect(out!.email).toBe('gerant@club.fr');
    expect(out!.pc).toBe('abc123fingerprint');
    expect(typeof out!.iat).toBe('number');
  });

  it('rejects a tampered body', async () => {
    const token = await signClubSession(PAYLOAD);
    const [body, sig] = token.split('.');
    // flip one char of the body
    const tampered = (body[0] === 'A' ? 'B' : 'A') + body.slice(1) + '.' + sig;
    expect(await verifyClubSession(tampered)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const token = await signClubSession(PAYLOAD);
    const [body, sig] = token.split('.');
    const tampered = body + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verifyClubSession(tampered)).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyClubSession('not-a-token')).toBeNull();
    expect(await verifyClubSession('')).toBeNull();
    expect(await verifyClubSession(undefined)).toBeNull();
    expect(await verifyClubSession('.abc')).toBeNull();
    expect(await verifyClubSession('abc.')).toBeNull();
  });

  it('rejects an expired session', async () => {
    const t0 = 1_700_000_000_000;
    const token = await signClubSession(PAYLOAD, t0);
    // one second past the max age → expired
    const later = t0 + (CLUB_SESSION_MAX_AGE_S + 1) * 1000;
    expect(await verifyClubSession(token, later)).toBeNull();
  });

  it('accepts a session within the validity window', async () => {
    const t0 = 1_700_000_000_000;
    const token = await signClubSession(PAYLOAD, t0);
    const later = t0 + (CLUB_SESSION_MAX_AGE_S - 60) * 1000; // 1 min before expiry
    expect(await verifyClubSession(token, later)).not.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signClubSession(PAYLOAD);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'a-completely-different-secret');
    expect(await verifyClubSession(token)).toBeNull();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-secret-key');
  });
});

describe('portalCodeFingerprint', () => {
  it('is deterministic for the same club + code', async () => {
    const a = await portalCodeFingerprint('club-1', 'TEOULA204815@');
    const b = await portalCodeFingerprint('club-1', 'TEOULA204815@');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it('changes when the code changes (régénération → révocation)', async () => {
    const a = await portalCodeFingerprint('club-1', 'TEOULA204815@');
    const b = await portalCodeFingerprint('club-1', 'TEOULA999999#');
    expect(a).not.toBe(b);
  });
  it('changes when the club changes (pas de collision cross-club)', async () => {
    const a = await portalCodeFingerprint('club-1', 'SAMECODE123456@');
    const b = await portalCodeFingerprint('club-2', 'SAMECODE123456@');
    expect(a).not.toBe(b);
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('TEOULA4023@', 'TEOULA4023@')).toBe(true);
  });
  it('returns false for different strings of same length', () => {
    expect(constantTimeEqual('TEOULA4023@', 'TEOULA4024@')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
  it('returns false when one is empty', () => {
    expect(constantTimeEqual('', 'x')).toBe(false);
  });
});
