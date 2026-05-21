import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase', () => ({
  isAllowedEmail: (email: string | null | undefined) =>
    email === 'greg@allowed.com',
}));

// Import APRÈS le vi.mock pour que le mock soit appliqué au moment de l'import
// du module testé (qui ré-importe lib/supabase).
import { GET } from './callback';

type AuthMethod = ReturnType<typeof vi.fn>;

function makeContext(opts: {
  query: string;
  exchangeError?: { message: string } | null;
  userEmail?: string | null;
}) {
  const exchangeCodeForSession: AuthMethod = vi.fn().mockResolvedValue({
    error: opts.exchangeError ?? null,
  });
  const getUser: AuthMethod = vi.fn().mockResolvedValue({
    data: { user: opts.userEmail ? { email: opts.userEmail } : null },
    error: null,
  });
  const signOut: AuthMethod = vi.fn().mockResolvedValue({ error: null });

  const redirect = vi.fn((path: string, status = 302) => {
    return new Response(null, { status, headers: { Location: path } });
  });

  const url = new URL('http://localhost' + opts.query);

  return {
    ctx: {
      url,
      locals: {
        supabase: { auth: { exchangeCodeForSession, getUser, signOut } },
      },
      redirect,
    } as any,
    spies: { exchangeCodeForSession, getUser, signOut, redirect },
  };
}

describe('GET /ops/auth/callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirige vers err=missing_code si code absent', async () => {
    const { ctx, spies } = makeContext({ query: '/ops/auth/callback' });
    const res = await GET(ctx);
    expect(res?.headers.get('Location')).toBe('/ops/login?err=missing_code');
    expect(spies.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('redirige vers err=auth_failed sur error_description', async () => {
    const { ctx } = makeContext({
      query: '/ops/auth/callback?error_description=access_denied',
    });
    const res = await GET(ctx);
    expect(res?.headers.get('Location')).toBe('/ops/login?err=auth_failed');
  });

  it('redirige vers err=auth_failed si exchangeCodeForSession échoue', async () => {
    const { ctx } = makeContext({
      query: '/ops/auth/callback?code=abc',
      exchangeError: { message: 'invalid grant' },
    });
    const res = await GET(ctx);
    expect(res?.headers.get('Location')).toBe('/ops/login?err=auth_failed');
  });

  it('signOut + err=not_allowed si email pas dans allowlist', async () => {
    const { ctx, spies } = makeContext({
      query: '/ops/auth/callback?code=abc',
      userEmail: 'intruder@bad.com',
    });
    const res = await GET(ctx);
    expect(spies.signOut).toHaveBeenCalledTimes(1);
    expect(res?.headers.get('Location')).toBe('/ops/login?err=not_allowed');
  });

  it('signOut + err=no_user si getUser ne retourne pas d\'email', async () => {
    const { ctx, spies } = makeContext({
      query: '/ops/auth/callback?code=abc',
      userEmail: null,
    });
    const res = await GET(ctx);
    expect(spies.signOut).toHaveBeenCalledTimes(1);
    expect(res?.headers.get('Location')).toBe('/ops/login?err=no_user');
  });

  it('redirige vers next safe quand email autorisé', async () => {
    const { ctx, spies } = makeContext({
      query: '/ops/auth/callback?code=abc&next=/ops/clubs',
      userEmail: 'greg@allowed.com',
    });
    const res = await GET(ctx);
    expect(spies.signOut).not.toHaveBeenCalled();
    expect(res?.headers.get('Location')).toBe('/ops/clubs');
  });

  it('clamp un next non-sûr vers /ops', async () => {
    const { ctx } = makeContext({
      query: '/ops/auth/callback?code=abc&next=https://evil.com',
      userEmail: 'greg@allowed.com',
    });
    const res = await GET(ctx);
    expect(res?.headers.get('Location')).toBe('/ops');
  });
});
