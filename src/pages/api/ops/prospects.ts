import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { PROSPECT_STATUSES, OWNERS, type ProspectStatus, type Owner } from '../../../lib/ops-types';
import { isValidUuid } from '../../../lib/validators';

export const prerender = false;

function backTo(url: URL, fallback = '/ops/prospects'): string {
  return url.searchParams.get('return_to') || fallback;
}

function nullable(value: FormDataEntryValue | null, maxLen = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'create');
  const sb = serviceClient();

  try {
    if (action === 'create') {
      const club_name = String(form.get('club_name') ?? '').trim().slice(0, 255);
      if (!club_name) return new Response('club_name required', { status: 400 });

      const status = (form.get('status') as ProspectStatus | null) ?? 'to_contact';
      const owner = (form.get('owner') as Owner | null) ?? 'shared';
      if (!PROSPECT_STATUSES.includes(status)) return new Response('bad status', { status: 400 });
      if (!OWNERS.includes(owner)) return new Response('bad owner', { status: 400 });

      const { data, error } = await sb
        .from('prospects')
        .insert({
          club_name,
          contact_name: nullable(form.get('contact_name'), 255),
          email: nullable(form.get('email'), 320),
          phone: nullable(form.get('phone'), 64),
          city: nullable(form.get('city'), 120),
          region: nullable(form.get('region'), 120),
          status,
          owner,
          source: nullable(form.get('source'), 255),
          notes: nullable(form.get('notes'), 4000),
        })
        .select('id')
        .single();
      if (error) {
        console.error('[api/ops/prospects] create failed', error);
        return new Response('Create failed', { status: 500 });
      }

      await sb.from('prospect_events').insert({
        prospect_id: data.id,
        type: 'note',
        body: 'Prospect créé',
        author: user.email,
      });

      return redirect(`/ops/prospects/${data.id}`, 302);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!isValidUuid(id)) return new Response('invalid id', { status: 400 });

      const { data: prev } = await sb.from('prospects').select('status').eq('id', id).maybeSingle();
      const newStatus = form.get('status') as ProspectStatus | null;
      if (newStatus && !PROSPECT_STATUSES.includes(newStatus)) {
        return new Response('bad status', { status: 400 });
      }
      const newOwner = form.get('owner') as Owner | null;
      if (newOwner && !OWNERS.includes(newOwner)) {
        return new Response('bad owner', { status: 400 });
      }

      const club_name = String(form.get('club_name') ?? '').trim().slice(0, 255);
      if (!club_name) return new Response('club_name required', { status: 400 });

      const updates = {
        club_name,
        contact_name: nullable(form.get('contact_name'), 255),
        email: nullable(form.get('email'), 320),
        phone: nullable(form.get('phone'), 64),
        city: nullable(form.get('city'), 120),
        region: nullable(form.get('region'), 120),
        status: newStatus ?? undefined,
        owner: newOwner ?? undefined,
        source: nullable(form.get('source'), 255),
        notes: nullable(form.get('notes'), 4000),
      };

      const { error } = await sb.from('prospects').update(updates).eq('id', id);
      if (error) {
        console.error('[api/ops/prospects] update failed', error);
        return new Response('Update failed', { status: 500 });
      }

      if (prev && newStatus && prev.status !== newStatus) {
        await sb.from('prospect_events').insert({
          prospect_id: id,
          type: 'status_change',
          body: `${prev.status} → ${newStatus}`,
          author: user.email,
        });
      }

      return redirect(`/ops/prospects/${id}`, 302);
    }

    if (action === 'delete') {
      const id = String(form.get('id') ?? '');
      if (!isValidUuid(id)) return new Response('invalid id', { status: 400 });
      const { error } = await sb.from('prospects').delete().eq('id', id);
      if (error) {
        console.error('[api/ops/prospects] delete failed', error);
        return new Response('Delete failed', { status: 500 });
      }
      return redirect('/ops/prospects', 302);
    }

    return new Response('Bad request', { status: 400 });
  } catch (e) {
    console.error('[api/ops/prospects] unexpected', e);
    return new Response('Internal error', { status: 500 });
  }
};
