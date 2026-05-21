import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import { shortCodeSchema, uuidSchema } from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

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

  // Only the creator can finish the round. Any other player (including
  // spectators in scoring_mode='host') sees the recap once the creator
  // flips status. (audit HIGH: anyone-in-round can grief the foursome.)
  const { data: player } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', playerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player) return new Response('Player not in this round', { status: 403 });
  if (!player.is_creator) {
    return new Response('Seul l\'organisateur peut terminer la partie.', { status: 403 });
  }

  if (round.status !== 'finished') {
    await sb
      .from('rounds')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', round.id);
  }

  return redirect(`/r/${shortCode}/recap`, 302);
};
