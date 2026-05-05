-- Scluba — schema for the internal ops dashboard.
-- Run this once in the Supabase SQL editor.

-- 1. Pipeline statuses (8 stages, ordered).
create type prospect_status as enum (
  'to_contact',
  'contacted',
  'in_discussion',
  'page_created',
  'qr_sent',
  'demo_scheduled',
  'active_client',
  'lost'
);

create type ops_owner as enum ('greg', 'paul', 'shared');

-- 2. CRM clubs being prospected.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  contact_name text,
  email text,
  phone text,
  city text,
  region text,
  status prospect_status not null default 'to_contact',
  owner ops_owner not null default 'shared',
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_status_idx on public.prospects(status);
create index if not exists prospects_owner_idx on public.prospects(owner);

-- 3. Timeline events (one per interaction with a prospect).
create type prospect_event_type as enum (
  'note',
  'email_sent',
  'call',
  'meeting',
  'page_created',
  'qr_sent',
  'demo_scheduled',
  'status_change'
);

create table if not exists public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  type prospect_event_type not null,
  body text,
  author text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_events_prospect_idx on public.prospect_events(prospect_id, created_at desc);

-- 4. Shared todo (between greg + paul).
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assignee ops_owner not null default 'shared',
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  prospect_id uuid references public.prospects(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists tasks_done_idx on public.tasks(done, due_date);

-- 5. Trigger to keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at
  before update on public.prospects
  for each row execute function public.touch_updated_at();

-- 6. RLS — locked down. Service role bypasses. The client never reads these.
alter table public.prospects enable row level security;
alter table public.prospect_events enable row level security;
alter table public.tasks enable row level security;

-- No policies = deny by default. The dashboard server uses the service role key,
-- which bypasses RLS. The public anon key has zero access to ops tables.

-- 7. Note about the existing `leads` table (CTAForm signups):
--    leave it as-is. The dashboard reads it through the service role too.
