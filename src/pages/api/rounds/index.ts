import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../lib/supabase';
import { generateRoundShortCode } from '../../../lib/slug';
import { createRoundSchema, formatZodError } from '../../../lib/validation/schemas';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const GET: APIRoute = ({ redirect }) => redirect('/', 302);

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const parsed = createRoundSchema.safeParse({
    slug: form.get('slug') ?? '',
    display_name: form.get('display_name') ?? '',
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const { slug, display_name } = parsed.data;

  const sb = serviceClient();

  const { data: club, error: cErr } = await sb
    .from('clubs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (cErr) {
    console.error('[api/rounds] club lookup failed', cErr);
    return new Response('Lookup failed', { status: 500 });
  }
  if (!club) return new Response('Club not found', { status: 404 });

  let short_code = '';
  let roundId = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    short_code = generateRoundShortCode();
    const { data: created, error: rErr } = await sb
      .from('rounds')
      .insert({ club_id: club.id, short_code, status: 'lobby' })
      .select('id')
      .single();
    if (!rErr && created) {
      roundId = created.id;
      break;
    }
    if (rErr && !rErr.message.includes('duplicate key')) {
      console.error('[api/rounds] create round failed', rErr);
      return new Response('Create round failed', { status: 500 });
    }
  }
  if (!roundId) return new Response('short_code collision exhausted', { status: 500 });

  const auth = authServerClient(cookies, request.headers);
  const { data: { user } } = await auth.auth.getUser();

  const { data: player, error: pErr } = await sb
    .from('round_players')
    .insert({
      round_id: roundId,
      display_name,
      is_creator: true,
      user_id: user?.id ?? null,
    })
    .select('id')
    .single();
  if (pErr) {
    console.error('[api/rounds] create player failed', pErr);
    return new Response('Create player failed', { status: 500 });
  }

  cookies.set(`${PLAYER_COOKIE_PREFIX}${short_code}`, player.id, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });

  return redirect(`/r/${short_code}`, 302);
};
