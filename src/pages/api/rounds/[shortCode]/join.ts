import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../../lib/supabase';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
  const shortCode = (params.shortCode ?? '').toUpperCase();
  if (!shortCode) return new Response('shortCode required', { status: 400 });

  const form = await request.formData();
  const display_name = String(form.get('display_name') ?? '').trim().slice(0, 40);
  if (!display_name) return new Response('display_name required', { status: 400 });

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Code introuvable. Vérifie avec ton ami.', { status: 404 });
  if (round.status === 'finished') {
    return new Response('Cette partie est déjà terminée.', { status: 409 });
  }

  // If the existing cookie maps to a player already in this round, just redirect.
  const existing = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value;
  if (existing) {
    const { data: alreadyIn } = await sb
      .from('round_players')
      .select('id')
      .eq('id', existing)
      .eq('round_id', round.id)
      .maybeSingle();
    if (alreadyIn) {
      return redirect(`/r/${shortCode}`, 302);
    }
  }

  const auth = authServerClient(cookies, request.headers);
  const { data: { user } } = await auth.auth.getUser();

  const { data: player, error: pErr } = await sb
    .from('round_players')
    .insert({
      round_id: round.id,
      display_name,
      is_creator: false,
      user_id: user?.id ?? null,
    })
    .select('id')
    .single();
  if (pErr) return new Response(`Join failed: ${pErr.message}`, { status: 500 });

  cookies.set(`${PLAYER_COOKIE_PREFIX}${shortCode}`, player.id, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  });

  return redirect(`/r/${shortCode}`, 302);
};
