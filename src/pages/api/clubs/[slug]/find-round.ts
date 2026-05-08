import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

// "Reprendre ma partie" — given a club slug + first name, restore the player's
// session cookie so they can rejoin their in-progress round from any device.
//
// Designed for the printed tee-side QR codes: a golfer whose phone died (or
// who switched device) scans the QR at hole 5, types their first name, and
// the backend reattaches them to their existing round_player.
//
// Cases:
//   0 active rounds match the name → redirect /c/<slug>?recover_err=not_found
//   exactly 1 → set scluba_player_<CODE>, redirect /r/<CODE>/play
//   multiple → redirect /c/<slug>?recover=ambiguous&name=<encoded>
//                 the page server-renders a small picker (start time + code)
//                 each row POSTs back here with `short_code` to disambiguate.

export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
  const slug = params.slug;
  if (!slug) return new Response('Missing slug', { status: 400 });

  const form = await request.formData();
  const display_name = String(form.get('display_name') ?? '').trim();
  const short_code_filter = String(form.get('short_code') ?? '').trim().toUpperCase() || null;
  if (!display_name) return new Response('display_name required', { status: 400 });

  const sb = serviceClient();

  const { data: club } = await sb
    .from('clubs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!club) return new Response('Club not found', { status: 404 });

  // Active rounds for this club (lobby + playing — exclude finished).
  let roundsQuery = sb
    .from('rounds')
    .select('id, short_code, status, started_at, created_at')
    .eq('club_id', club.id)
    .in('status', ['lobby', 'playing']);
  if (short_code_filter) roundsQuery = roundsQuery.eq('short_code', short_code_filter);
  const { data: rounds } = await roundsQuery;
  const activeRounds = rounds ?? [];

  if (activeRounds.length === 0) {
    return redirect(`/c/${slug}?recover_err=not_found&name=${encodeURIComponent(display_name)}`, 302);
  }

  // Find round_players matching the name (case-insensitive) in any of those rounds.
  const roundIds = activeRounds.map((r) => r.id);
  const { data: players } = await sb
    .from('round_players')
    .select('id, round_id, display_name, joined_at')
    .in('round_id', roundIds)
    .ilike('display_name', display_name);
  const matches = players ?? [];

  if (matches.length === 0) {
    return redirect(`/c/${slug}?recover_err=not_found&name=${encodeURIComponent(display_name)}`, 302);
  }

  if (matches.length === 1) {
    const m = matches[0];
    const round = activeRounds.find((r) => r.id === m.round_id);
    if (!round) return new Response('Round inconsistency', { status: 500 });

    cookies.set(`${PLAYER_COOKIE_PREFIX}${round.short_code}`, m.id, {
      path: '/',
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });

    const dest = round.status === 'playing' ? `/r/${round.short_code}/play` : `/r/${round.short_code}`;
    return redirect(dest, 302);
  }

  // Multiple matches → punt to the page for disambiguation.
  return redirect(`/c/${slug}?recover=ambiguous&name=${encodeURIComponent(display_name)}`, 302);
};
