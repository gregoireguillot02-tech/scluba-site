import type { APIRoute } from 'astro';
import { safeNextPath } from '../../lib/safe-redirect';

export const prerender = false;

const handler: APIRoute = async ({ locals, url, redirect }) => {
  await locals.supabase.auth.signOut();
  const next = safeNextPath(url.searchParams.get('next'), '/');
  return redirect(next, 302);
};

export const GET = handler;
export const POST = handler;
