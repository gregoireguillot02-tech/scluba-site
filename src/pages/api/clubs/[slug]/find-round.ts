import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import {
  slugSchema,
  findRoundSchema,
  shortCodeSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
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
  let short_code_filter: string | null = null;
  if (rawShortCode) {
    const scParsed = shortCodeSchema.safeParse(rawShortCode);
    if (!scParsed.success) return new Response('code de partie invalide', { status: 400 });
    short_code_filter = scParsed.data;
  }

  const sb = serviceClient();

  const { data: club } = await sb
    .from('clubs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!club) return new Response('Club not found', { status: 404 });

  let roundsQuery = sb
    .from('rounds')
    .select('id, short_code, status, started_at, created_at')
    .eq('club_id', club.id)
    .in('status', ['lobby', 'playing']);
  if (short_code_filter) roundsQuery = roundsQuery.eq('short_code', short_code_filter);
  const { data: rounds } = await roundsQuery;
  const activeRounds = rounds ?? [];

  if (activeRounds.length === 0) {
    return redirect(`/${slug}?recover_err=not_found&name=${encodeURIComponent(display_name)}`, 302);
  }

  const roundIds = activeRounds.map((r) => r.id);
  const { data: players } = await sb
    .from('round_players')
    .select('id, round_id, display_name, joined_at')
    .in('round_id', roundIds)
    .ilike('display_name', display_name);
  const matches = players ?? [];

  if (matches.length === 0) {
    return redirect(`/${slug}?recover_err=not_found&name=${encodeURIComponent(display_name)}`, 302);
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

  return redirect(`/${slug}?recover=ambiguous&name=${encodeURIComponent(display_name)}`, 302);
};
