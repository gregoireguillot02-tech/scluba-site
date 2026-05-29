import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import {
  shortCodeSchema,
  uuidSchema,
  courseReportSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;
const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ request, params, cookies }) => {
  // CSRF same-origin : assuré par le middleware (préfixe /api/rounds).
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const playerCookie = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value ?? '';
  const playerParsed = uuidSchema.safeParse(playerCookie);
  if (!playerParsed.success) return new Response('Not a player in this round', { status: 403 });
  const playerId = playerParsed.data;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') return new Response('Invalid JSON', { status: 400 });
  const parsed = courseReportSchema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const comment = parsed.data.comment.length > 0 ? parsed.data.comment : null;

  const sb = serviceClient();

  // Résoudre le round + son club, et vérifier que le porteur du cookie est bien
  // un joueur de CE round (rejette cookies stale / cross-round).
  const { data: round } = await sb
    .from('rounds')
    .select('id, club_id')
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

  const { error } = await sb.from('course_reports').insert({
    club_id: round.club_id,
    round_id: round.id,
    hole_number: parsed.data.hole_number,
    category: parsed.data.category,
    comment,
  });
  if (error) {
    console.error('[api/rounds/report] insert failed', error);
    return new Response('Save failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
