-- Scluba — signalements de souci parcours (Portail Club, module signalements).
-- Le golfeur (cookie player, non authentifié Supabase) signale via serviceClient.
-- Le club (club_users) lit/résout via RLS. Requiert 0029_club_accounts.sql.

create table if not exists public.course_reports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete set null,
  hole_number int not null check (hole_number between 1 and 18),
  category text not null check (category in ('bunker','green','fairway','rough','equipement','autre')),
  comment text,
  status text not null default 'nouveau' check (status in ('nouveau','traite')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists course_reports_club_status_idx
  on public.course_reports(club_id, status, created_at desc);

-- RLS : un membre du club lit/modifie SES signalements. L'insertion golfeur
-- passe par serviceClient (bypass RLS), donc pas de policy INSERT anon.
alter table public.course_reports enable row level security;

drop policy if exists course_reports_select_member on public.course_reports;
create policy course_reports_select_member on public.course_reports
  for select using (
    club_id in (select cu.club_id from public.club_users cu where cu.user_id = auth.uid())
  );

drop policy if exists course_reports_update_member on public.course_reports;
create policy course_reports_update_member on public.course_reports
  for update using (
    club_id in (select cu.club_id from public.club_users cu where cu.user_id = auth.uid())
  );
