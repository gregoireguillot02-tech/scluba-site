import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../lib/supabase';
import { generateRoundShortCode } from '../../../lib/slug';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const GET: APIRoute = ({ redirect }) => redirect('/', 302);

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '').trim();
  const display_name = String(form.get('display_name') ?? '').trim().slice(0, 40);
  if (!slug) return new Response('slug required', { status: 400 });
  if (!display_name) return new Response('display_name required', { status: 400 });

  const sb = serviceClient();

  const { data: club, error: cErr } = await sb
    .from('clubs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (cErr) return new Response(`Lookup failed: ${cErr.message}`, { status: 500 });
  if (!club) return new Response('Club not found', { status: 404 });

  let short_code = '';
  let roundId = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    short_code = generateRoundShortCode();
    const { data: created, error: rErr } = await sb
      .from('rounds')
      .insert({ club_id: club.id, short_code, status: 'lobby' })
      .select('id')
      .single();
    if (!rErr && created) {
      roundId = created.id;
      break;
    }
    if (rErr && !rErr.message.includes('duplicate key')) {
      return new Response(`Create round failed: ${rErr.message}`, { status: 500 });
    }
  }
  if (!roundId) return new Response('short_code collision exhausted', { status: 500 });

  // If the creator has a Supabase session, link the round_player to the user.
  const auth = authServerClient(cookies, request.headers);
  const { data: { user } } = await auth.auth.getUser();

  const { data: player, error: pErr } = await sb
    .from('round_players')
    .insert({
      round_id: roundId,
      display_name,
      is_creator: true,
      user_id: user?.id ?? null,
    })
    .select('id')
    .single();
  if (pErr) return new Response(`Create player failed: ${pErr.message}`, { status: 500 });

  cookies.set(`${PLAYER_COOKIE_PREFIX}${short_code}`, player.id, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  });

  return redirect(`/r/${short_code}`, 302);
};
