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

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  // Seul un joueur de la partie peut commenter (auth par cookie).
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

  // Vérifie que le joueur est bien dans cette partie.
  const { data: round } = await sb
    .from('rounds')
    .select('id')
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

  // Un commentaire par round (pas par joueur) pour simplifier. Si l'app
  // souhaite plus tard un commentaire par joueur, prévoir une colonne dédiée
  // sur `round_players` ou une table jointe.
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
