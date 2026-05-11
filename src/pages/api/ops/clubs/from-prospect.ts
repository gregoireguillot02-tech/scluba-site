import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { generateClubSlug } from '../../../../lib/slug';
import { uuidSchema } from '../../../../lib/validation/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const prospectParsed = uuidSchema.safeParse(form.get('prospect_id') ?? '');
  if (!prospectParsed.success) return new Response('invalid prospect_id', { status: 400 });
  const prospect_id = prospectParsed.data;

  const sb = serviceClient();

  const { data: prospect, error: pErr } = await sb
    .from('prospects')
    .select('id, club_name, city')
    .eq('id', prospect_id)
    .maybeSingle();
  if (pErr) {
    console.error('[api/ops/clubs/from-prospect] lookup failed', pErr);
    return new Response('Lookup failed', { status: 500 });
  }
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
      console.error('[api/ops/clubs/from-prospect] create failed', cErr);
      return new Response('Create failed', { status: 500 });
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
