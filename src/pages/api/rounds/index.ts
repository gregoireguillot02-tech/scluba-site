import type { APIRoute } from 'astro';
import { authServerClient, serviceClient } from '../../../lib/supabase';
import { generateRoundShortCode } from '../../../lib/slug';
import { createRoundSchema, formatZodError } from '../../../lib/validation/schemas';
import { fetchCurrentWeather } from '../../../lib/weather';
import { parisTimeToISO } from '../../../lib/time';

export const prerender = false;

const PLAYER_COOKIE_PREFIX = 'scluba_player_';

export const GET: APIRoute = ({ redirect }) => redirect('/', 302);

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();

  // FormData carries multiple values for the same key; pull each
  // `additional_players` entry, trim, drop empties, and dedupe (case-insensitive)
  // so the placeholder list matches what the organizer actually intended.
  const rawAdditional = form
    .getAll('additional_players')
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0);
  const seen = new Set<string>();
  const additional_players: string[] = [];
  for (const name of rawAdditional) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    additional_players.push(name);
  }

  const rawFormatId = form.get('format_id');
  const rawStartedAt = form.get('started_at');
  const rawStartHour = form.get('start_hour');
  const rawStartMinute = form.get('start_minute');
  const parsed = createRoundSchema.safeParse({
    slug: form.get('slug') ?? '',
    display_name: form.get('display_name') ?? '',
    additional_players: additional_players.length > 0 ? additional_players : undefined,
    format_id: typeof rawFormatId === 'string' && rawFormatId.length > 0 ? rawFormatId : undefined,
    started_at: typeof rawStartedAt === 'string' && rawStartedAt.length > 0 ? rawStartedAt : undefined,
    start_hour: typeof rawStartHour === 'string' && rawStartHour.length > 0 ? rawStartHour : undefined,
    start_minute: typeof rawStartMinute === 'string' && rawStartMinute.length > 0 ? rawStartMinute : undefined,
    hp_email: form.get('hp_email') ?? undefined,
  });
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
  const { slug, display_name } = parsed.data;
  const placeholders = parsed.data.additional_players ?? [];
  const formatId = parsed.data.format_id ?? null;
  // Source de vérité : les selects HH/MM envoyés en form data native par
  // le browser (contournement iOS Safari). Fallback sur le started_at ISO
  // (legacy clients cachés), sinon now().
  const hasHM = typeof parsed.data.start_hour === 'number' && typeof parsed.data.start_minute === 'number';
  const startedAt = hasHM
    ? parisTimeToISO(parsed.data.start_hour!, parsed.data.start_minute!)
    : (parsed.data.started_at ?? new Date().toISOString());

  const sb = serviceClient();

  const { data: club, error: cErr } = await sb
    .from('clubs')
    .select('id, latitude, longitude')
    .eq('slug', slug)
    .maybeSingle();
  if (cErr) {
    console.error('[api/rounds] club lookup failed', cErr);
    return new Response('Lookup failed', { status: 500 });
  }
  if (!club) return new Response('Club not found', { status: 404 });

  // Snapshot météo Open-Meteo si on a les coords. Best-effort (3s timeout) :
  // si l'API est down ou lente, on crée la partie sans météo plutôt que
  // bloquer le user.
  let weatherSnapshot: Awaited<ReturnType<typeof fetchCurrentWeather>> = null;
  if (typeof club.latitude === 'number' && typeof club.longitude === 'number') {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 3000);
    weatherSnapshot = await fetchCurrentWeather(club.latitude, club.longitude, ac.signal);
    clearTimeout(timeout);
  }

  let short_code = '';
  let roundId = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    short_code = generateRoundShortCode();
    const { data: created, error: rErr } = await sb
      .from('rounds')
      .insert({
        club_id: club.id,
        short_code,
        status: 'lobby',
        format_id: formatId,
        started_at: startedAt,
        weather: weatherSnapshot,
      })
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

  const nowIso = new Date().toISOString();

  const { data: creator, error: pErr } = await sb
    .from('round_players')
    .insert({
      round_id: roundId,
      display_name,
      is_creator: true,
      user_id: user?.id ?? null,
      claimed_at: nowIso,
    })
    .select('id')
    .single();
  if (pErr) {
    console.error('[api/rounds] create player failed', pErr);
    return new Response('Create player failed', { status: 500 });
  }

  if (placeholders.length > 0) {
    const rows = placeholders.map((name) => ({
      round_id: roundId,
      display_name: name,
      is_creator: false,
      user_id: null,
      claimed_at: null,
    }));
    const { error: phErr } = await sb.from('round_players').insert(rows);
    if (phErr) {
      console.error('[api/rounds] insert placeholders failed', phErr);
      return new Response('Create placeholders failed', { status: 500 });
    }
  }

  cookies.set(`${PLAYER_COOKIE_PREFIX}${short_code}`, creator.id, {
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });

  return redirect(`/r/${short_code}`, 302);
};
