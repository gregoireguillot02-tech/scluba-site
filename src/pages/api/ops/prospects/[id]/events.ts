import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../../lib/supabase';
import { EVENT_TYPES, type EventType } from '../../../../../lib/ops-types';
import { uuidSchema } from '../../../../../lib/validation/schemas';

export const prerender = false;

const MAX_BODY_LENGTH = 4000;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const idParsed = uuidSchema.safeParse(params.id ?? '');
  if (!idParsed.success) return new Response('invalid prospect id', { status: 400 });
  const id = idParsed.data;

  const form = await request.formData();
  const type = (form.get('type') as EventType | null) ?? 'note';
  const rawBody = String(form.get('body') ?? '').trim();
  const body = rawBody ? rawBody.slice(0, MAX_BODY_LENGTH) : null;

  if (!EVENT_TYPES.includes(type)) return new Response('bad event type', { status: 400 });

  const sb = serviceClient();

  // Verify the prospect exists before inserting — avoids leaking FK error
  // text and prevents writes against non-existent IDs.
  const { data: prospect } = await sb.from('prospects').select('id').eq('id', id).maybeSingle();
  if (!prospect) return new Response('Prospect not found', { status: 404 });

  const { error } = await sb.from('prospect_events').insert({
    prospect_id: id,
    type,
    body,
    author: user.email,
  });
  if (error) {
    console.error('[api/ops/prospects/[id]/events] insert failed', error);
    return new Response('Insert failed', { status: 500 });
  }

  return redirect(`/ops/prospects/${id}`, 302);
};
