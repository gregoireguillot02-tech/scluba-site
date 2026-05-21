import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import {
  slugSchema,
  findRoundSchema,
  shortCodeSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';
import { escapeLikePattern } from '../../../../lib/safe-redirect';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';
// Floor so a "no match" response can't be distinguished from a "wrong name"
// response by latency. Calibrated above the worst-case DB roundtrip on
// Cloudflare; raise if the auth path ever exceeds it.
// (audit CRITICAL: find-round timing oracle.)
const CONSTANT_RESPONSE_MS = 350;

// Duplicated in every API handler in this branch. Lives in middleware-land
// once fix/sec-headers-middleware-csp lands; for now keep inline to stay in
// scope of this PR. (audit HIGH: CSRF on state-changing routes.)
function assertSameOriginPost(request: Request): Response | null {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  if (!host) return new Response('Origine invalide', { status: 403 });
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.host !== host) return new Response('Origine invalide', { status: 403 });
      return null;
    } catch {
      return new Response('Origine invalide', { status: 403 });
    }
  }
  if (referer) {
    try {
      const r = new URL(referer);
      if (r.host !== host) return new Response('Origine invalide', { status: 403 });
      return null;
    } catch {
      return new Response('Origine invalide', { status: 403 });
    }
  }
  return new Response('Origine invalide', { status: 403 });
}

export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
  const csrf = assertSameOriginPost(request);
  if (csrf) return csrf;

  const tStart = Date.now();
  // Uniform "not found" redirect that intentionally does NOT distinguish
  // between "club inexistant", "code inexistant", "nom inexistant" and
  // "multiple matches" — the previous code leaked all of these via Set-Cookie
  // and via the redirect target. (audit CRITICAL: find-round session hijack.)
  const slugForBack = String(params.slug ?? '');
  const notFound = async (displayName: string) => {
    const elapsed = Date.now() - tStart;
    const wait = Math.max(0, CONSTANT_RESPONSE_MS - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return redirect(
      `/${slugForBack}?recover_err=not_found&name=${encodeURIComponent(displayName)}`,
      302,
    );
  };

  const slugParsed = slugSchema.safeParse(params.slug ?? '');
  if (!slugParsed.success) return new Response('slug invalide', { status: 400 });
  const slug = slugParsed.data;

  const form = await request.formData();
  const parsed = findRoundSchema.safeParse({
    display_name: form.get('display_name') ?? '',
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const { display_name } = parsed.data;

  const rawShortCode = String(form.get('short_code') ?? '').trim();
  const scParsed = shortCodeSchema.safeParse(rawShortCode);
  if (!scParsed.success) {
    // Short code is now REQUIRED (audit CRITICAL: prevents slug-only first-name
    // bruteforce). We still respond with the uniform not-found path so the
    // attacker can't tell whether the code was malformed or just unmatched.
    return notFound(display_name);
  }
  const short_code = scParsed.data;

  const sb = serviceClient();

  const { data: club } = await sb
    .from('clubs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!club) return notFound(display_name);

  const { data: rounds } = await sb
    .from('rounds')
    .select('id, short_code, status')
    .eq('club_id', club.id)
    .eq('short_code', short_code)
    .in('status', ['lobby', 'playing']);
  const activeRounds = rounds ?? [];

  if (activeRounds.length === 0) return notFound(display_name);

  const roundIds = activeRounds.map((r) => r.id);
  // Match only UNCLAIMED placeholder rows. A live, scoring player can never
  // be re-bound by a stranger through this endpoint. (audit CRITICAL.)
  const { data: players } = await sb
    .from('round_players')
    .select('id, round_id, display_name')
    .in('round_id', roundIds)
    .is('claimed_at', null)
    .ilike('display_name', escapeLikePattern(display_name));
  const matches = players ?? [];

  // Fail closed on >1 candidate. The previous "multiple matches → 302 to
  // ?recover=ambiguous" branch leaked round existence; now we return the
  // same uniform not-found redirect.
  if (matches.length !== 1) return notFound(display_name);

  const m = matches[0];
  const round = activeRounds.find((r) => r.id === m.round_id);
  if (!round) return notFound(display_name);

  cookies.set(`${PLAYER_COOKIE_PREFIX}${round.short_code}`, m.id, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });

  // Pad to constant time before issuing the redirect so a successful claim
  // can't be timing-distinguished from a failure.
  const elapsed = Date.now() - tStart;
  const wait = Math.max(0, CONSTANT_RESPONSE_MS - elapsed);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const dest = round.status === 'playing' ? `/r/${round.short_code}/play` : `/r/${round.short_code}`;
  return redirect(dest, 302);
};
