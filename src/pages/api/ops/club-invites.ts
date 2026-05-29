import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceClient } from '../../../lib/supabase';
import { generateInviteToken } from '../../../lib/club-auth';
import { uuidSchema, formatZodError } from '../../../lib/validation/schemas';

export const prerender = false;

const bodySchema = z.object({
  club_id: uuidSchema,
  role: z.enum(['admin', 'greenkeeper']),
});

export const POST: APIRoute = async ({ request }) => {
  // L'auth + allowlist /ops est déjà appliquée par le middleware (préfixe /api/ops).
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });

  const sb = serviceClient();
  const { data: club } = await sb.from('clubs').select('id').eq('id', parsed.data.club_id).maybeSingle();
  if (!club) return new Response('Club introuvable', { status: 404 });

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await sb.from('club_invites').insert({
    token,
    club_id: parsed.data.club_id,
    role: parsed.data.role,
    expires_at: expiresAt,
  });
  if (error) {
    console.error('[api/ops/club-invites] insert failed', error);
    return new Response('Création échouée', { status: 500 });
  }

  const origin = new URL(request.url).origin;
  return new Response(
    JSON.stringify({ ok: true, url: `${origin}/club/join?token=${token}`, expires_at: expiresAt }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
