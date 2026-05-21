-- 0016 — security hardening generated from audit 2026-05-21 (C-supabase-rls-db.md)
-- Idempotent. Safe to re-run.
-- Manual deploy: Supabase SQL editor → paste and run.
--
-- ============================================================================
-- WHAT THIS MIGRATION DOES
-- ============================================================================
-- 1. CREATE public.leads (CRIT #1) — was never in any migration, so RLS state
--    was invisible to git. Codify table + RLS + INSERT-only anon policy with
--    CHECK constraints. Add ip_hash column and rate-limit dedup index.
-- 2. round-share-photos storage bucket (CRIT #3) — tighten INSERT/UPDATE
--    policies so anon can only write to objects whose path starts with
--    "<round_id>/" where round_id exists in public.rounds AND status <>
--    'finished'. Closes the "overwrite any round's cover photo" leak.
-- 3. CHECK constraints (HIGH/MED) — defence-in-depth length and format
--    constraints on clubs, round_players, rounds, prospects.
-- 4. scores.strokes (HIGH/MED) — tighten upper bound from 20 → 15.
-- 5. revoke column-level grant on round_players.user_id from anon (MED) —
--    closes auth.users.id ↔ display_name correlation leak without breaking
--    Realtime (Realtime still receives full row server-side; PostgREST
--    column grants only affect SELECT projections).
-- 6. revoke select on clubs(created_by, prospect_id) from anon (HIGH) —
--    closes admin-email leak. The /c/[slug] page already uses serviceClient()
--    so the wildcard SELECT policy stays but the sensitive columns are
--    column-revoked.
--
-- ============================================================================
-- !! BREAKING CHANGES / WHAT THIS MIGRATION DOES *NOT* DO !!
-- ============================================================================
--
-- CRIT #2 (anon can enumerate every round/player/score via `using (true)`)
-- is *NOT* fully closed by this migration.
--
-- Reason: Supabase Realtime `postgres_changes` channels require anon SELECT
-- access at the RLS layer to deliver change events to subscribers. The player
-- UI in src/lib/realtime.ts subscribes to:
--   - public.rounds        (filter: id=eq.<roundId>)
--   - public.round_players (filter: round_id=eq.<roundId>)
--   - public.scores        (no filter, client-side filtered)
--
-- Dropping the `using (true)` SELECT policy would silently break the live
-- multiplayer/host scoring flow for the June pilot. The correct fix is to
-- replace `postgres_changes` with Realtime Broadcast channels signed by the
-- /api/rounds/[shortCode]/* Workers (service-role), then drop anon SELECT.
--
-- Tracked as a separate app-side branch (NOT in this SQL-only PR):
--   - fix/sec-realtime-broadcast-migration  (NEEDS TO BE FILED)
-- See PR body for the exact file/line changes required in
-- src/lib/realtime.ts + src/pages/play.astro + recap.astro before this
-- migration can drop the wildcard SELECT.
--
-- Interim mitigation applied here:
--   * Column-revoke `round_players.user_id` from anon (no auth.users.id leak)
--   * Column-revoke `clubs.created_by` and `clubs.prospect_id` from anon
--   * Defer short_code length bump 6 → 8 to migration 0017 (backfill plan)
--
-- ============================================================================
-- Companion app-code branches (touch TypeScript/Astro, NOT this SQL PR):
--   - fix/sec-public-api-hardening
--   - fix/sec-llm-importer-ssrf
--   - fix/sec-headers-middleware-csp
--   - fix/sec-auth-cookies-ratelimit
--   - fix/sec-ops-injection-csrf
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.leads — codify schema + RLS (CRIT #1)
-- ---------------------------------------------------------------------------
-- Schema inferred from src/components/CTAForm.astro (maxlength=120 name/club,
-- 254 email), src/scripts/animations.ts (user_agent.slice(0, 512), locale),
-- src/lib/ops-types.ts (Lead interface).
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  club text not null,
  email text not null,
  locale text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

-- Idempotent CHECKs (drop-then-add pattern).
alter table public.leads drop constraint if exists leads_name_len;
alter table public.leads
  add constraint leads_name_len check (char_length(name) between 1 and 120);

alter table public.leads drop constraint if exists leads_club_len;
alter table public.leads
  add constraint leads_club_len check (char_length(club) between 1 and 120);

alter table public.leads drop constraint if exists leads_email_len;
alter table public.leads
  add constraint leads_email_len check (
    char_length(email) between 3 and 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

alter table public.leads drop constraint if exists leads_locale_enum;
alter table public.leads
  add constraint leads_locale_enum check (locale is null or locale in ('fr','en'));

alter table public.leads drop constraint if exists leads_user_agent_len;
alter table public.leads
  add constraint leads_user_agent_len check (
    user_agent is null or char_length(user_agent) <= 512
  );

alter table public.leads drop constraint if exists leads_ip_hash_len;
alter table public.leads
  add constraint leads_ip_hash_len check (
    ip_hash is null or char_length(ip_hash) <= 128
  );

-- Per-hour email dedup (partial unique index). Keeps a malicious bot from
-- spamming the same email > 1×/hour without burning a constraint slot.
create unique index if not exists leads_email_hour_uniq
  on public.leads (lower(email), date_trunc('hour', created_at));

create index if not exists leads_created_at_idx
  on public.leads (created_at desc);

alter table public.leads enable row level security;

-- Anon may INSERT only. No SELECT, no UPDATE, no DELETE.
-- The ops dashboard reads via serviceClient() and bypasses RLS.
drop policy if exists "leads insert anon" on public.leads;
create policy "leads insert anon"
  on public.leads for insert
  to anon, authenticated
  with check (
    char_length(name) between 1 and 120
    and char_length(club) between 1 and 120
    and char_length(email) between 3 and 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and (locale is null or locale in ('fr','en'))
    and (user_agent is null or char_length(user_agent) <= 512)
  );

-- Belt-and-suspenders: explicitly deny SELECT/UPDATE/DELETE for anon by
-- *not* creating policies. With RLS enabled and no matching policy, those
-- ops fail. Add an explicit DELETE deny just in case a future migration
-- accidentally adds a permissive policy.
drop policy if exists "leads no delete" on public.leads;
-- (No deny-by-default policy needed; absence of policy = deny under RLS.)


-- ---------------------------------------------------------------------------
-- 2. CRIT #2 (anon SELECT wildcard) — NOT CLOSED HERE. See header.
-- ---------------------------------------------------------------------------
-- Intentionally left in place to preserve Supabase Realtime postgres_changes
-- delivery to player devices. See "BREAKING CHANGES" section at top of file.
-- Column-level grant revokes applied below as a partial mitigation.


-- ---------------------------------------------------------------------------
-- 3. round-share-photos storage bucket — tighten anon write (CRIT #3)
-- ---------------------------------------------------------------------------
-- Drop the unconstrained anon INSERT/UPDATE and replace with a path-bound
-- predicate requiring the first path segment to be a valid uuid that exists
-- in public.rounds AND is not yet finished.
--
-- Caveat: an attacker who can list round ids (still possible until CRIT #2
-- is fully closed in the broadcast-channel migration) can still overwrite
-- the cover of any non-finished round whose id they know. The strategic
-- fix is the server-side /api/rounds/[shortCode]/photo.ts endpoint —
-- tracked in fix/sec-public-api-hardening. This migration cuts the path-
-- spam vector and the finished-rounds tampering vector.

drop policy if exists "round-share-photos write anon" on storage.objects;
create policy "round-share-photos write anon"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'round-share-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.rounds r
      where r.id::text = split_part(name, '/', 1)
        and r.status <> 'finished'
    )
  );

drop policy if exists "round-share-photos update anon" on storage.objects;
create policy "round-share-photos update anon"
  on storage.objects for update
  to anon, authenticated
  using (
    bucket_id = 'round-share-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.rounds r
      where r.id::text = split_part(name, '/', 1)
        and r.status <> 'finished'
    )
  )
  with check (
    bucket_id = 'round-share-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.rounds r
      where r.id::text = split_part(name, '/', 1)
        and r.status <> 'finished'
    )
  );

-- Tighten bucket-level MIME allowlist + size cap (defence in depth).
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/webp']
  where id = 'round-share-photos';

-- Same belt-and-braces for the club-assets bucket (LOW finding).
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/webp']
  where id = 'club-assets';


-- ---------------------------------------------------------------------------
-- 4. CHECK constraints on user-supplied text columns (HIGH/MED)
-- ---------------------------------------------------------------------------
-- All drop-then-add to be idempotent.

-- clubs ---------------------------------------------------------------------
alter table public.clubs drop constraint if exists clubs_name_len;
alter table public.clubs
  add constraint clubs_name_len check (char_length(name) between 1 and 120);

alter table public.clubs drop constraint if exists clubs_slug_fmt;
alter table public.clubs
  add constraint clubs_slug_fmt check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 60
  );

alter table public.clubs drop constraint if exists clubs_city_len;
alter table public.clubs
  add constraint clubs_city_len check (city is null or char_length(city) <= 120);

alter table public.clubs drop constraint if exists clubs_primary_color_hex;
alter table public.clubs
  add constraint clubs_primary_color_hex check (
    primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'
  );

alter table public.clubs drop constraint if exists clubs_logo_url_len;
alter table public.clubs
  add constraint clubs_logo_url_len check (
    logo_url is null or char_length(logo_url) <= 2048
  );

alter table public.clubs drop constraint if exists clubs_photo_url_len;
alter table public.clubs
  add constraint clubs_photo_url_len check (
    photo_url is null or char_length(photo_url) <= 2048
  );

alter table public.clubs drop constraint if exists clubs_created_by_len;
alter table public.clubs
  add constraint clubs_created_by_len check (
    created_by is null or char_length(created_by) <= 320
  );

alter table public.clubs drop constraint if exists clubs_lat_range;
alter table public.clubs
  add constraint clubs_lat_range check (
    latitude is null or latitude between -90 and 90
  );

alter table public.clubs drop constraint if exists clubs_lon_range;
alter table public.clubs
  add constraint clubs_lon_range check (
    longitude is null or longitude between -180 and 180
  );

-- 32KB cap on course_data jsonb (avoids 10MB blob inserts via service role).
alter table public.clubs drop constraint if exists clubs_course_data_size;
alter table public.clubs
  add constraint clubs_course_data_size check (
    pg_column_size(course_data) < 32768
  );

-- round_players -------------------------------------------------------------
alter table public.round_players drop constraint if exists rp_display_name_len;
alter table public.round_players
  add constraint rp_display_name_len check (
    char_length(display_name) between 1 and 40
  );

-- rounds --------------------------------------------------------------------
-- short_code regex accepts 4..8 for forward-compat with 0017 length bump.
alter table public.rounds drop constraint if exists rounds_short_code_fmt;
alter table public.rounds
  add constraint rounds_short_code_fmt check (
    short_code ~ '^[A-Z0-9]{4,8}$'
  );

alter table public.rounds drop constraint if exists rounds_comment_len;
alter table public.rounds
  add constraint rounds_comment_len check (
    comment is null or char_length(comment) <= 200
  );

alter table public.rounds drop constraint if exists rounds_format_id_fmt;
alter table public.rounds
  add constraint rounds_format_id_fmt check (
    format_id is null or (format_id ~ '^[a-z0-9-]{1,32}$')
  );

alter table public.rounds drop constraint if exists rounds_share_photo_url_len;
alter table public.rounds
  add constraint rounds_share_photo_url_len check (
    share_photo_url is null or char_length(share_photo_url) <= 2048
  );

-- prospects -----------------------------------------------------------------
alter table public.prospects drop constraint if exists prospects_club_name_len;
alter table public.prospects
  add constraint prospects_club_name_len check (
    char_length(club_name) between 1 and 255
  );

alter table public.prospects drop constraint if exists prospects_contact_name_len;
alter table public.prospects
  add constraint prospects_contact_name_len check (
    contact_name is null or char_length(contact_name) <= 255
  );

alter table public.prospects drop constraint if exists prospects_email_len;
alter table public.prospects
  add constraint prospects_email_len check (
    email is null or char_length(email) <= 320
  );

alter table public.prospects drop constraint if exists prospects_phone_len;
alter table public.prospects
  add constraint prospects_phone_len check (
    phone is null or char_length(phone) <= 40
  );

alter table public.prospects drop constraint if exists prospects_city_len;
alter table public.prospects
  add constraint prospects_city_len check (
    city is null or char_length(city) <= 120
  );

alter table public.prospects drop constraint if exists prospects_region_len;
alter table public.prospects
  add constraint prospects_region_len check (
    region is null or char_length(region) <= 120
  );

alter table public.prospects drop constraint if exists prospects_notes_len;
alter table public.prospects
  add constraint prospects_notes_len check (
    notes is null or char_length(notes) <= 10000
  );

alter table public.prospects drop constraint if exists prospects_source_len;
alter table public.prospects
  add constraint prospects_source_len check (
    source is null or char_length(source) <= 255
  );

-- prospect_events -----------------------------------------------------------
alter table public.prospect_events drop constraint if exists pe_body_len;
alter table public.prospect_events
  add constraint pe_body_len check (
    body is null or char_length(body) <= 10000
  );

alter table public.prospect_events drop constraint if exists pe_author_len;
alter table public.prospect_events
  add constraint pe_author_len check (
    author is null or char_length(author) <= 320
  );

-- tasks ---------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_title_len;
alter table public.tasks
  add constraint tasks_title_len check (
    char_length(title) between 1 and 500
  );

alter table public.tasks drop constraint if exists tasks_description_len;
alter table public.tasks
  add constraint tasks_description_len check (
    description is null or char_length(description) <= 4000
  );

alter table public.tasks drop constraint if exists tasks_created_by_len;
alter table public.tasks
  add constraint tasks_created_by_len check (
    created_by is null or char_length(created_by) <= 320
  );


-- ---------------------------------------------------------------------------
-- 5. scores.strokes 1..15 (HIGH/MED)
-- ---------------------------------------------------------------------------
-- Tighten max stroke count from 20 to 15 (par+10 worst case, well above real-
-- world Maximum Score rule of par+5). The original constraint name was
-- auto-generated as scores_strokes_check; the new one is scores_strokes_range.
do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
      where conrelid = 'public.scores'::regclass
        and conname in ('scores_strokes_check', 'scores_strokes_range')
  loop
    execute format('alter table public.scores drop constraint %I', c);
  end loop;
end $$;

alter table public.scores
  add constraint scores_strokes_range check (
    strokes is null or strokes between 1 and 15
  );


-- ---------------------------------------------------------------------------
-- 6. Column-level grant revokes (partial mitigation for CRIT #2 and HIGH #6)
-- ---------------------------------------------------------------------------
-- Keep the wildcard RLS SELECT policy in place (Realtime needs it) but strip
-- the sensitive columns from the anon-visible projection.

-- round_players.user_id (linkable identity) — anon should not see this.
revoke select (user_id) on public.round_players from anon;
revoke select (user_id) on public.round_players from authenticated;

-- clubs.created_by (admin email) and clubs.prospect_id (FK reveals prospect).
revoke select (created_by) on public.clubs from anon;
revoke select (prospect_id) on public.clubs from anon;
-- Note: authenticated still sees these because the OPS dashboard reads via
-- service-role anyway; safer to revoke from both, but no use case requires
-- authenticated anon-tier access.
revoke select (created_by) on public.clubs from authenticated;
revoke select (prospect_id) on public.clubs from authenticated;


commit;
