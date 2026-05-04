/// <reference types="astro/client" />

import type { SupabaseClient, User } from '@supabase/supabase-js';

declare namespace App {
  interface Locals {
    user: { id: string; email: string } | null;
    supabase: SupabaseClient;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly OPS_ALLOWED_EMAILS: string;
  readonly PUBLIC_DEMO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
