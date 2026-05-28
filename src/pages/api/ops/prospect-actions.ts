import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { uuidSchema } from '../../../lib/validation/schemas';
import { safeNextPath } from '../../../lib/safe-redirect';

export const prerender = false;

function nullable(v: FormDataEntryValue | null, maxLen = 2000): string | null {
  if (v == null) return null;
  const s = String(v).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

function parseUuid(raw: unknown): string | null {
  const r = uuidSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function parseDate(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
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
  const action = String(form.get('action') ?? '');
  const sb = serviceClient();
  const back = safeBack(request.headers.get('referer'), url.origin, '/ops');

  try {
    if (action === 'create') {
      const prospect_id = parseUuid(form.get('prospect_id'));
      if (!prospect_id) return new Response('invalid prospect_id', { status: 400 });
      const due_on = parseDate(form.get('due_on'));
      if (!due_on) return new Response('date requise', { status: 400 });

      const { error } = await sb
        .from('prospect_actions')
        .insert({ prospect_id, due_on, note: nullable(form.get('note')) });
      if (error) {
        console.error('[api/ops/prospect-actions] create failed', error);
        return new Response('Create failed', { status: 500 });
      }
      return redirect(back, 302);
    }

    if (action === 'update') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });
      const due_on = parseDate(form.get('due_on'));
      if (!due_on) return new Response('date requise', { status: 400 });

      const { error } = await sb
        .from('prospect_actions')
        .update({ due_on, note: nullable(form.get('note')) })
        .eq('id', id);
      if (error) {
        console.error('[api/ops/prospect-actions] update failed', error);
        return new Response('Update failed', { status: 500 });
      }
      return redirect(back, 302);
    }

    if (action === 'complete') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const { data: row } = await sb
        .from('prospect_actions')
        .select('prospect_id, note')
        .eq('id', id)
        .maybeSingle();

      const { error } = await sb
        .from('prospect_actions')
        .update({ done: true, done_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error('[api/ops/prospect-actions] complete failed', error);
        return new Response('Complete failed', { status: 500 });
      }

      if (row) {
        await sb.from('prospect_events').insert({
          prospect_id: row.prospect_id,
          type: 'note',
          body: row.note ? `Action faite — ${row.note}` : 'Action faite',
          author: user.email,
        });
      }
      return redirect(back, 302);
    }

    if (action === 'delete') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });
      const { error } = await sb.from('prospect_actions').delete().eq('id', id);
      if (error) {
        console.error('[api/ops/prospect-actions] delete failed', error);
        return new Response('Delete failed', { status: 500 });
      }
      return redirect(back, 302);
    }

    return new Response('Bad request', { status: 400 });
  } catch (e) {
    console.error('[api/ops/prospect-actions] unexpected', e);
    return new Response('Internal error', { status: 500 });
  }
};
