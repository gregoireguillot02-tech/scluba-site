import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../../lib/supabase';
import { EVENT_TYPES, type EventType } from '../../../../../lib/ops-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const id = params.id;
  if (!id) return new Response('Missing prospect id', { status: 400 });

  const form = await request.formData();
  const type = (form.get('type') as EventType | null) ?? 'note';
  const body = String(form.get('body') ?? '').trim() || null;

  if (!EVENT_TYPES.includes(type)) return new Response('bad event type', { status: 400 });

  const sb = serviceClient();
  const { error } = await sb.from('prospect_events').insert({
    prospect_id: id,
    type,
    body,
    author: user.email,
  });
  if (error) return new Response(`Insert failed: ${error.message}`, { status: 500 });

  return redirect(`/ops/prospects/${id}`, 302);
};
