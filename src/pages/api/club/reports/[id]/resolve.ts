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
  // Scoper au club du membre : on ne résout que SES signalements.
  const { error } = await sb
    .from('course_reports')
    .update({ status: 'traite', resolved_at: new Date().toISOString(), resolved_by: locals.user!.id })
    .eq('id', idParsed.data)
    .eq('club_id', membership.clubId);
  if (error) {
    console.error('[api/club/reports/resolve] update failed', error);
    return new Response('Save failed', { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
