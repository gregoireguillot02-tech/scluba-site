-- Portail Club v2 — accès par ALLOWLIST D'EMAILS (remplace les invitations à
-- usage unique de 0029). Tu pré-autorises (email + rôle) un membre depuis /ops ;
-- il se connecte sur /club avec cet email (magic-link). Pas de lien-secret.
-- Les tables club_users / club_invites de 0029 étaient vides → on les remplace.

-- Les policies de course_reports (0030) référencent club_users → les retirer
-- avant de dropper la table.
drop policy if exists course_reports_select_member on public.course_reports;
drop policy if exists course_reports_update_member on public.course_reports;

drop table if exists public.club_invites;
drop table if exists public.club_users;

-- =============================================================
-- club_members — allowlist (club_id, email) + rôle, gérée depuis /ops
-- =============================================================
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','greenkeeper')),
  created_at timestamptz not null default now(),
  unique (club_id, email)
);
create index if not exists club_members_email_idx on public.club_members(email);
create index if not exists club_members_club_idx on public.club_members(club_id);

-- =============================================================
-- RLS. La résolution de membership et toutes les requêtes portail passent par
-- le service-role (serviceClient, bypass RLS). On garde des policies cohérentes
-- avec le modèle email comme defense-in-depth (auth.jwt() ->> 'email').
-- =============================================================
alter table public.club_members enable row level security;
-- Lecture de l'allowlist : uniquement service-role (rien via anon/auth).
drop policy if exists club_members_no_anon on public.club_members;
create policy club_members_no_anon on public.club_members for select using (false);

alter table public.course_reports enable row level security;
drop policy if exists course_reports_select_member on public.course_reports;
create policy course_reports_select_member on public.course_reports
  for select using (
    club_id in (
      select cm.club_id from public.club_members cm
      where lower(cm.email) = lower(auth.jwt() ->> 'email')
    )
  );
drop policy if exists course_reports_update_member on public.course_reports;
create policy course_reports_update_member on public.course_reports
  for update using (
    club_id in (
      select cm.club_id from public.club_members cm
      where lower(cm.email) = lower(auth.jwt() ->> 'email')
    )
  );
