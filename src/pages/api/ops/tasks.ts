import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { OWNERS, type Owner } from '../../../lib/ops-types';

export const prerender = false;

function nullable(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? 'create');
  const sb = serviceClient();
  const referer = request.headers.get('referer');
  const back = referer ?? '/ops/todo';

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    if (!title) return new Response('title required', { status: 400 });
    const assignee = (form.get('assignee') as Owner | null) ?? 'shared';
    if (!OWNERS.includes(assignee)) return new Response('bad assignee', { status: 400 });

    const { error } = await sb.from('tasks').insert({
      title,
      description: nullable(form.get('description')),
      assignee,
      due_date: nullable(form.get('due_date')),
      prospect_id: nullable(form.get('prospect_id')),
      created_by: user.email,
    });
    if (error) return new Response(`Create failed: ${error.message}`, { status: 500 });
    return redirect(back, 302);
  }

  if (action === 'toggle') {
    const id = String(form.get('id') ?? '');
    const done = String(form.get('done') ?? 'true') === 'true';
    if (!id) return new Response('id required', { status: 400 });
    const { error } = await sb
      .from('tasks')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) return new Response(`Toggle failed: ${error.message}`, { status: 500 });
    return redirect(back, 302);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) return new Response(`Delete failed: ${error.message}`, { status: 500 });
    return redirect(back, 302);
  }

  return new Response(`Unknown action: ${action}`, { status: 400 });
};
