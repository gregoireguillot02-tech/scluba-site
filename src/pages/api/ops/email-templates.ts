import type { APIRoute } from 'astro';
import { serviceClient, isAllowedEmail } from '../../../lib/supabase';
import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey } from '../../../lib/email-templates';

export const prerender = false;

function clamp(v: FormDataEntryValue | null, maxLen: number): string {
  return String(v ?? '').slice(0, maxLen);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !isAllowedEmail(user.email)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? 'save');
  const sb = serviceClient();

  if (action === 'save') {
    const key = String(form.get('key') ?? '') as EmailTemplateKey;
    if (!EMAIL_TEMPLATE_KEYS.includes(key)) return new Response('bad key', { status: 400 });

    const subject = clamp(form.get('subject'), 300);
    const body = clamp(form.get('body'), 8000);

    const { error } = await sb.from('email_templates').update({ subject, body }).eq('key', key);
    if (error) {
      console.error('[api/ops/email-templates] save failed', error);
      return new Response('Save failed', { status: 500 });
    }
    return redirect('/ops/parametres', 302);
  }

  return new Response('Bad request', { status: 400 });
};
