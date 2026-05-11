import { defineMiddleware } from 'astro:middleware';
import { authServerClient, isAllowedEmail } from './lib/supabase';

const PUBLIC_OPS_PATHS = new Set([
  '/ops/login',
  '/ops/auth/callback',
  '/ops/auth/signout',
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isOpsPage = pathname.startsWith('/ops');
  const isOpsApi = pathname.startsWith('/api/ops');
  const isAuthPage = pathname.startsWith('/auth');
  const isAuthApi = pathname.startsWith('/api/auth');

  // Pages outside the auth/ops zones don't need the supabase client populated.
  if (!isOpsPage && !isOpsApi && !isAuthPage && !isAuthApi) return next();

  const supabase = authServerClient(context.cookies, context.request.headers);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user
    ? { id: user.id, email: user.email ?? '' }
    : null;
  context.locals.supabase = supabase;

  // Golfer-side auth pages have no allowlist — anyone can sign in.
  if (isAuthPage || isAuthApi) return next();

  if (PUBLIC_OPS_PATHS.has(pathname)) return next();

  if (!user) {
    if (isOpsApi) return new Response('Unauthorized', { status: 401 });
    const next_ = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/ops/login?next=${next_}`, 302);
  }

  if (!isAllowedEmail(user.email)) {
    if (isOpsApi) return new Response('Forbidden', { status: 403 });
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Accès refusé</title></head>` +
        `<body style="font-family:system-ui;max-width:520px;margin:80px auto;padding:0 20px;color:#1B4332">` +
        `<h1 style="font-family:Georgia,serif">Accès refusé</h1>` +
        `<p>Le compte <b>${escapeHtml(user.email ?? '')}</b> n'est pas autorisé.</p>` +
        `<p><a href="/ops/auth/signout" style="color:#D4A574">Se déconnecter</a></p>` +
        `</body></html>`,
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  return next();
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
