import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { generateClubSlug } from '../../../../lib/slug';
import { downloadImage } from '../../../../lib/club-importer/scrape';

export const prerender = false;

const HEX = /^#[0-9A-Fa-f]{6}$/;

const holeSchema = z.object({
  number: z.coerce.number().int().min(1).max(18),
  par: z.coerce.number().int().min(3).max(6),
});

const loopSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  holes: z.array(holeSchema).min(1).max(18),
});

const formatSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  loop_ids: z.array(z.string().min(1)).min(1).max(6),
});

const courseDataSchema = z.object({
  holes: z.array(holeSchema).min(1).max(36),
  loops: z.array(loopSchema).optional(),
  formats: z.array(formatSchema).optional(),
});

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120).nullable().optional(),
  primary_color: z.string().regex(HEX).nullable().optional(),
  source_logo_url: z.string().url().nullable().optional(),
  source_photo_url: z.string().url().nullable().optional(),
  course_data: courseDataSchema,
});

const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extFor(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return 'bin';
  }
}

async function persistAsset(args: {
  sb: ReturnType<typeof serviceClient>;
  sourceUrl: string;
  kind: 'logo' | 'photo';
  clubId: string;
}): Promise<string | null> {
  const allowed = args.kind === 'logo' ? ALLOWED_LOGO_MIME : ALLOWED_PHOTO_MIME;
  const img = await downloadImage(args.sourceUrl);
  if (!img || !allowed.has(img.mimeType)) return null;

  const path = `${args.clubId}/${args.kind}-${Date.now()}.${extFor(img.mimeType)}`;
  const { error } = await args.sb.storage
    .from('club-assets')
    .upload(path, img.bytes, {
      contentType: img.mimeType,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) {
    console.error(`[api/ops/clubs/from-import] ${args.kind} upload failed`, error);
    return null;
  }
  const { data: pub } = args.sb.storage.from('club-assets').getPublicUrl(path);
  return pub.publicUrl;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body JSON requis' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  const data = parsed.data;

  const sb = serviceClient();

  let clubId = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateClubSlug();
    const { data: created, error } = await sb
      .from('clubs')
      .insert({
        slug,
        name: data.name,
        city: data.city ?? null,
        primary_color: data.primary_color ?? null,
        course_data: data.course_data,
        created_by: user.email,
      })
      .select('id')
      .single();
    if (!error && created) {
      clubId = created.id as string;
      break;
    }
    if (error && !error.message.includes('duplicate key')) {
      console.error('[api/ops/clubs/from-import] create failed', error);
      return new Response(JSON.stringify({ ok: false, error: 'Create failed' }), {
        status: 500, headers: { 'content-type': 'application/json' },
      });
    }
  }
  if (!clubId) {
    return new Response(JSON.stringify({ ok: false, error: 'Slug collision exhausted' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  const updates: Record<string, string | null> = {};
  if (data.source_logo_url) {
    const url = await persistAsset({ sb, sourceUrl: data.source_logo_url, kind: 'logo', clubId });
    if (url) updates.logo_url = url;
  }
  if (data.source_photo_url) {
    const url = await persistAsset({ sb, sourceUrl: data.source_photo_url, kind: 'photo', clubId });
    if (url) updates.photo_url = url;
  }
  if (Object.keys(updates).length) {
    const { error } = await sb.from('clubs').update(updates).eq('id', clubId);
    if (error) console.error('[api/ops/clubs/from-import] asset update failed', error);
  }

  return new Response(JSON.stringify({ ok: true, club_id: clubId, redirect: `/ops/clubs/${clubId}/edit?ok=1` }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
