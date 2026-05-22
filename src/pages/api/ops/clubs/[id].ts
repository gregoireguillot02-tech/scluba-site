import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { uuidSchema } from '../../../../lib/validation/schemas';
import type { CourseData, CourseHole } from '../../../../lib/clubs-types';

export const prerender = false;

const ALLOWED_HOLE_COUNTS = new Set([6, 9, 18]);

function nullable(value: FormDataEntryValue | null, maxLen = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim().slice(0, maxLen);
  return s === '' ? null : s;
}

function parseHexColor(input: string | null): string | null {
  if (!input) return null;
  const v = input.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(v)) return null;
  return v;
}

function parseHoleCount(form: FormData, fallback: number): number | null {
  const raw = form.get('hole_count');
  if (raw == null || String(raw).trim() === '') {
    // Backward compat for older form submits that didn't include the field.
    return ALLOWED_HOLE_COUNTS.has(fallback) ? fallback : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || !ALLOWED_HOLE_COUNTS.has(n)) return null;
  return n;
}

function parseCourseData(form: FormData, holeCount: number): CourseHole[] | null {
  const holes: CourseHole[] = [];
  for (let n = 1; n <= holeCount; n++) {
    const par = Number(form.get(`par_${n}`) ?? '');
    if (!Number.isFinite(par) || par < 3 || par > 6) return null;
    holes.push({ number: n, par });
  }
  return holes;
}

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) {
    return new Response('Forbidden', { status: 403 });
  }

  const idParsed = uuidSchema.safeParse(params.id ?? '');
  if (!idParsed.success) return new Response('invalid club id', { status: 400 });
  const id = idParsed.data;

  const sb = serviceClient();
  const form = await request.formData();
  const action = String(form.get('action') ?? 'update');

  if (action === 'delete') {
    const { error } = await sb.from('clubs').delete().eq('id', id);
    if (error) {
      console.error('[api/ops/clubs/[id]] delete failed', error);
      return new Response('Delete failed', { status: 500 });
    }
    return redirect('/ops/clubs', 302);
  }

  const name = String(form.get('name') ?? '').trim().slice(0, 255);
  if (!name) return new Response('name required', { status: 400 });

  const primaryColor = parseHexColor(String(form.get('primary_color') ?? ''));

  // Fetch the existing club so we know the current hole count (fallback) and
  // can preserve loops/formats — multi-loop clubs aren't editable from this
  // form, but a save shouldn't silently wipe their loops either.
  const { data: existing, error: fetchErr } = await sb
    .from('clubs')
    .select('course_data')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr || !existing) {
    console.error('[api/ops/clubs/[id]] fetch existing failed', fetchErr);
    return new Response('Club not found', { status: 404 });
  }
  const existingCourse = existing.course_data as CourseData;
  const existingHoleCount = existingCourse?.holes?.length ?? 18;

  const holeCount = parseHoleCount(form, existingHoleCount);
  if (holeCount == null) {
    return new Response('Hole count must be 6, 9, or 18', { status: 400 });
  }

  const holes = parseCourseData(form, holeCount);
  if (!holes) {
    return new Response(
      `Pars must be integers between 3 and 6 for all ${holeCount} holes`,
      { status: 400 },
    );
  }

  const courseData: CourseData = {
    holes,
    // Preserve loops/formats from the existing club. If a club has multi-loop
    // data, the edit form above only let us touch pars on the flat holes
    // array — don't drop the loops on save.
    ...(existingCourse?.loops ? { loops: existingCourse.loops } : {}),
    ...(existingCourse?.formats ? { formats: existingCourse.formats } : {}),
  };

  const updates: Record<string, unknown> = {
    name,
    city: nullable(form.get('city'), 120),
    primary_color: primaryColor,
    course_data: courseData,
  };

  const { error } = await sb.from('clubs').update(updates).eq('id', id);
  if (error) {
    console.error('[api/ops/clubs/[id]] update failed', error);
    return new Response('Update failed', { status: 500 });
  }

  return redirect(`/ops/clubs/${id}/edit?ok=1`, 302);
};
