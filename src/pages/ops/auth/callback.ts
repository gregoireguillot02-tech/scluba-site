import type { APIRoute } from 'astro';
import { safeNextPath } from '../../../lib/safe-redirect';
import { isAllowedEmail } from '../../../lib/supabase';
import { enforceOpsAllowlist } from '../../../lib/auth-helpers';

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

  const allow = await enforceOpsAllowlist(supabase, isAllowedEmail);
  if (!allow.ok) {
    console.warn('[ops/auth/callback] blocked', allow.reason);
    return redirect(`/ops/login?err=${allow.reason}`, 302);
  }

  return redirect(next, 302);
};
