import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const club_name = String(form.get('club_name') ?? '').trim().slice(0, 255);
  if (!club_name) return new Response('club_name required', { status: 400 });

  const sb = serviceClient();
  const { data, error } = await sb
    .from('prospects')
    .insert({
      club_name,
      contact_name: String(form.get('contact_name') ?? '').trim().slice(0, 255) || null,
      email: String(form.get('email') ?? '').trim().slice(0, 320) || null,
      source: String(form.get('source') ?? '').trim().slice(0, 255) || 'CTA',
      status: 'in_discussion',
      owner: 'shared',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/ops/prospects/from-lead] insert failed', error);
    return new Response('Insert failed', { status: 500 });
  }

  await sb.from('prospect_events').insert({
    prospect_id: data.id,
    type: 'note',
    body: 'Importé depuis le formulaire CTA scluba.com',
    author: user.email,
  });

  return redirect(`/ops/prospects/${data.id}`, 302);
};
