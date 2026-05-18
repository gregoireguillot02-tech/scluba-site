import type { APIRoute } from 'astro';
import { isAllowedEmail } from '../../../../lib/supabase';
import { runImportPreview } from '../../../../lib/club-importer/pipeline';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY non configurée' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body JSON requis' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const url = (body.url ?? '').trim();
  if (!url) {
    return new Response(JSON.stringify({ ok: false, error: 'url requise' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const data = await runImportPreview({ url, apiKey });
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    console.error('[api/ops/clubs/import] failed', err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
};
