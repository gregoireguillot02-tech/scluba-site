import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import {
  shortCodeSchema,
  scoreSchema,
  uuidSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const playerCookie = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value ?? '';
  const playerParsed = uuidSchema.safeParse(playerCookie);
  if (!playerParsed.success) return new Response('Not a player in this round', { status: 403 });
  const callerId = playerParsed.data;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') return new Response('Invalid JSON', { status: 400 });
  const parsed = scoreSchema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const { hole } = parsed.data;
  const pickedUp = parsed.data.picked_up === true;
  const strokes = pickedUp ? null : (parsed.data.strokes ?? null);
  const targetPlayerHint = parsed.data.player_id ?? null;

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Round not found', { status: 404 });
  if (round.status === 'finished') return new Response('Round is finished', { status: 409 });

  // Le caller (identifié par cookie) doit être dans cette partie. On récupère
  // aussi `is_creator` pour décider si la saisie au nom d'un autre joueur est
  // autorisée.
  const { data: caller } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', callerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!caller) return new Response('Player not in this round', { status: 403 });

  // Détermine le joueur dont on enregistre le score. Si player_id est fourni
  // ET diffère du caller : seul le créateur peut saisir au nom d'un autre
  // (mode multi-joueurs sur un seul tel). Sinon on retombe sur l'auteur.
  let targetPlayerId = callerId;
  if (targetPlayerHint && targetPlayerHint !== callerId) {
    if (!caller.is_creator) {
      return new Response('Only the round creator can score for other players', { status: 403 });
    }
    const { data: targetPlayer } = await sb
      .from('round_players')
      .select('id')
      .eq('id', targetPlayerHint)
      .eq('round_id', round.id)
      .maybeSingle();
    if (!targetPlayer) return new Response('Target player not in this round', { status: 404 });
    targetPlayerId = targetPlayerHint;
  }

  const { error } = await sb
    .from('scores')
    .upsert(
      { round_player_id: targetPlayerId, hole_number: hole, strokes, picked_up: pickedUp },
      { onConflict: 'round_player_id,hole_number' },
    );
  if (error) {
    console.error('[api/rounds/scores] upsert failed', error);
    return new Response('Save failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
