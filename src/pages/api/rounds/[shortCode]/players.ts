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
  const csrf = assertSameOriginPost(request);
  if (csrf) return csrf;

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
  const csrf = assertSameOriginPost(request);
  if (csrf) return csrf;

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
  // The orga can remove any non-creator row while the round is in lobby
  // (requireCreator already enforced status === 'lobby'). Claimed players
  // get evicted along with their scores via the FK `on delete cascade`.
  // The creator can't remove themselves: blocked by .eq('is_creator', false).
  const { data: deleted, error } = await sb
    .from('round_players')
    .delete()
    .eq('id', idParsed.data)
    .eq('round_id', guard.roundId)
    .eq('is_creator', false)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[api/rounds/players] delete failed', error);
    return new Response('Suppression impossible', { status: 500 });
  }
  if (!deleted) {
    return new Response('Ce joueur ne peut pas être retiré.', { status: 409 });
  }
  return new Response(null, { status: 204 });
};
