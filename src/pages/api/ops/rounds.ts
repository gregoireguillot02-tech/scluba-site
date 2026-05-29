import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { uuidSchema } from '../../../lib/validation/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const sb = serviceClient();

  // Remise à zéro des stats d'un club : supprime toutes ses parties. Les
  // round_players et scores partent en cascade (FK on delete cascade, 0002).
  if (action === 'reset') {
    const parsed = uuidSchema.safeParse(form.get('club_id'));
    if (!parsed.success) return new Response('invalid club_id', { status: 400 });
    const clubId = parsed.data;
    const { error } = await sb.from('rounds').delete().eq('club_id', clubId);
    if (error) {
      console.error('[api/ops/rounds] reset failed', error);
      return new Response('Reset failed', { status: 500 });
    }
    return redirect(`/ops/activite/${clubId}`, 302);
  }

  return new Response('Bad request', { status: 400 });
};
