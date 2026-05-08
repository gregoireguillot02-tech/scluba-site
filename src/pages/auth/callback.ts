import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');
  const next = url.searchParams.get('next') || '/';

  if (errorDescription) {
    return redirect(`/auth/login?err=${encodeURIComponent(errorDescription)}&next=${encodeURIComponent(next)}`, 302);
  }

  if (!code) {
    return redirect(`/auth/login?err=missing_code&next=${encodeURIComponent(next)}`, 302);
  }

  const supabase = locals.supabase;
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirect(`/auth/login?err=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`, 302);
  }

  return redirect(next, 302);
};
