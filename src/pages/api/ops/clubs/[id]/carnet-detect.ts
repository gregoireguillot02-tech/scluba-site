import type { APIRoute } from 'astro';
import { isAllowedEmail } from '../../../../../lib/supabase';
import { uuidSchema } from '../../../../../lib/validation/schemas';
import { detectImageMime } from '../../../../../lib/image-mime';
import { extractCarnetLayout, CarnetLayoutTimeoutError } from '../../../../../lib/carnet-detect/llm';

export const prerender = false;

const NO_STORE_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
  'vary': 'Cookie',
};
const MAX_PAGE_BYTES = 8 * 1024 * 1024; // page A4 rendue scale 2 en JPEG — marge large
const MAX_HOLE_NUMBER = 36;

export const POST: APIRoute = async ({ request, params, locals }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }
  // `id` validé pour la parité de famille de route avec upload.ts. La détection
  // est sans état (pas de lecture du club : expectedHoles est envoyé par le
  // client admin de confiance, depuis les données SSR).
  if (!uuidSchema.safeParse(params.id ?? '').success) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid club id' }), { status: 400, headers: NO_STORE_HEADERS });
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Configuration manquante' }), { status: 500, headers: NO_STORE_HEADERS });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ ok: false, error: 'No file uploaded' }), { status: 400, headers: NO_STORE_HEADERS });
  }
  if (file.size > MAX_PAGE_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: 'Page trop lourde' }), { status: 413, headers: NO_STORE_HEADERS });
  }

  // expectedHoles : indice envoyé par l'admin (JSON tableau d'entiers). On filtre.
  let expectedHoles: number[] = [];
  const rawHoles = form.get('expectedHoles');
  if (typeof rawHoles === 'string') {
    try {
      const arr = JSON.parse(rawHoles);
      if (Array.isArray(arr)) {
        expectedHoles = arr.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= MAX_HOLE_NUMBER);
      }
    } catch { /* indice seulement — on ignore une valeur illisible */ }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectImageMime(bytes);
  if (!mediaType) {
    return new Response(JSON.stringify({ ok: false, error: 'Format image non reconnu' }), { status: 415, headers: NO_STORE_HEADERS });
  }

  try {
    const layout = await extractCarnetLayout({ apiKey, imageBytes: bytes, mediaType, expectedHoles });
    return new Response(JSON.stringify({ ok: true, layout }), { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error('[api/ops/clubs/[id]/carnet-detect] failed', err);
    if (err instanceof CarnetLayoutTimeoutError) {
      return new Response(JSON.stringify({ ok: false, error: 'La détection IA a expiré, réessaie.' }), { status: 504, headers: NO_STORE_HEADERS });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Détection échouée — voir les logs ops' }), { status: 502, headers: NO_STORE_HEADERS });
  }
};
