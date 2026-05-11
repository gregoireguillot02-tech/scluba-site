import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { generateClubSlug } from '../../../../lib/slug';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const prospect_id = String(form.get('prospect_id') ?? '').trim();
  if (!prospect_id) return new Response('prospect_id required', { status: 400 });

  const sb = serviceClient();

  const { data: prospect, error: pErr } = await sb
    .from('prospects')
    .select('id, club_name, city')
    .eq('id', prospect_id)
    .maybeSingle();
  if (pErr) return new Response(`Lookup failed: ${pErr.message}`, { status: 500 });
  if (!prospect) return new Response('Prospect not found', { status: 404 });

  const { data: existing } = await sb
    .from('clubs')
    .select('id')
    .eq('prospect_id', prospect_id)
    .maybeSingle();
  if (existing) {
    return redirect(`/ops/clubs/${existing.id}/qr`, 302);
  }

  // Retry slug generation up to 3 times in the (vanishingly rare) case of a collision.
  let slug = '';
  let clubId = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    slug = generateClubSlug();
    const { data: created, error: cErr } = await sb
      .from('clubs')
      .insert({
        prospect_id,
        slug,
        name: prospect.club_name,
        city: prospect.city,
        created_by: user.email,
      })
      .select('id')
      .single();
    if (!cErr && created) {
      clubId = created.id;
      break;
    }
    if (cErr && !cErr.message.includes('duplicate key')) {
      return new Response(`Create failed: ${cErr.message}`, { status: 500 });
    }
  }
  if (!clubId) return new Response('Slug collision exhausted', { status: 500 });

  await sb.from('prospect_events').insert({
    prospect_id,
    type: 'page_created',
    body: `Page club créée — slug ${slug}`,
    author: user.email,
  });

  await sb.from('prospects').update({ status: 'page_created' }).eq('id', prospect_id);

  return redirect(`/ops/clubs/${clubId}/qr`, 302);
};
