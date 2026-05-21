-- 0018 — network_contacts: annuaire écosystème FFGolf (chaînes, ligues, asso pros)
--
-- Suivi de 21 contacts d'intro institutionnelle, séparé des prospects-clubs (table
-- `prospects` créée en 0001). Pipeline simple à 4 statuts, log des intros faites
-- en text[]. Accès service_role uniquement (admin /ops via middleware d'auth).

-- Postgres n'a pas de "create type if not exists" — wrapper en DO block pour idempotence.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'network_org_type') then
    create type public.network_org_type as enum ('chaine', 'ligue', 'asso');
  end if;
  if not exists (select 1 from pg_type where typname = 'network_status') then
    create type public.network_status as enum ('to_contact', 'contacted', 'intro_done', 'dead');
  end if;
end $$;

create table if not exists public.network_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  org text not null,
  org_type public.network_org_type not null,
  region text,
  email text,
  phone text,
  website text,
  status public.network_status not null default 'to_contact',
  notes text,
  intros_made text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists network_contacts_org_type_idx on public.network_contacts(org_type);
create index if not exists network_contacts_status_idx on public.network_contacts(status);
create index if not exists network_contacts_region_idx on public.network_contacts(region);

-- Réutilise la fonction touch_updated_at() créée en 0001_ops_schema.sql
drop trigger if exists network_contacts_updated_at on public.network_contacts;
create trigger network_contacts_updated_at
  before update on public.network_contacts
  for each row execute function public.touch_updated_at();

alter table public.network_contacts enable row level security;
-- Aucune policy publique : seul le service_role accède (utilisé par /ops via serviceClient()).
