import { defineMiddleware } from 'astro:middleware';
import { authServerClient, isAllowedEmail, serviceClient } from './lib/supabase';
import { canAccessSection, type ClubSection } from './lib/club-auth';
import { applyRateLimit } from './lib/rate-limit';

const PUBLIC_OPS_PATHS = new Set([
  '/ops/login',
  '/ops/auth/callback',
  '/ops/auth/signout',
]);

const CSRF_PROTECTED_PREFIXES = ['/api/ops', '/api/rounds', '/api/clubs', '/api/club/'];
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CSP_VALUE = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');

const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), gyroscope=(), accelerometer=(), magnetometer=(), fullscreen=(self), picture-in-picture=()';

function applySecurityHeaders(response: Response, pathname: string): Response {
  // Re-wrap so we can mutate headers without consuming the (possibly streamed)
  // body. `new Response(response.body, response)` preserves status + streams.
  const out = new Response(response.body, response);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Frame-Options', 'SAMEORIGIN');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  out.headers.set('Permissions-Policy', PERMISSIONS_POLICY);
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  out.headers.set('Content-Security-Policy', CSP_VALUE);

  const noStorePath =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/auth') ||
    pathname === '/club' || pathname.startsWith('/club/') ||
    pathname.startsWith('/r/');
  if (noStorePath) out.headers.set('Cache-Control', 'no-store');

  const noindexPath =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/ops') ||
    pathname === '/club' || pathname.startsWith('/club/');
  if (noindexPath) out.headers.set('X-Robots-Tag', 'noindex, nofollow');

  return out;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method;

  // CSRF Origin check — block cross-site state-changing requests on sensitive
  // API surfaces BEFORE we burn rate-limit budget or run any auth logic.
  if (
    CSRF_PROTECTED_METHODS.has(method) &&
    CSRF_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const origin = context.request.headers.get('origin');
    const secFetchSite = context.request.headers.get('sec-fetch-site');
    const expected = context.url.origin;
    // Accept if Origin matches exactly, OR Sec-Fetch-Site says same-origin/none
    // (none = direct navigation / curl; same-origin = same-site fetch). This
    // blocks cross-site fetches (Sec-Fetch-Site=cross-site) and any request
    // that ships a foreign Origin header. Curl without headers still passes
    // but the attacker would also need the session cookie, which they cannot
    // forge cross-origin.
    const sameOrigin =
      (origin && origin === expected) ||
      secFetchSite === 'same-origin' ||
      secFetchSite === 'none';
    if (!sameOrigin) {
      const res = new Response(
        JSON.stringify({ error: 'cross_origin' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      return applySecurityHeaders(res, pathname);
    }
  }

  // Rate-limit en premier (ex-Netlify Edge Function rate-limit.ts).
  const rateLimited = await applyRateLimit(context.request);
  if (rateLimited) return applySecurityHeaders(rateLimited, pathname);

  const isOpsPage = pathname.startsWith('/ops');
  const isOpsApi = pathname.startsWith('/api/ops');
  const isAuthPage = pathname.startsWith('/auth');
  const isAuthApi = pathname.startsWith('/api/auth');
  // Préfixes précis : `/api/club/` ne doit PAS happer `/api/clubs/...`
  // (endpoint public find-round), et `/club/` ne doit pas matcher un futur
  // `/clubhouse`. La zone club = exactement /club, /club/* et /api/club/*.
  const isClubPage = pathname === '/club' || pathname.startsWith('/club/');
  const isClubApi = pathname.startsWith('/api/club/');
  const isClubJoin = pathname === '/club/join';

  // Pages outside the auth/ops/club zones don't need the supabase client
  // populated, but they still need security headers applied to the response.
  if (!isOpsPage && !isOpsApi && !isAuthPage && !isAuthApi && !isClubPage && !isClubApi) {
    const response = await next();
    return applySecurityHeaders(response, pathname);
  }

  const supabase = authServerClient(context.cookies, context.request.headers);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user
    ? { id: user.id, email: user.email ?? '' }
    : null;
  context.locals.supabase = supabase;
  context.locals.clubMembership = null;

  // Golfer-side auth pages have no allowlist — anyone can sign in.
  if (isAuthPage || isAuthApi) {
    const response = await next();
    return applySecurityHeaders(response, pathname);
  }

  // --- Zone Portail Club (séparée de /ops : membership club, pas allowlist) ---
  if (isClubPage || isClubApi) {
    // /club/join est public : la page consomme elle-même le token + magic-link.
    if (isClubJoin) {
      const response = await next();
      return applySecurityHeaders(response, pathname);
    }
    if (!user) {
      if (isClubApi) {
        return applySecurityHeaders(new Response('Unauthorized', { status: 401 }), pathname);
      }
      const next_ = encodeURIComponent(pathname + context.url.search);
      return applySecurityHeaders(context.redirect(`/auth/login?next=${next_}`, 302), pathname);
    }
    const sb = serviceClient();
    // limit(1) + order : tolère un compte rattaché à plusieurs clubs (la
    // contrainte est unique(user_id, club_id), pas unique(user_id)) sans que
    // maybeSingle ne jette une erreur silencieuse → plus de lockout. On prend
    // la membership la plus ancienne de façon déterministe (mono-club = pilote).
    const { data: membershipRows, error: membershipErr } = await sb
      .from('club_users')
      .select('club_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (membershipErr) console.error('[middleware] club_users lookup failed', membershipErr);
    const membership = membershipRows?.[0] ?? null;
    if (!membership) {
      const msg = isClubApi ? 'Forbidden' : 'Accès club non autorisé pour ce compte.';
      return applySecurityHeaders(new Response(msg, { status: 403 }), pathname);
    }
    context.locals.clubMembership = { clubId: membership.club_id, role: membership.role };

    // Garde rôle sur les pages : greenkeeper ne voit que /club/signalements.
    if (isClubPage) {
      const section: ClubSection = pathname.startsWith('/club/signalements')
        ? 'signalements'
        : 'dashboard';
      if (!canAccessSection(membership.role, section)) {
        return applySecurityHeaders(context.redirect('/club/signalements', 302), pathname);
      }
    }
    const response = await next();
    return applySecurityHeaders(response, pathname);
  }

  if (PUBLIC_OPS_PATHS.has(pathname)) {
    const response = await next();
    return applySecurityHeaders(response, pathname);
  }

  if (!user) {
    if (isOpsApi) {
      return applySecurityHeaders(
        new Response('Unauthorized', { status: 401 }),
        pathname,
      );
    }
    const next_ = encodeURIComponent(pathname + context.url.search);
    return applySecurityHeaders(
      context.redirect(`/ops/login?next=${next_}`, 302),
      pathname,
    );
  }

  if (!isAllowedEmail(user.email)) {
    if (isOpsApi) {
      return applySecurityHeaders(
        new Response('Forbidden', { status: 403 }),
        pathname,
      );
    }
    return applySecurityHeaders(
      new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>Accès refusé</title></head>` +
          `<body style="font-family:system-ui;max-width:520px;margin:80px auto;padding:0 20px;color:#1B4332">` +
          `<h1 style="font-family:Georgia,serif">Accès refusé</h1>` +
          `<p>Le compte <b>${escapeHtml(user.email ?? '')}</b> n'est pas autorisé.</p>` +
          `<p><a href="/ops/auth/signout" style="color:#D4A574">Se déconnecter</a></p>` +
          `</body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      ),
      pathname,
    );
  }

  const response = await next();
  return applySecurityHeaders(response, pathname);
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
