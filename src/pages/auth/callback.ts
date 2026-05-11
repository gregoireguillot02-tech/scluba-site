import type { APIRoute } from 'astro';
import { safeNextPath } from '../../lib/safe-redirect';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');
  const next = safeNextPath(url.searchParams.get('next'), '/');
  const nextParam = encodeURIComponent(next);

  if (errorDescription) {
    console.error('[auth/callback] provider error', errorDescription);
    return redirect(`/auth/login?err=auth_failed&next=${nextParam}`, 302);
  }

  if (!code) {
    return redirect(`/auth/login?err=missing_code&next=${nextParam}`, 302);
  }

  const supabase = locals.supabase;
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed', error);
    return redirect(`/auth/login?err=auth_failed&next=${nextParam}`, 302);
  }

  return redirect(next, 302);
};
