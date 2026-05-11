import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../../lib/supabase';
import { uuidSchema } from '../../../../../lib/validation/schemas';

export const prerender = false;

const ALLOWED_KINDS = new Set(['logo', 'photo']);
// SVG removed from logo allowlist: stored SVG served from same-origin can host
// inline <script> and attribute-based payloads even with `image/svg+xml`. Until
// we ship a sanitizer or move the bucket to a separate origin, accept raster
// formats only.
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_LOGO_BYTES = 500 * 1024; // 500 KB
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

function extFor(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return 'bin';
  }
}

export const POST: APIRoute = async ({ request, params, locals, redirect, url }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const idParsed = uuidSchema.safeParse(params.id ?? '');
  if (!idParsed.success) return new Response('invalid club id', { status: 400 });
  const id = idParsed.data;

  const kind = String(url.searchParams.get('kind') ?? '');
  if (!ALLOWED_KINDS.has(kind)) return new Response('Invalid kind (use logo or photo)', { status: 400 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return new Response('No file uploaded', { status: 400 });

  const allowedTypes = kind === 'logo' ? ALLOWED_LOGO_TYPES : ALLOWED_PHOTO_TYPES;
  if (!allowedTypes.has(file.type)) {
    return new Response(`Unsupported type ${file.type}`, { status: 415 });
  }
  const maxBytes = kind === 'logo' ? MAX_LOGO_BYTES : MAX_PHOTO_BYTES;
  if (file.size > maxBytes) {
    return new Response(`File too big (${Math.round(file.size / 1024)} KB, max ${Math.round(maxBytes / 1024)} KB)`, { status: 413 });
  }

  const sb = serviceClient();
  const ext = extFor(file.type);
  const path = `${id}/${kind}-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: upErr } = await sb.storage
    .from('club-assets')
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (upErr) {
    console.error('[api/ops/clubs/[id]/upload] storage upload failed', upErr);
    return new Response('Upload failed', { status: 500 });
  }

  const { data: pub } = sb.storage.from('club-assets').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const column = kind === 'logo' ? 'logo_url' : 'photo_url';
  const { error: updErr } = await sb.from('clubs').update({ [column]: publicUrl }).eq('id', id);
  if (updErr) {
    console.error('[api/ops/clubs/[id]/upload] DB update failed', updErr);
    return new Response('DB update failed', { status: 500 });
  }

  return redirect(`/ops/clubs/${id}/edit?ok=1`, 302);
};
