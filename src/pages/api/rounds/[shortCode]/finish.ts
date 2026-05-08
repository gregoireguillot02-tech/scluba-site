import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ params, redirect, cookies }) => {
  const shortCode = params.shortCode ?? '';
  if (!shortCode) return new Response('shortCode required', { status: 400 });

  const playerId = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value;
  if (!playerId) return new Response('Not a player in this round', { status: 403 });

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Round not found', { status: 404 });

  const { data: player } = await sb
    .from('round_players')
    .select('id')
    .eq('id', playerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player) return new Response('Player not in this round', { status: 403 });

  if (round.status !== 'finished') {
    await sb
      .from('rounds')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', round.id);
  }

  return redirect(`/r/${shortCode}/recap`, 302);
};
