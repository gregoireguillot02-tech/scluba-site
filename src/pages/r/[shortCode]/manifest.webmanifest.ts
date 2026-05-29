import type { APIRoute } from 'astro';
import { serviceClient } from '../../../lib/supabase';
import { buildClubManifest } from '../../../lib/club-manifest';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const shortCode = (params.shortCode ?? '').toUpperCase();
  let club: { name: string; icon_url: string | null; logo_url: string | null; primary_color: string | null } | null =
    null;
  try {
    const sb = serviceClient();
    const { data: round } = await sb
      .from('rounds')
      .select('club:clubs(name, icon_url, logo_url, primary_color)')
      .eq('short_code', shortCode)
      .maybeSingle();
    club = (round as { club: typeof club } | null)?.club ?? null;
  } catch (e) {
    console.error('[manifest.webmanifest] club lookup failed', e);
  }
  const manifest = buildClubManifest(club, shortCode);
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
