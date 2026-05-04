import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const errorDescription = url.searchParams.get('error_description');
  const next = url.searchParams.get('next') || '/ops';

  if (errorDescription) {
    return redirect(`/ops/login?err=${encodeURIComponent(errorDescription)}`, 302);
  }

  if (!code) {
    return redirect('/ops/login?err=missing_code', 302);
  }

  const supabase = locals.supabase;
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirect(`/ops/login?err=${encodeURIComponent(error.message)}`, 302);
  }

  return redirect(next, 302);
};
