import type { APIRoute } from 'astro';

export const prerender = false;

// POST-only: GET would let any cross-origin `<img src>`, prefetcher or unfurl
// bot log the victim out (logout-CSRF). See audit F-1 / F-2 (2026-05-21).
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  // Always redirect to `/` — dropping the attacker-controllable `?next=` kills
  // the open-redirect / phishing-pretext chain (F-2).
  return redirect('/', 302);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
