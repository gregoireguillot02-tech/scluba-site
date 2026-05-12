import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../../lib/supabase';
import {
  claimSlotSchema,
  shortCodeSchema,
  formatZodError,
} from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

// Called from /r/[shortCode]/join when a scanner picks a name from the
// organizer's list (placeholder_id) or self-adds (display_name).
export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const form = await request.formData();
  const rawPlaceholder = form.get('placeholder_id');
  const rawName = form.get('display_name');
  const parsed = claimSlotSchema.safeParse({
    placeholder_id: typeof rawPlaceholder === 'string' && rawPlaceholder.length > 0 ? rawPlaceholder : undefined,
    display_name: typeof rawName === 'string' && rawName.length > 0 ? rawName : undefined,
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Partie introuvable.', { status: 404 });
  if (round.status === 'finished') {
    return new Response('Cette partie est déjà terminée.', { status: 409 });
  }

  // If this device already has a player cookie for this round, send it back
  // to the lobby/play instead of double-claiming.
  const existing = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value;
  if (existing) {
    const { data: alreadyIn } = await sb
      .from('round_players')
      .select('id')
      .eq('id', existing)
      .eq('round_id', round.id)
      .maybeSingle();
    if (alreadyIn) {
      return redirect(`/r/${shortCode}`, 302);
    }
  }

  const auth = authServerClient(cookies, request.headers);
  const { data: { user } } = await auth.auth.getUser();

  const nowIso = new Date().toISOString();
  let playerId: string;

  if (parsed.data.placeholder_id) {
    // Claim a specific placeholder slot. The .is('claimed_at', null) guard
    // is the concurrency safety net: if two scanners race for the same name,
    // only one update returns a row.
    const { data: claimed, error: claimErr } = await sb
      .from('round_players')
      .update({
        claimed_at: nowIso,
        user_id: user?.id ?? null,
      })
      .eq('id', parsed.data.placeholder_id)
      .eq('round_id', round.id)
      .is('claimed_at', null)
      .select('id')
      .maybeSingle();
    if (claimErr) {
      console.error('[api/rounds/claim] update failed', claimErr);
      return new Response('Claim failed', { status: 500 });
    }
    if (!claimed) {
      return new Response('Ce nom vient d\'être pris par un autre joueur. Choisis-en un autre ou ajoute le tien.', { status: 409 });
    }
    playerId = claimed.id;
  } else if (parsed.data.display_name) {
    // Self-add: name wasn't in the organizer's list.
    const { data: created, error: insErr } = await sb
      .from('round_players')
      .insert({
        round_id: round.id,
        display_name: parsed.data.display_name,
        is_creator: false,
        user_id: user?.id ?? null,
        claimed_at: nowIso,
      })
      .select('id')
      .single();
    if (insErr) {
      console.error('[api/rounds/claim] insert failed', insErr);
      return new Response('Claim failed', { status: 500 });
    }
    playerId = created.id;
  } else {
    return new Response('Requête invalide', { status: 400 });
  }

  cookies.set(`${PLAYER_COOKIE_PREFIX}${shortCode}`, playerId, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });

  return redirect(`/r/${shortCode}`, 302);
};
