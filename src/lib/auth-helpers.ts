import type { SupabaseClient } from '@supabase/supabase-js';

export type AllowlistResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'no_user' | 'not_allowed' };

/**
 * Après un OAuth exchange, on a une session Supabase mais on n'a pas encore
 * vérifié que l'email retourné par le provider (ici Google) est bien dans
 * l'allowlist ops. Si non, on signOut immédiatement pour ne pas laisser
 * traîner une session non autorisée — le middleware bloquerait l'accès
 * ensuite, mais autant ne pas créer la session côté cookie.
 */
export async function enforceOpsAllowlist(
  supabase: SupabaseClient,
  isAllowed: (email: string) => boolean,
): Promise<AllowlistResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) {
    await supabase.auth.signOut();
    return { ok: false, reason: 'no_user' };
  }
  const email = data.user.email;
  if (!isAllowed(email)) {
    await supabase.auth.signOut();
    return { ok: false, reason: 'not_allowed' };
  }
  return { ok: true, email };
}
