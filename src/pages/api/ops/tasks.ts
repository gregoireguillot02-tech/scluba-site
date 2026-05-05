import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { OWNERS, type Owner } from '../../../lib/ops-types';
import { isValidUuid } from '../../../lib/validators';
import { safeNextPath } from '../../../lib/safe-redirect';

export const prerender = false;

function nullable(v: FormDataEntryValue | null, maxLen = 1000): string | null {
  if (v == null) return null;
  const s = String(v).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

function safeBack(refererHeader: string | null, origin: string, fallback: string): string {
  if (!refererHeader) return fallback;
  try {
    const u = new URL(refererHeader);
    if (u.origin !== origin) return fallback;
    return safeNextPath(u.pathname + u.search, fallback);
  } catch {
    return fallback;
  }
}

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? 'create');
  const sb = serviceClient();
  const back = safeBack(request.headers.get('referer'), url.origin, '/ops/todo');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim().slice(0, 500);
    if (!title) return new Response('title required', { status: 400 });
    const assignee = (form.get('assignee') as Owner | null) ?? 'shared';
    if (!OWNERS.includes(assignee)) return new Response('bad assignee', { status: 400 });
    const prospectIdRaw = nullable(form.get('prospect_id'));
    if (prospectIdRaw && !isValidUuid(prospectIdRaw)) return new Response('bad prospect_id', { status: 400 });

    const { error } = await sb.from('tasks').insert({
      title,
      description: nullable(form.get('description'), 4000),
      assignee,
      due_date: nullable(form.get('due_date'), 32),
      prospect_id: prospectIdRaw,
      created_by: user.email,
    });
    if (error) {
      console.error('[api/ops/tasks] create failed', error);
      return new Response('Create failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  if (action === 'toggle') {
    const id = String(form.get('id') ?? '');
    const done = String(form.get('done') ?? 'true') === 'true';
    if (!isValidUuid(id)) return new Response('invalid id', { status: 400 });
    const { error } = await sb
      .from('tasks')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) {
      console.error('[api/ops/tasks] toggle failed', error);
      return new Response('Toggle failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!isValidUuid(id)) return new Response('invalid id', { status: 400 });
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) {
      console.error('[api/ops/tasks] delete failed', error);
      return new Response('Delete failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  return new Response('Bad request', { status: 400 });
};
