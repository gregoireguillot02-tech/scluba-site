import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import { shortCodeSchema, uuidSchema } from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ params, redirect, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const playerCookie = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value ?? '';
  const playerParsed = uuidSchema.safeParse(playerCookie);
  if (!playerParsed.success) return new Response('Not a player in this round', { status: 403 });
  const playerId = playerParsed.data;

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
