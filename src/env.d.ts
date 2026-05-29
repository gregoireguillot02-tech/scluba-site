/// <reference types="astro/client" />

import type { SupabaseClient } from '@supabase/supabase-js';

// `declare global` est requis ici : ce fichier est un module (il importe
// SupabaseClient), donc un `declare namespace App` nu serait local et
// n'augmenterait pas le App.Locals global d'Astro. Sans ce wrapper, le
// type-checker considère user/supabase/clubMembership comme inexistants sur
// Astro.locals (cf. astro check). Le build prod n'en souffrait pas (pas de
// type-check), mais `astro check` oui.
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string } | null;
      supabase: SupabaseClient;
      clubMembership: import('./lib/club-auth').ClubMembership | null;
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly OPS_ALLOWED_EMAILS: string;
  readonly PUBLIC_DEMO_URL?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly SENTRY_DSN?: string;
  readonly PUBLIC_SENTRY_DSN?: string;
  readonly SENTRY_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
