import { describe, it, expect, vi } from 'vitest';
import { enforceOpsAllowlist } from './auth-helpers';

function makeSupabase(email: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: email ? { email } : null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe('enforceOpsAllowlist', () => {
  it('retourne ok=true quand email est dans allowlist', async () => {
    const supabase = makeSupabase('greg@allowed.com');
    const result = await enforceOpsAllowlist(
      supabase as any,
      (e) => e === 'greg@allowed.com',
    );
    expect(result.ok).toBe(true);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('signOut + ok=false quand email pas dans allowlist', async () => {
    const supabase = makeSupabase('intruder@bad.com');
    const result = await enforceOpsAllowlist(
      supabase as any,
      (e) => e === 'greg@allowed.com',
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_allowed');
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('signOut + ok=false quand aucun user', async () => {
    const supabase = makeSupabase(null);
    const result = await enforceOpsAllowlist(supabase as any, () => true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_user');
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
