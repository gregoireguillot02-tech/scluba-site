import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient } from '../../../../lib/supabase';
import { shortCodeSchema, uuidSchema } from '../../../../lib/validation/schemas';
import type { Club, Round } from '../../../../lib/clubs-types';
import { resolveRoundHoles } from '../../../../lib/clubs-types';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

const finishBodySchema = z
  .object({
    confirm_incomplete: z.boolean().optional(),
  })
  .optional();

export const POST: APIRoute = async ({ params, request, redirect, cookies }) => {
  const codeParsed = shortCodeSchema.safeParse(params.shortCode ?? '');
  if (!codeParsed.success) return new Response('code de partie invalide', { status: 400 });
  const shortCode = codeParsed.data;

  const playerCookie = cookies.get(`${PLAYER_COOKIE_PREFIX}${shortCode}`)?.value ?? '';
  const playerParsed = uuidSchema.safeParse(playerCookie);
  if (!playerParsed.success) return new Response('Not a player in this round', { status: 403 });
  const callerId = playerParsed.data;

  // Body optionnel : tolère un POST de form classique (corps vide) ou un fetch
  // JSON depuis l'UI. Seule l'UI JS passe `confirm_incomplete: true` après
  // que l'utilisateur ait accepté l'auto pick-up des trous manquants.
  let confirmIncomplete = false;
  const ctype = request.headers.get('content-type') ?? '';
  if (ctype.includes('application/json')) {
    const rawBody = await request.json().catch(() => null);
    const parsed = finishBodySchema.safeParse(rawBody);
    if (parsed.success && parsed.data) {
      confirmIncomplete = parsed.data.confirm_incomplete === true;
    }
  }

  const sb = serviceClient();

  const { data: roundRow } = await sb
    .from('rounds')
    .select('*, club:clubs(*)')
    .eq('short_code', shortCode)
    .maybeSingle();
  if (!roundRow) return new Response('Round not found', { status: 404 });
  const round = roundRow as Round & { club: Club };

  const { data: caller } = await sb
    .from('round_players')
    .select('id, is_creator')
    .eq('id', callerId)
    .eq('round_id', round.id)
    .maybeSingle();
  if (!caller) return new Response('Player not in this round', { status: 403 });
  // Seul le créateur peut clôturer la partie. Les autres joueurs ont un
  // bouton "Quitter" purement client-side qui ne touche pas au statut.
  if (!caller.is_creator) {
    return new Response('Only the round creator can finish the round', { status: 403 });
  }

  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  // Idempotent : si déjà terminée, on renvoie juste vers le recap.
  if (round.status === 'finished') {
    if (wantsJson) {
      return new Response(
        JSON.stringify({ ok: true, redirectTo: `/r/${shortCode}/recap` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return redirect(`/r/${shortCode}/recap`, 302);
  }

  // Calcule les tuples (player, trou) manquants.
  const expectedHoles = resolveRoundHoles(round, round.club).map((h) => h.number);
  const { data: allPlayersRaw } = await sb
    .from('round_players')
    .select('id, display_name')
    .eq('round_id', round.id);
  const allPlayers = (allPlayersRaw ?? []) as { id: string; display_name: string }[];
  const playerIds = allPlayers.map((p) => p.id);

  const { data: existingScoresRaw } = playerIds.length
    ? await sb
        .from('scores')
        .select('round_player_id, hole_number')
        .in('round_player_id', playerIds)
    : { data: [] as { round_player_id: string; hole_number: number }[] };
  const existingScores = (existingScoresRaw ?? []) as { round_player_id: string; hole_number: number }[];
  const filledByPlayer = new Map<string, Set<number>>();
  for (const s of existingScores) {
    const set = filledByPlayer.get(s.round_player_id) ?? new Set<number>();
    set.add(s.hole_number);
    filledByPlayer.set(s.round_player_id, set);
  }

  type MissingEntry = { player_id: string; display_name: string; holes: number[] };
  const missing: MissingEntry[] = [];
  for (const p of allPlayers) {
    const filled = filledByPlayer.get(p.id) ?? new Set<number>();
    const holes = expectedHoles.filter((h) => !filled.has(h));
    if (holes.length > 0) {
      missing.push({ player_id: p.id, display_name: p.display_name, holes });
    }
  }

  if (missing.length > 0 && !confirmIncomplete) {
    return new Response(
      JSON.stringify({ code: 'missing_scores', missing }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Auto pick-up des trous manquants ("chablis" — compté Par+2 dans le recap).
  if (missing.length > 0) {
    const rows = missing.flatMap((m) =>
      m.holes.map((hole_number) => ({
        round_player_id: m.player_id,
        hole_number,
        strokes: null,
        picked_up: true,
      })),
    );
    if (rows.length > 0) {
      const { error: upsertErr } = await sb
        .from('scores')
        .upsert(rows, { onConflict: 'round_player_id,hole_number' });
      if (upsertErr) {
        console.error('[api/rounds/finish] auto pick-up failed', upsertErr);
        return new Response('Save failed', { status: 500 });
      }
    }
  }

  const { error: updateErr } = await sb
    .from('rounds')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('id', round.id);
  if (updateErr) {
    console.error('[api/rounds/finish] status update failed', updateErr);
    return new Response('Save failed', { status: 500 });
  }

  if (wantsJson) {
    return new Response(
      JSON.stringify({ ok: true, redirectTo: `/r/${shortCode}/recap` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return redirect(`/r/${shortCode}/recap`, 302);
};
