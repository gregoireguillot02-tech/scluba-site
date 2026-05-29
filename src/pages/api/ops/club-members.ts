import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient } from '../../../lib/supabase';
import { uuidSchema, emailSchema, formatZodError } from '../../../lib/validation/schemas';

export const prerender = false;

// L'auth + allowlist /ops est déjà appliquée par le middleware (préfixe /api/ops).

const addSchema = z.object({
  club_id: uuidSchema,
  email: emailSchema, // trim + lowercase + validation
  role: z.enum(['admin', 'greenkeeper']),
});

// Ajoute (ou met à jour le rôle d') un membre du club par email.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();
  const { data: club } = await sb.from('clubs').select('id').eq('id', parsed.data.club_id).maybeSingle();
  if (!club) return new Response('Club introuvable', { status: 404 });

  // upsert sur (club_id, email) : ré-ajouter un email existant met juste à jour
  // son rôle (chemin contrôlé de changement de rôle, réservé à /ops).
  const { data, error } = await sb
    .from('club_members')
    .upsert(
      { club_id: parsed.data.club_id, email: parsed.data.email, role: parsed.data.role },
      { onConflict: 'club_id,email' },
    )
    .select('id, email, role')
    .single();
  if (error) {
    console.error('[api/ops/club-members] upsert failed', error);
    return new Response('Enregistrement échoué', { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, member: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Retire un membre (coupe l'accès).
export const DELETE: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = z.object({ id: uuidSchema }).safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();
  const { error } = await sb.from('club_members').delete().eq('id', parsed.data.id);
  if (error) {
    console.error('[api/ops/club-members] delete failed', error);
    return new Response('Suppression échouée', { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
