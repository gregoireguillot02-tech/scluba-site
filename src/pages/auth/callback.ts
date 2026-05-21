import type { APIRoute } from 'astro';
import { safeNextPath } from '../../lib/safe-redirect';

// Avec le flow OTP code (depuis 2026-05-21), ce callback n'est plus appelé
// par notre login joueur — verifyOtp se fait directement dans le POST handler
// de /auth/login. On le garde pour :
//   1. Rétrocompat des magic links déjà envoyés à des testeurs avant la bascule
//   2. Permettre un futur retour à un flow OAuth/PKCE côté joueur sans nouveau code
// Si on bascule à un autre flow ou qu'on est certain qu'aucun magic link n'est
// plus en circulation, ce fichier peut être supprimé.

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
