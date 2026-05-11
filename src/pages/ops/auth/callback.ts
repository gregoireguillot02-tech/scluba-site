import type { APIRoute } from 'astro';
import { safeNextPath } from '../../../lib/safe-redirect';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');
  const next = safeNextPath(url.searchParams.get('next'), '/ops');

  if (errorDescription) {
    console.error('[ops/auth/callback] provider error', errorDescription);
    return redirect('/ops/login?err=auth_failed', 302);
  }

  if (!code) {
    return redirect('/ops/login?err=missing_code', 302);
  }

  const supabase = locals.supabase;
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[ops/auth/callback] exchangeCodeForSession failed', error);
    return redirect('/ops/login?err=auth_failed', 302);
  }

  return redirect(next, 302);
};
