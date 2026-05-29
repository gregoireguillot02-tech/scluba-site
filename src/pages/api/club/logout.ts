import type { APIRoute } from 'astro';
import { CLUB_SESSION_COOKIE } from '../../../lib/club-session';

export const prerender = false;

// POST-only : un GET permettrait à un `<img src>`/préfetch/bot de déconnecter la
// victime (logout-CSRF). Le middleware applique déjà le check same-origin sur
// /api/club/. On efface le cookie de session et on renvoie vers le login.
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(CLUB_SESSION_COOKIE, { path: '/' });
  return redirect('/club/login', 302);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
