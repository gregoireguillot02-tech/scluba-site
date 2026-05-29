import type { APIRoute } from 'astro';
import { serviceClient } from '../../../../../lib/supabase';
import { uuidSchema } from '../../../../../lib/validation/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  // Middleware : /api/club exige déjà un membership + CSRF same-origin. Tout
  // membre du club (admin OU jardinier) peut supprimer — la confirmation
  // côté UI évite les suppressions accidentelles.
  const membership = locals.clubMembership;
  if (!membership) return new Response('Forbidden', { status: 403 });

  const idParsed = uuidSchema.safeParse(params.id ?? '');
  if (!idParsed.success) return new Response('id invalide', { status: 400 });

  const sb = serviceClient();
  // Scoper au club du membre : on ne supprime que SES signalements (un id
  // d'un autre club ne matche pas). .select() renvoie les lignes supprimées
  // → 404 si rien n'a matché (id inexistant ou autre club) au lieu d'un
  // ok:true silencieux.
  const { data, error } = await sb
    .from('course_reports')
    .delete()
    .eq('id', idParsed.data)
    .eq('club_id', membership.clubId)
    .select('id');
  if (error) {
    console.error('[api/club/reports/delete] delete failed', error);
    return new Response('Delete failed', { status: 500 });
  }
  if (!data || data.length === 0) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
