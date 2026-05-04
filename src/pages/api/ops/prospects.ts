import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { PROSPECT_STATUSES, OWNERS, type ProspectStatus, type Owner } from '../../../lib/ops-types';

export const prerender = false;

function backTo(url: URL, fallback = '/ops/prospects'): string {
  return url.searchParams.get('return_to') || fallback;
}

function nullable(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
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
      const club_name = String(form.get('club_name') ?? '').trim();
      if (!club_name) return new Response('club_name required', { status: 400 });

      const status = (form.get('status') as ProspectStatus | null) ?? 'to_contact';
      const owner = (form.get('owner') as Owner | null) ?? 'shared';
      if (!PROSPECT_STATUSES.includes(status)) return new Response('bad status', { status: 400 });
      if (!OWNERS.includes(owner)) return new Response('bad owner', { status: 400 });

      const { data, error } = await sb
        .from('prospects')
        .insert({
          club_name,
          contact_name: nullable(form.get('contact_name')),
          email: nullable(form.get('email')),
          phone: nullable(form.get('phone')),
          city: nullable(form.get('city')),
          region: nullable(form.get('region')),
          status,
          owner,
          source: nullable(form.get('source')),
          notes: nullable(form.get('notes')),
        })
        .select('id')
        .single();
      if (error) return new Response(`Create failed: ${error.message}`, { status: 500 });

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
      if (!id) return new Response('id required', { status: 400 });

      const { data: prev } = await sb.from('prospects').select('status').eq('id', id).maybeSingle();
      const newStatus = form.get('status') as ProspectStatus | null;

      const updates = {
        club_name: String(form.get('club_name') ?? '').trim(),
        contact_name: nullable(form.get('contact_name')),
        email: nullable(form.get('email')),
        phone: nullable(form.get('phone')),
        city: nullable(form.get('city')),
        region: nullable(form.get('region')),
        status: newStatus ?? undefined,
        owner: (form.get('owner') as Owner | null) ?? undefined,
        source: nullable(form.get('source')),
        notes: nullable(form.get('notes')),
      };

      const { error } = await sb.from('prospects').update(updates).eq('id', id);
      if (error) return new Response(`Update failed: ${error.message}`, { status: 500 });

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
      if (!id) return new Response('id required', { status: 400 });
      const { error } = await sb.from('prospects').delete().eq('id', id);
      if (error) return new Response(`Delete failed: ${error.message}`, { status: 500 });
      return redirect('/ops/prospects', 302);
    }

    return new Response(`Unknown action: ${action}`, { status: 400 });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
};
