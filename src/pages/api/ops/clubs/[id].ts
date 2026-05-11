import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../../lib/supabase';
import { uuidSchema } from '../../../../lib/validation/schemas';
import type { CourseData, CourseHole } from '../../../../lib/clubs-types';

export const prerender = false;

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

function parseCourseData(form: FormData): CourseData | null {
  const holes: CourseHole[] = [];
  for (let n = 1; n <= 18; n++) {
    const par = Number(form.get(`par_${n}`) ?? '');
    if (!Number.isFinite(par) || par < 3 || par > 6) return null;
    holes.push({ number: n, par });
  }
  return { holes };
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

  const courseData = parseCourseData(form);
  if (!courseData) return new Response('Pars must be integers between 3 and 6 for all 18 holes', { status: 400 });

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
