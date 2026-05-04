import type { APIRoute } from 'astro';

export const prerender = false;

const handler: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect('/ops/login', 302);
};

export const GET = handler;
export const POST = handler;
