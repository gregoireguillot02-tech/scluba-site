import type { APIRoute } from 'astro';
import { isAllowedEmail } from '../../../../lib/supabase';
import { runImportPreview } from '../../../../lib/club-importer/pipeline';
import { LlmTimeoutError } from '../../../../lib/club-importer/llm';
import { SafeFetchError } from '../../../../lib/safe-fetch';

export const prerender = false;

const NO_STORE_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
  'vary': 'Cookie',
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Configuration manquante' }), {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body JSON requis' }), {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  const url = (body.url ?? '').trim();
  if (!url) {
    return new Response(JSON.stringify({ ok: false, error: 'url requise' }), {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  try {
    const data = await runImportPreview({ url, apiKey });
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    // Always log full error server-side; never propagate raw error strings.
    // Anthropic SDK errors and fetch errors may carry request metadata.
    console.error('[api/ops/clubs/import] failed', err);

    if (err instanceof SafeFetchError) {
      return new Response(JSON.stringify({ ok: false, error: 'URL refusée' }), {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }
    if (err instanceof LlmTimeoutError) {
      return new Response(JSON.stringify({ ok: false, error: "L'analyse IA a expiré, réessaie." }), {
        status: 504,
        headers: NO_STORE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Import failed — voir les logs ops' }), {
      status: 502,
      headers: NO_STORE_HEADERS,
    });
  }
};
