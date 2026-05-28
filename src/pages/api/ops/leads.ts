import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { uuidSchema } from '../../../lib/validation/schemas';
import { safeNextPath } from '../../../lib/safe-redirect';

export const prerender = false;

function parseUuid(raw: unknown): string | null {
  const r = uuidSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function safeBack(refererHeader: string | null, origin: string, fallback: string): string {
  if (!refererHeader) return fallback;
  try {
    const u = new URL(refererHeader);
    if (u.origin !== origin) return fallback;
    return safeNextPath(u.pathname + u.search, fallback);
  } catch {
    return fallback;
  }
}

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const sb = serviceClient();
  const back = safeBack(request.headers.get('referer'), url.origin, '/ops/signups');

  if (action === 'delete') {
    const id = parseUuid(form.get('id'));
    if (!id) return new Response('invalid id', { status: 400 });
    const { error } = await sb.from('leads').delete().eq('id', id);
    if (error) {
      console.error('[api/ops/leads] delete failed', error);
      return new Response('Delete failed', { status: 500 });
    }
    return redirect(back, 302);
  }

  return new Response('Bad request', { status: 400 });
};
