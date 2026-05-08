import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const shortCode = params.shortCode ?? '';
  if (!shortCode) return new Response('shortCode required', { status: 400 });

  const playerId = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value;
  if (!playerId) return new Response('Not a player in this round', { status: 403 });

  const body = await request.json().catch(() => null) as { hole: number; strokes: number } | null;
  if (!body) return new Response('Invalid JSON', { status: 400 });
  const { hole, strokes } = body;
  if (typeof hole !== 'number' || hole < 1 || hole > 18) return new Response('hole must be 1..18', { status: 400 });
  if (typeof strokes !== 'number' || strokes < 1 || strokes > 20) return new Response('strokes must be 1..20', { status: 400 });

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Round not found', { status: 404 });
  if (round.status === 'finished') return new Response('Round is finished', { status: 409 });

  const { data: player } = await sb
    .from('round_players')
    .select('id')
    .eq('id', playerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player) return new Response('Player not in this round', { status: 403 });

  const { error } = await sb
    .from('scores')
    .upsert(
      { round_player_id: playerId, hole_number: hole, strokes },
      { onConflict: 'round_player_id,hole_number' },
    );
  if (error) return new Response(`Save failed: ${error.message}`, { status: 500 });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
