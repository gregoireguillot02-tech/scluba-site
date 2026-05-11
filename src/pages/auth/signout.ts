import type { APIRoute } from 'astro';

export const prerender = false;

const handler: APIRoute = async ({ locals, url, redirect }) => {
  await locals.supabase.auth.signOut();
  const next = url.searchParams.get('next') || '/';
  return redirect(next, 302);
};

export const GET = handler;
export const POST = handler;
