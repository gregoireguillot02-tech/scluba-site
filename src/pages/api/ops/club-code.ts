import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient } from '../../../lib/supabase';
import { uuidSchema, formatZodError } from '../../../lib/validation/schemas';
import { generateClubCode } from '../../../lib/club-code';

export const prerender = false;

// Auth + allowlist /ops + CSRF same-origin déjà appliqués par le middleware
// (préfixes /api/ops). Génère (ou régénère) le mot de passe du Portail Club.
// Régénérer = révoquer l'ancien : les sessions existantes restent valides
// jusqu'à expiration, mais plus personne ne peut se reconnecter avec l'ancien.
const schema = z.object({ club_id: uuidSchema });

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();
  const { data: club } = await sb
    .from('clubs')
    .select('id, name')
    .eq('id', parsed.data.club_id)
    .maybeSingle();
  if (!club) return new Response('Club introuvable', { status: 404 });

  const code = generateClubCode(club.name);
  const { error } = await sb.from('clubs').update({ portal_code: code }).eq('id', club.id);
  if (error) {
    console.error('[api/ops/club-code] update failed', error);
    return new Response('Enregistrement échoué', { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, code }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
