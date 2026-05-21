import type { APIRoute } from 'astro';

export const prerender = false;

// POST-only: this route is in PUBLIC_OPS_PATHS (no auth gate), so a GET would
// let any third-party `<img src>` log an ops user out. See audit F-1 (2026-05-21).
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect('/ops/login', 302);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
