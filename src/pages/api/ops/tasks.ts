import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { OWNERS, TASK_STATUSES, type Owner, type TaskStatus } from '../../../lib/ops-types';
import { uuidSchema } from '../../../lib/validation/schemas';
import { safeNextPath } from '../../../lib/safe-redirect';

export const prerender = false;

function nullable(v: FormDataEntryValue | null, maxLen = 1000): string | null {
  if (v == null) return null;
  const s = String(v).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

function parseUuid(raw: unknown): string | null {
  const r = uuidSchema.safeParse(raw);
  return r.success ? r.data : null;
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
    const prospectIdRaw = nullable(form.get('prospect_id'), 64);
    const prospect_id = prospectIdRaw ? parseUuid(prospectIdRaw) : null;
    if (prospectIdRaw && !prospect_id) return new Response('bad prospect_id', { status: 400 });

    const { error } = await sb.from('tasks').insert({
      title,
      description: nullable(form.get('description'), 4000),
      assignee,
      due_date: nullable(form.get('due_date'), 32),
      prospect_id,
      created_by: user.email,
    });
    if (error) {
      console.error('[api/ops/tasks] create failed', error);
      return new Response('Create failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  if (action === 'toggle') {
    const id = parseUuid(form.get('id'));
    if (!id) return new Response('invalid id', { status: 400 });
    const done = String(form.get('done') ?? 'true') === 'true';
    const { error } = await sb
      .from('tasks')
      .update({
        done,
        done_at: done ? new Date().toISOString() : null,
        status: done ? 'done' : 'todo',
      })
      .eq('id', id);
    if (error) {
      console.error('[api/ops/tasks] toggle failed', error);
      return new Response('Toggle failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  if (action === 'set_status') {
    const id = parseUuid(form.get('id'));
    if (!id) return new Response('invalid id', { status: 400 });
    const raw = String(form.get('status') ?? '');
    if (!TASK_STATUSES.includes(raw as TaskStatus)) {
      return new Response('bad status', { status: 400 });
    }
    const status = raw as TaskStatus;
    const done = status === 'done';
    const { error } = await sb
      .from('tasks')
      .update({
        status,
        done,
        done_at: done ? new Date().toISOString() : null,
      })
      .eq('id', id);
    if (error) {
      console.error('[api/ops/tasks] set_status failed', error);
      return new Response('Set status failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  if (action === 'delete') {
    const id = parseUuid(form.get('id'));
    if (!id) return new Response('invalid id', { status: 400 });
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) {
      console.error('[api/ops/tasks] delete failed', error);
      return new Response('Delete failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  return new Response('Bad request', { status: 400 });
};
