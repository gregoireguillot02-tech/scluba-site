import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../lib/supabase';
import { shortCodeSchema, uuidSchema } from '../../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const POST: APIRoute = async ({ params, redirect, cookies }) => {
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
    .select('id, status, scoring_mode')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!round) return new Response('Round not found', { status: 404 });

  // Only the creator can press "C'est parti" — others see the button but a
  // direct POST from a non-creator must be refused.
  const { data: player } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', playerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!player) return new Response('Not a player in this round', { status: 403 });
  if (!player.is_creator) {
    return new Response('Seul l\'organisateur peut démarrer la partie.', { status: 403 });
  }

  if (round.status === 'lobby') {
    // Gating sur les placeholders non claimed n'est pertinent qu'en mode
    // 'each' (chacun saisit pour soi → sans device, pas de scores). En
    // mode 'host', le créateur marque pour tout le monde, donc un
    // joueur qui n'a jamais scanné peut quand même apparaître sur la
    // carte. On laisse le démarrage. S'il scanne après, claim.ts
    // accepte tant que status !== 'finished' → il rejoint le live en
    // mode spectateur.
    if (round.scoring_mode !== 'host') {
      const { count: pendingCount, error: cntErr } = await sb
        .from('round_players')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', round.id)
        .is('claimed_at', null);
      if (cntErr) {
        console.error('[api/rounds/start] count failed', cntErr);
        return new Response('Vérification impossible', { status: 500 });
      }
      if ((pendingCount ?? 0) > 0) {
        return new Response(
          `Encore ${pendingCount} joueur(s) à rejoindre. Patiente ou retire les absents.`,
          { status: 409 },
        );
      }
    }

    await sb
      .from('rounds')
      .update({ status: 'playing', started_at: new Date().toISOString() })
      .eq('id', round.id);
  }

  return redirect(`/r/${shortCode}/play`, 302);
};
