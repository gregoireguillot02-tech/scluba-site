import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../../lib/supabase';
import { uuidSchema } from '../../../../../lib/validation/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  // Middleware : /api/club exige déjà un membership + CSRF same-origin.
  const membership = locals.clubMembership;
  if (!membership) return new Response('Forbidden', { status: 403 });

  const idParsed = uuidSchema.safeParse(params.id ?? '');
  if (!idParsed.success) return new Response('id invalide', { status: 400 });

  const sb = serviceClient();
  // Scoper au club du membre : on ne résout que SES signalements. La garde
  // status='nouveau' évite d'écraser resolved_at/by d'un signalement déjà
  // traité (double-clic, course entre 2 jardiniers). .select() renvoie les
  // lignes modifiées → 404 si rien n'a matché (id inexistant, autre club, ou
  // déjà traité) au lieu d'un ok:true silencieux.
  const { data, error } = await sb
    .from('course_reports')
    // resolved_by = email du membre connecté (la session porte l'email ; plus
    // de user Supabase côté portail, cf. migration 0035 resolved_by → text).
    .update({ status: 'traite', resolved_at: new Date().toISOString(), resolved_by: membership.email })
    .eq('id', idParsed.data)
    .eq('club_id', membership.clubId)
    .eq('status', 'nouveau')
    .select('id');
  if (error) {
    console.error('[api/club/reports/resolve] update failed', error);
    return new Response('Save failed', { status: 500 });
  }
  if (!data || data.length === 0) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
