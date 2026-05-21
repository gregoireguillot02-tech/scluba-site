import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

function assertEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing env var ${name}. Configure it in Netlify and .env for local dev.`);
  return value;
}

/**
 * Auth-aware client. Uses cookies on the request to read/write the user session.
 * Anon key — RLS applies. Use this only for auth flows (signInWithOtp, exchangeCodeForSession, signOut).
 */
export function authServerClient(cookies: AstroCookies, headers: Headers) {
  const url = assertEnv(SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
  const key = assertEnv(SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY');

  const cookieOptions: CookieOptionsWithName = {
    name: 'sb',
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    httpOnly: true,
  };

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        const cookieHeader = headers.get('cookie') ?? '';
        if (!cookieHeader) return [];
        return cookieHeader.split(';').map((c) => {
          const [name, ...rest] = c.trim().split('=');
          return { name, value: decodeURIComponent(rest.join('=')) };
        });
      },
      setAll(items) {
        for (const { name, value, options } of items) {
          cookies.set(name, value, { ...cookieOptions, ...options });
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS. NEVER expose this to the browser.
 * Use it inside `/ops/*` pages and API endpoints once auth + allowlist have passed.
 */
let _serviceClient: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = assertEnv(SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
  const key = assertEnv(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

// NFKC normalisation collapses Unicode confusables (e.g. Cyrillic `і` U+0456 vs
// Latin `i`) to a canonical form, so a homograph email can't bypass the
// allowlist by mimicking an admin address.
function normalizeEmail(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

const ALLOWED_EMAILS = (import.meta.env.OPS_ALLOWED_EMAILS as string | undefined)
  ?.split(',')
  .map((e) => normalizeEmail(e))
  .filter(Boolean) ?? [];

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ALLOWED_EMAILS.length === 0) return false;
  return ALLOWED_EMAILS.includes(normalizeEmail(email));
}

export function getAllowedEmails(): string[] {
  return ALLOWED_EMAILS;
}
