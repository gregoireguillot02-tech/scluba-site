-- Scluba — clubs + rounds + scores schema (PR A: 1 club, 1 partie solo).
-- Run in the Supabase SQL editor after 0001_ops_schema.sql.

-- =============================================================
-- 1. clubs — one row per club with a live QR-linked page.
-- =============================================================
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects(id) on delete set null,
  slug text not null unique,
  name text not null,
  city text,
  logo_url text,
  photo_url text,
  primary_color text,
  course_data jsonb not null default jsonb_build_object(
    'holes', jsonb_build_array(
      jsonb_build_object('number',  1, 'par', 4),
      jsonb_build_object('number',  2, 'par', 5),
      jsonb_build_object('number',  3, 'par', 3),
      jsonb_build_object('number',  4, 'par', 4),
      jsonb_build_object('number',  5, 'par', 4),
      jsonb_build_object('number',  6, 'par', 5),
      jsonb_build_object('number',  7, 'par', 3),
      jsonb_build_object('number',  8, 'par', 4),
      jsonb_build_object('number',  9, 'par', 4),
      jsonb_build_object('number', 10, 'par', 4),
      jsonb_build_object('number', 11, 'par', 3),
      jsonb_build_object('number', 12, 'par', 5),
      jsonb_build_object('number', 13, 'par', 4),
      jsonb_build_object('number', 14, 'par', 4),
      jsonb_build_object('number', 15, 'par', 3),
      jsonb_build_object('number', 16, 'par', 5),
      jsonb_build_object('number', 17, 'par', 4),
      jsonb_build_object('number', 18, 'par', 4)
    )
  ),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clubs_slug_idx on public.clubs(slug);
create index if not exists clubs_prospect_idx on public.clubs(prospect_id);

drop trigger if exists clubs_updated_at on public.clubs;
create trigger clubs_updated_at
  before update on public.clubs
  for each row execute function public.touch_updated_at();

-- =============================================================
-- 2. rounds — one row per game played at a club.
-- =============================================================
create type round_status as enum ('lobby', 'playing', 'finished');

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  short_code text not null unique,
  status round_status not null default 'lobby',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rounds_club_idx on public.rounds(club_id, created_at desc);
create index if not exists rounds_short_code_idx on public.rounds(short_code);

-- =============================================================
-- 3. round_players — players in a round (anonymous or logged-in).
-- =============================================================
create table if not exists public.round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  display_name text not null,
  user_id uuid,
  is_creator boolean not null default false,
  joined_at timestamptz not null default now()
);

create index if not exists round_players_round_idx on public.round_players(round_id, joined_at);

-- =============================================================
-- 4. scores — one row per (player × hole), upserted as the round progresses.
-- =============================================================
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  round_player_id uuid not null references public.round_players(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  strokes int not null check (strokes between 1 and 20),
  updated_at timestamptz not null default now(),
  unique (round_player_id, hole_number)
);

create index if not exists scores_round_player_idx on public.scores(round_player_id, hole_number);

drop trigger if exists scores_updated_at on public.scores;
create trigger scores_updated_at
  before update on public.scores
  for each row execute function public.touch_updated_at();

-- =============================================================
-- 5. RLS — server-side flows go through the service role and bypass RLS.
--    Public anon clients get read-only access to clubs (the page is anonymous)
--    and to rounds/players/scores by short_code (PR A defers RPC enforcement to API).
-- =============================================================
alter table public.clubs enable row level security;
alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.scores enable row level security;

-- clubs: anyone can read a club row (the public page needs it). Writes go through service role.
drop policy if exists "clubs read public" on public.clubs;
create policy "clubs read public"
  on public.clubs for select
  to anon, authenticated
  using (true);

-- rounds / round_players / scores: no anon policies in PR A.
-- The /api/rounds endpoints use the service role and validate short_code themselves.
-- PR B will add policies to allow direct anon reads via Supabase Realtime channels.

-- =============================================================
-- 6. Seed — one test club so /c/scluba-test works out of the box.
-- =============================================================
insert into public.clubs (slug, name, city, primary_color, created_by)
values ('scluba-test', 'Club de test Scluba', 'Caen', '#1B4332', 'system')
on conflict (slug) do nothing;
