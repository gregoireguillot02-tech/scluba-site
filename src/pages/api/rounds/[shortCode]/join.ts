import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../../lib/supabase';
import {
  joinRoundSchema,
  shortCodeSchema,
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

export const POST: APIRoute = async ({ request, params, redirect, cookies }) => {
  const csrf = assertSameOriginPost(request);
  if (csrf) return csrf;

  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const form = await request.formData();
  const parsed = joinRoundSchema.safeParse({
    display_name: form.get('display_name') ?? '',
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const { display_name } = parsed.data;

  const sb = serviceClient();

  const { data: round } = await sb
    .from('rounds')
    .select('id, status')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Code introuvable. Vérifie avec ton ami.', { status: 404 });
  if (round.status === 'finished') {
    return new Response('Cette partie est déjà terminée.', { status: 409 });
  }

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

  // If the organizer pre-typed this person's name as a placeholder, claim
  // that row instead of inserting a duplicate. The .is('claimed_at', null)
  // filter guards against two devices claiming the same slot concurrently;
  // whichever update returns a row wins, the other falls through to insert.
  const { data: claimed, error: claimErr } = await sb
    .from('round_players')
    .update({
      claimed_at: nowIso,
      user_id: user?.id ?? null,
    })
    .eq('round_id', round.id)
    .is('claimed_at', null)
    .ilike('display_name', display_name)
    .select('id')
    .maybeSingle();
  if (claimErr) {
    console.error('[api/rounds/join] claim attempt failed', claimErr);
    return new Response('Join failed', { status: 500 });
  }

  let playerId: string;
  if (claimed) {
    playerId = claimed.id;
  } else {
    const { data: player, error: pErr } = await sb
      .from('round_players')
      .insert({
        round_id: round.id,
        display_name,
        is_creator: false,
        user_id: user?.id ?? null,
        claimed_at: nowIso,
      })
      .select('id')
      .single();
    if (pErr) {
      console.error('[api/rounds/join] insert failed', pErr);
      return new Response('Join failed', { status: 500 });
    }
    playerId = player.id;
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
