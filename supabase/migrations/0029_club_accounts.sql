-- Scluba — comptes club + invitations (Portail Club, brique fondation).
-- Un compte club = un auth.users (magic-link) lié à un club via club_users.
-- Run dans le SQL editor Supabase après les migrations précédentes.

-- =============================================================
-- club_users — liaison user ↔ club + rôle
-- =============================================================
create table if not exists public.club_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  role text not null check (role in ('admin','greenkeeper')),
  created_at timestamptz not null default now(),
  unique (user_id, club_id)
);

create index if not exists club_users_user_idx on public.club_users(user_id);
create index if not exists club_users_club_idx on public.club_users(club_id);

-- =============================================================
-- club_invites — token d'invitation usage-unique, expirable
-- =============================================================
create table if not exists public.club_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  club_id uuid not null references public.clubs(id) on delete cascade,
  role text not null check (role in ('admin','greenkeeper')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists club_invites_token_idx on public.club_invites(token);

-- =============================================================
-- RLS — un membre ne voit QUE les lignes de SON club.
-- Les écritures (création invite, consommation, insertion membership)
-- passent par le service-role (serviceClient), qui bypass RLS — on ne
-- définit donc pas de policy d'INSERT/UPDATE côté anon.
-- =============================================================
alter table public.club_users enable row level security;
alter table public.club_invites enable row level security;

drop policy if exists club_users_select_self_club on public.club_users;
create policy club_users_select_self_club on public.club_users
  for select using (
    club_id in (
      select cu.club_id from public.club_users cu where cu.user_id = auth.uid()
    )
  );

-- club_invites : pas de lecture côté anon (tout passe par serviceClient).
drop policy if exists club_invites_no_anon on public.club_invites;
create policy club_invites_no_anon on public.club_invites
  for select using (false);
