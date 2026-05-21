import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { NETWORK_STATUSES, ORG_TYPES, type NetworkStatus, type OrgType } from '../../../lib/network-types';
import { uuidSchema } from '../../../lib/validation/schemas';

export const prerender = false;

function nullable(value: FormDataEntryValue | null, maxLen = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

function parseUuid(raw: unknown): string | null {
  const r = uuidSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'update');
  const sb = serviceClient();

  try {
    if (action === 'update') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const name = String(form.get('name') ?? '').trim().slice(0, 255);
      if (!name) return new Response('name required', { status: 400 });

      const org = String(form.get('org') ?? '').trim().slice(0, 255);
      if (!org) return new Response('org required', { status: 400 });

      const org_type_raw = String(form.get('org_type') ?? '');
      if (!ORG_TYPES.includes(org_type_raw as OrgType)) {
        return new Response('bad org_type', { status: 400 });
      }

      const status_raw = String(form.get('status') ?? 'to_contact');
      if (!NETWORK_STATUSES.includes(status_raw as NetworkStatus)) {
        return new Response('bad status', { status: 400 });
      }

      const { error } = await sb
        .from('network_contacts')
        .update({
          name,
          role: nullable(form.get('role'), 120),
          org,
          org_type: org_type_raw,
          region: nullable(form.get('region'), 120),
          email: nullable(form.get('email'), 320),
          phone: nullable(form.get('phone'), 64),
          website: nullable(form.get('website'), 500),
          status: status_raw,
          notes: nullable(form.get('notes'), 4000),
        })
        .eq('id', id);

      if (error) {
        console.error('[api/ops/network] update failed', error);
        return new Response('Update failed', { status: 500 });
      }

      return redirect(`/ops/reseau/${id}`, 302);
    }

    if (action === 'add_intro') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const club = String(form.get('club') ?? '').trim().slice(0, 255);
      if (!club) return new Response('club required', { status: 400 });

      // Atomique : lit, append, écrit. Pas d'array_append côté PostgREST simple,
      // donc on récupère et on réécrit. OK pour 21 contacts en admin only.
      const { data: row, error: readErr } = await sb
        .from('network_contacts')
        .select('intros_made')
        .eq('id', id)
        .maybeSingle();
      if (readErr || !row) {
        console.error('[api/ops/network] add_intro read failed', readErr);
        return new Response('Read failed', { status: 500 });
      }

      const current: string[] = (row.intros_made as string[]) ?? [];
      if (!current.includes(club)) current.push(club);

      const { error: writeErr } = await sb
        .from('network_contacts')
        .update({ intros_made: current })
        .eq('id', id);
      if (writeErr) {
        console.error('[api/ops/network] add_intro write failed', writeErr);
        return new Response('Write failed', { status: 500 });
      }

      return redirect(`/ops/reseau/${id}`, 302);
    }

    if (action === 'remove_intro') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const club = String(form.get('club') ?? '').trim();
      if (!club) return new Response('club required', { status: 400 });

      const { data: row, error: readErr } = await sb
        .from('network_contacts')
        .select('intros_made')
        .eq('id', id)
        .maybeSingle();
      if (readErr || !row) {
        console.error('[api/ops/network] remove_intro read failed', readErr);
        return new Response('Read failed', { status: 500 });
      }

      const current: string[] = (row.intros_made as string[]) ?? [];
      const next = current.filter((c) => c !== club);

      const { error: writeErr } = await sb
        .from('network_contacts')
        .update({ intros_made: next })
        .eq('id', id);
      if (writeErr) {
        console.error('[api/ops/network] remove_intro write failed', writeErr);
        return new Response('Write failed', { status: 500 });
      }

      return redirect(`/ops/reseau/${id}`, 302);
    }

    return new Response('Unknown action', { status: 400 });
  } catch (err) {
    console.error('[api/ops/network] handler error', err);
    return new Response('Server error', { status: 500 });
  }
};
