-- Klubba — harden the public `leads` table (CTAForm signups).
-- Run this once in the Supabase SQL editor.
--
-- Background: the marketing CTAForm POSTs to Supabase with the public anon key.
-- Without RLS + an explicit insert-only policy, the anon key could SELECT,
-- UPDATE, or DELETE every lead the site has ever collected.
--
-- This migration:
--   1. Enables RLS on `leads` (idempotent — safe to re-run).
--   2. Drops any over-permissive legacy policies we may have created.
--   3. Adds a single INSERT policy for `anon`. With no SELECT / UPDATE / DELETE
--      policies, those operations are denied by default for anon.
--   4. Adds CHECK constraints to bound text length (DoS / storage abuse).
--   5. Leaves the service role untouched — it bypasses RLS, so the /ops
--      dashboard keeps reading and writing as before.

alter table public.leads enable row level security;

drop policy if exists "leads_anon_insert"  on public.leads;
drop policy if exists "leads_anon_select"  on public.leads;
drop policy if exists "leads_anon_update"  on public.leads;
drop policy if exists "leads_anon_delete"  on public.leads;
drop policy if exists "leads_public_all"   on public.leads;
drop policy if exists "Enable insert for anon" on public.leads;

create policy "leads_anon_insert"
  on public.leads
  for insert
  to anon
  with check (
    char_length(coalesce(name, '')) between 1 and 120
    and char_length(coalesce(club, '')) between 1 and 120
    and char_length(coalesce(email, '')) between 3 and 254
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and char_length(coalesce(locale, '')) <= 8
    and char_length(coalesce(user_agent, '')) <= 512
  );

-- Defense in depth: enforce the same bounds at the column level so
-- a future policy regression can't ship oversized rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_name_len_chk'
  ) then
    alter table public.leads
      add constraint leads_name_len_chk check (char_length(coalesce(name, '')) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_club_len_chk'
  ) then
    alter table public.leads
      add constraint leads_club_len_chk check (char_length(coalesce(club, '')) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_email_len_chk'
  ) then
    alter table public.leads
      add constraint leads_email_len_chk check (char_length(coalesce(email, '')) <= 254);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_locale_len_chk'
  ) then
    alter table public.leads
      add constraint leads_locale_len_chk check (char_length(coalesce(locale, '')) <= 8);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_ua_len_chk'
  ) then
    alter table public.leads
      add constraint leads_ua_len_chk check (char_length(coalesce(user_agent, '')) <= 512);
  end if;
end$$;

-- Optional — uncomment after verifying there are no existing duplicates.
-- alter table public.leads
--   add constraint leads_email_club_unique unique (email, club);
