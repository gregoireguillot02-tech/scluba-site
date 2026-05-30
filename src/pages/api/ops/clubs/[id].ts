import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { uuidSchema, courseLoopsSchema, formatZodError } from '../../../../lib/validation/schemas';
import { buildMultiCourseData } from '../../../../lib/course-formats';
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

// Sponsor link saisi dans le dashboard club. Empty string → null (slot sans
// lien, image affichée non-cliquable). Validation : URL absolue http(s) seulement,
// pas de javascript: ni data: pour éviter l'XSS sur la page recap publique.
function parseSponsorLink(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === '') return null;
  if (raw.length > 500) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
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
    if (!Number.isFinite(par) || par < 2 || par > 6) return null;
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

  // Vider un slot sponsor (image + lien). Le fichier dans Supabase Storage
  // n'est pas purgé activement — pas critique : le bucket est versionné par
  // timestamp et l'URL n'est plus exposée nulle part une fois la colonne null.
  if (action === 'delete-sponsor') {
    const idx = Number(form.get('index'));
    if (![1, 2, 3, 4].includes(idx)) {
      return new Response('Sponsor index must be 1..4', { status: 400 });
    }
    const { error } = await sb.from('clubs').update({
      [`sponsor_${idx}_url`]: null,
      [`sponsor_${idx}_link`]: null,
    }).eq('id', id);
    if (error) {
      console.error('[api/ops/clubs/[id]] delete-sponsor failed', error);
      return new Response('Delete sponsor failed', { status: 500 });
    }
    return redirect(`/ops/clubs/${id}/edit?ok=1`, 302);
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

  // Le parcours se gère en deux modes (toggle dans l'éditeur ops) :
  //   - 'multi'  : boucles nommées + formats jouables (champ course_loops_json),
  //     re-sanitisés et recalculés par buildMultiCourseData ;
  //   - 'single' : un seul parcours plat (hole_count + par_<n>). Repasser un
  //     club en mode simple EFFACE volontairement ses loops/formats (choix
  //     explicite du toggle, plus le hack de préservation d'avant).
  const courseMode = String(form.get('course_mode') ?? 'single');
  let courseData: CourseData;

  if (courseMode === 'multi') {
    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get('course_loops_json') ?? ''));
    } catch {
      return new Response('course_loops_json invalide (JSON illisible)', { status: 400 });
    }
    const parsed = courseLoopsSchema.safeParse(payload);
    if (!parsed.success) return new Response(formatZodError(parsed.error), { status: 400 });
    const built = buildMultiCourseData(parsed.data);
    if ('error' in built) return new Response(built.error, { status: 400 });
    courseData = built.courseData;
  } else {
    const holeCount = parseHoleCount(form, existingHoleCount);
    if (holeCount == null) {
      return new Response('Hole count must be 6, 9, or 18', { status: 400 });
    }
    const holes = parseCourseData(form, holeCount);
    if (!holes) {
      return new Response(
        `Pars must be integers between 2 and 6 for all ${holeCount} holes`,
        { status: 400 },
      );
    }
    courseData = { holes };
  }

  const updates: Record<string, unknown> = {
    name,
    city: nullable(form.get('city'), 120),
    primary_color: primaryColor,
    course_data: courseData,
    sponsor_1_link: parseSponsorLink(form.get('sponsor_1_link')),
    sponsor_2_link: parseSponsorLink(form.get('sponsor_2_link')),
    sponsor_3_link: parseSponsorLink(form.get('sponsor_3_link')),
    sponsor_4_link: parseSponsorLink(form.get('sponsor_4_link')),
  };

  const { error } = await sb.from('clubs').update(updates).eq('id', id);
  if (error) {
    console.error('[api/ops/clubs/[id]] update failed', error);
    return new Response('Update failed', { status: 500 });
  }

  return redirect(`/ops/clubs/${id}/edit?ok=1`, 302);
};
