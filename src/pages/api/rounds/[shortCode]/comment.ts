import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient } from '../../../../lib/supabase';
import {
  shortCodeSchema,
  uuidSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

// Commentaire libre sur la partie (saisi sur la page recap). Limite raisonnable
// pour éviter qu'un troll envoie 10 000 chars qui débordent du PNG partagé.
const commentSchema = z.object({
  comment: z.string().trim().max(200, 'commentaire trop long (200 max)'),
});

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

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const csrf = assertSameOriginPost(request);
  if (csrf) return csrf;

  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const playerCookie = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value ?? '';
  const playerParsed = uuidSchema.safeParse(playerCookie);
  if (!playerParsed.success) return new Response('Not a player in this round', { status: 403 });
  const playerId = playerParsed.data;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') return new Response('Invalid JSON', { status: 400 });
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const commentText = parsed.data.comment.length > 0 ? parsed.data.comment : null;

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Round not found', { status: 404 });

  // Only the round creator can edit the round-wide comment. A future column
  // on round_players will allow per-viewer comments; for now restricting to
  // the creator prevents teammates from overwriting each other's text.
  // (audit HIGH: anyone-in-round can replace the recap comment + brand
  // text on the share-card PNG.)
  const { data: player } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', playerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player) return new Response('Player not in this round', { status: 403 });
  if (!player.is_creator) {
    return new Response('Seul l\'organisateur peut modifier le commentaire.', { status: 403 });
  }

  const { error } = await sb
    .from('rounds')
    .update({ comment: commentText })
    .eq('id', round.id);
  if (error) {
    console.error('[api/rounds/comment] update failed', error);
    return new Response('Save failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, comment: commentText }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
