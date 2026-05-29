import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { PROSPECT_STATUSES, OWNERS, type ProspectStatus, type Owner } from '../../../lib/ops-types';
import { uuidSchema } from '../../../lib/validation/schemas';
import { safeNextPath } from '../../../lib/safe-redirect';

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

// 'YYYY-MM-DDTHH:MM' → "le 12/06 à 14h00"
function fmtDemo(s: string): string {
  const [date, time] = s.split('T');
  const [, m, d] = (date ?? '').split('-');
  if (!d || !m) return '';
  return `le ${d}/${m}${time ? ` à ${time.replace(':', 'h')}` : ''}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
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

      const insertData: Record<string, unknown> = {
        club_name,
        contact_name: nullable(form.get('contact_name'), 255),
        contact_role: nullable(form.get('contact_role'), 120),
        email: nullable(form.get('email'), 320),
        phone: nullable(form.get('phone'), 64),
        city: nullable(form.get('city'), 120),
        region: nullable(form.get('region'), 120),
        status,
        owner,
        source: nullable(form.get('source'), 255),
        notes: nullable(form.get('notes'), 4000),
      };
      // club_type seulement si le formulaire l'envoie : la création kanban ne
      // l'envoie pas → insert sans la colonne (compatible avant migration 0028).
      if (form.get('club_type') !== null) insertData.club_type = nullable(form.get('club_type'), 40);

      const { data, error } = await sb.from('prospects').insert(insertData).select('id').single();
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

      // Saisie rapide depuis la liste d'appel : rester sur la liste plutôt que
      // d'ouvrir la fiche. `next` validé comme chemin interne sûr.
      const next = nullable(form.get('next'), 200);
      const dest = next ? safeNextPath(next, `/ops/prospects/${data.id}`) : `/ops/prospects/${data.id}`;
      return redirect(dest, 302);
    }

    if (action === 'update') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const club_name = String(form.get('club_name') ?? '').trim().slice(0, 255);
      if (!club_name) return new Response('club_name required', { status: 400 });

      // Form values arrive as strings; `""` is falsy in a truthiness guard
      // but survives `?? undefined` below (nullish coalescing only fires on
      // null/undefined), so an empty `status` slipped past the validator and
      // hit the DB enum CHECK as a 500. Normalize empty/missing to null so
      // the validator catches non-empty bad values and the spread below
      // skips the column on empty input.
      const rawStatus = form.get('status');
      const newStatus = rawStatus !== null && String(rawStatus) !== ''
        ? (String(rawStatus) as ProspectStatus)
        : null;
      if (newStatus !== null && !PROSPECT_STATUSES.includes(newStatus)) {
        return new Response('bad status', { status: 400 });
      }
      const rawOwner = form.get('owner');
      const newOwner = rawOwner !== null && String(rawOwner) !== ''
        ? (String(rawOwner) as Owner)
        : null;
      if (newOwner !== null && !OWNERS.includes(newOwner)) {
        return new Response('bad owner', { status: 400 });
      }

      const { data: prev } = await sb.from('prospects').select('status').eq('id', id).maybeSingle();

      const updates: Record<string, unknown> = {
        club_name,
        contact_name: nullable(form.get('contact_name'), 255),
        contact_role: nullable(form.get('contact_role'), 120),
        email: nullable(form.get('email'), 320),
        phone: nullable(form.get('phone'), 64),
        city: nullable(form.get('city'), 120),
        region: nullable(form.get('region'), 120),
        status: newStatus ?? undefined,
        owner: newOwner ?? undefined,
        source: nullable(form.get('source'), 255),
        notes: nullable(form.get('notes'), 4000),
      };
      if (form.get('club_type') !== null) updates.club_type = nullable(form.get('club_type'), 40);

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

    // Change uniquement le statut (sans toucher aux autres champs, contrairement
    // à "update"). Utilisé par le bouton "Booker une démo". Le param `compose`
    // permet de rouvrir la fiche avec la modal d'email ouverte.
    if (action === 'set_status') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const raw = form.get('status');
      const status =
        raw !== null && String(raw) !== '' ? (String(raw) as ProspectStatus) : null;
      if (!status || !PROSPECT_STATUSES.includes(status)) {
        return new Response('bad status', { status: 400 });
      }

      const { data: prev } = await sb.from('prospects').select('status').eq('id', id).maybeSingle();
      const { error } = await sb.from('prospects').update({ status }).eq('id', id);
      if (error) {
        console.error('[api/ops/prospects] set_status failed', error);
        return new Response('Update failed', { status: 500 });
      }
      if (prev && prev.status !== status) {
        await sb.from('prospect_events').insert({
          prospect_id: id,
          type: 'status_change',
          body: `${prev.status} → ${status}`,
          author: user.email,
        });
      }

      const compose = String(form.get('compose') ?? '');
      const suffix = compose ? `?compose=${encodeURIComponent(compose)}` : '';
      return redirect(`/ops/prospects/${id}${suffix}`, 302);
    }

    // Booker une démo : enregistre le créneau + le lien visio, passe en
    // "Démo prévue", et crée un rappel J-1 dans les prochaines actions.
    if (action === 'book_demo') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });

      const demoAt = String(form.get('demo_at') ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(demoAt)) {
        return new Response('créneau invalide', { status: 400 });
      }
      const demoLink = nullable(form.get('demo_link'), 1000);

      const { data: prev } = await sb.from('prospects').select('status').eq('id', id).maybeSingle();
      const { error } = await sb
        .from('prospects')
        .update({ status: 'demo_scheduled', demo_at: demoAt, demo_link: demoLink })
        .eq('id', id);
      if (error) {
        console.error('[api/ops/prospects] book_demo failed', error);
        return new Response('Booking failed', { status: 500 });
      }

      const quand = fmtDemo(demoAt);
      if (prev && prev.status !== 'demo_scheduled') {
        await sb.from('prospect_events').insert({
          prospect_id: id,
          type: 'status_change',
          body: `${prev.status} → demo_scheduled`,
          author: user.email,
        });
      }
      await sb.from('prospect_events').insert({
        prospect_id: id,
        type: 'meeting',
        body: `Démo programmée ${quand}`,
        author: user.email,
      });

      // Deux actions auto : aujourd'hui (envoyer le mail pour la visio) + la
      // veille de la démo (mail de rappel).
      const todayParis = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const dd = new Date(`${demoAt.slice(0, 10)}T00:00:00Z`);
      dd.setUTCDate(dd.getUTCDate() - 1);
      await sb.from('prospect_actions').insert([
        { prospect_id: id, due_on: todayParis, note: 'Envoyer le mail pour la visio' },
        { prospect_id: id, due_on: dd.toISOString().slice(0, 10), note: `Envoyer le mail de rappel démo ${quand}` },
      ]);

      return redirect(`/ops/prospects/${id}`, 302);
    }

    if (action === 'delete') {
      const id = parseUuid(form.get('id'));
      if (!id) return new Response('invalid id', { status: 400 });
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
