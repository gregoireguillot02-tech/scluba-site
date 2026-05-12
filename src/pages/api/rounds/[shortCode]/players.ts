import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import {
  addPlayerSchema,
  shortCodeSchema,
  uuidSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

// Helper: verify the cookie identifies the creator of this round. Returns
// the round id on success, or a Response to return on failure.
async function requireCreator(
  shortCode: string,
  cookieValue: string | undefined,
): Promise<{ roundId: string } | Response> {
  const playerParsed = uuidSchema.safeParse(cookieValue ?? '');
  if (!playerParsed.success) return new Response('Pas autorisé', { status: 403 });

  const sb = serviceClient();
  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Partie introuvable', { status: 404 });
  if (round.status !== 'lobby') {
    return new Response('Modifications impossibles après le démarrage', { status: 409 });
  }

  const { data: player } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', playerParsed.data)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player || !player.is_creator) {
    return new Response('Seul l\'organisateur peut modifier la liste', { status: 403 });
  }
  return { roundId: round.id };
}

// Organizer adds another name after the QR has been shown.
export const POST: APIRoute = async ({ request, params, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const guard = await requireCreator(shortCode, cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value);
  if (guard instanceof Response) return guard;

  const form = await request.formData();
  const parsed = addPlayerSchema.safeParse({
    display_name: form.get('display_name') ?? '',
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();
  const { error } = await sb.from('round_players').insert({
    round_id: guard.roundId,
    display_name: parsed.data.display_name,
    is_creator: false,
    user_id: null,
    claimed_at: null,
  });
  if (error) {
    console.error('[api/rounds/players] insert failed', error);
    return new Response('Ajout impossible', { status: 500 });
  }
  return new Response(null, { status: 204 });
};

// Organizer removes a placeholder (unclaimed) row.
export const DELETE: APIRoute = async ({ request, params, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const guard = await requireCreator(shortCode, cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value);
  if (guard instanceof Response) return guard;

  // Browsers don't send a body for DELETE through plain forms, so we accept
  // the target id either in a JSON body or the query string.
  const url = new URL(request.url);
  let rawId = url.searchParams.get('id') ?? '';
  if (!rawId) {
    try {
      const body = await request.json();
      if (body && typeof body.id === 'string') rawId = body.id;
    } catch {
      // ignore - id may have come from the query string
    }
  }
  const idParsed = uuidSchema.safeParse(rawId);
  if (!idParsed.success) return new Response('id manquant', { status: 400 });

  const sb = serviceClient();
  // Only allow deletion of placeholder rows (not yet claimed) and never the
  // creator, to avoid evicting a real player by mistake.
  const { data: deleted, error } = await sb
    .from('round_players')
    .delete()
    .eq('id', idParsed.data)
    .eq('round_id', guard.roundId)
    .is('claimed_at', null)
    .eq('is_creator', false)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[api/rounds/players] delete failed', error);
    return new Response('Suppression impossible', { status: 500 });
  }
  if (!deleted) {
    return new Response('Ce joueur ne peut plus être retiré (déjà connecté ou inconnu)', { status: 409 });
  }
  return new Response(null, { status: 204 });
};
